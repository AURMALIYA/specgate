import type { SpecGateConfig } from "@specgate/config";
import { runGate, type GateReport } from "@specgate/gate";
import { classifyTier, type TierResult } from "@specgate/risk-tier";
import { validateSpec, type ParsedSpec } from "@specgate/spec-schema";
import { InMemoryStore, Registry } from "@specgate/registry";
import {
  applyEvent,
  createInstance,
  type TransitionResult,
  type WorkflowEvent,
  type WorkflowInstance,
  type WorkflowState,
} from "@specgate/workflow";
import { runHarness, type HarnessResult } from "@specgate/verification";
import { coAuthorSpec, type CoAuthorResult, type SpecAssistantClient } from "@specgate/spec-assistant";
import {
  DryRunTarget,
  runEligibility,
  type DispatchResult,
  type Eligibility,
  type GenerationBrief,
  type GenerationTarget,
} from "@specgate/dispatch";
import {
  runDeterministicConflicts,
  runSemanticConflicts,
  selectRelatedSpecIds,
  type ConflictFinding,
  type SemanticClient,
} from "@specgate/conflict-engine";
import {
  detectDrift,
  hashContent,
  InMemoryProvenanceStore,
  type DeployedArtifact,
  type DriftFinding,
  type OverrideEvent,
  type ProvenanceRecord,
  type ProvenanceStore,
} from "@specgate/provenance";
import { DryRunMerger, type MergeResult, type PullRequestMerger } from "@specgate/scm-adapter";
import { isSafetyInvariant } from "./safety.js";

export interface IngestResult {
  specId: string;
  tier: TierResult;
  gate: GateReport;
  instance: WorkflowInstance;
}

export interface RecordGenerationInput {
  specId: string;
  promptContextRef: string;
  /** Generated artifacts with their content (hashed for snapshots). */
  artifacts: { ref: string; content: string }[];
  pinnedModel?: string;
  /** Optional cost (e.g. USD or tokens) attributed to this generation. */
  cost?: number;
  at: string;
}

export interface DefectInput {
  specId: string;
  /** Lifecycle phase the defect was found in (e.g. "verification", "uat", "production"). */
  phase: string;
  description: string;
  at: string;
}

export interface SpecGateMetrics {
  total: number;
  byState: Record<string, number>;
  tierDistribution: Record<string, number>;
  gate: { pass: number; fail: number };
  generations: number;
  /** Fraction of generated specs that were generated more than once. */
  regenerationRate: number;
  /** Defects found after sign-off, over specs that reached READY_FOR_UAT/DONE. */
  defectEscapeRate: number;
  conflictCountsByType: Record<string, number>;
  /** Fraction of specs using a custom/non-standard surface (standard-first rule). */
  customVsStandardRatio: number;
  /** Average recorded cost per generation (0 when no costs recorded). */
  costPerGeneration: number;
  /** Total admin overrides recorded. */
  overrides: number;
  /** Overrides that bypassed a safety invariant (flagged loudly). */
  safetyInvariantOverrides: number;
}

interface SpecEntry {
  parsed: ParsedSpec;
  raw: string;
  tier: TierResult;
  gateOk: boolean;
  usesCustom: boolean;
}

/**
 * The SpecGate backend service: ingests specs, runs the gate + tier engine,
 * drives the delivery-loop state machine, runs the verification harness, and
 * records generation provenance + drift. State is in-memory and pluggable.
 */
export class SpecGateService {
  private readonly specs = new Map<string, SpecEntry>();
  private readonly instances = new Map<string, WorkflowInstance>();
  private readonly defects: DefectInput[] = [];
  private readonly costs: number[] = [];
  readonly registry: Registry;
  readonly provenance: ProvenanceStore;
  private readonly now: () => string;
  private readonly semanticClient?: SemanticClient;
  private readonly assistantClient?: SpecAssistantClient;
  private readonly target: GenerationTarget;
  private readonly merger: PullRequestMerger;
  /** Default repo ("owner/name") for git-based dispatch, when not per-spec. */
  private readonly defaultRepo?: string;

  constructor(
    private readonly config: SpecGateConfig,
    opts: {
      now?: () => string;
      store?: InMemoryStore;
      semanticClient?: SemanticClient;
      assistantClient?: SpecAssistantClient;
      generationTarget?: GenerationTarget;
      merger?: PullRequestMerger;
      provenanceStore?: ProvenanceStore;
      defaultRepo?: string;
    } = {},
  ) {
    this.registry = new Registry(opts.store ?? new InMemoryStore());
    this.provenance = opts.provenanceStore ?? new InMemoryProvenanceStore();
    this.now = opts.now ?? (() => new Date().toISOString());
    this.semanticClient = opts.semanticClient;
    this.assistantClient = opts.assistantClient;
    this.target = opts.generationTarget ?? new DryRunTarget();
    this.merger = opts.merger ?? new DryRunMerger();
    this.defaultRepo = opts.defaultRepo;
  }

  /** Distinct blocking finding codes for a spec (per-spec gate + cross-spec conflicts). */
  private blockingCodes(specId: string): string[] {
    const entry = this.specs.get(specId);
    if (!entry) return [];
    const gateCodes = runGate({ raw: entry.raw, config: this.config }).findings
      .filter((f) => f.severity === "block")
      .map((f) => f.code);
    const conflictCodes = this.conflicts()
      .filter((c) => c.severity === "block" && c.specIds.includes(specId))
      .map((c) => `conflict.${c.type}`);
    return [...new Set([...gateCodes, ...conflictCodes])];
  }

  /**
   * Record an admin override (full override: any finding). Requires a written
   * justification; writes an immutable audit event. A blanket override (no
   * findingCode) covers every current blocking finding.
   */
  override(input: { specId: string; actor: string; justification: string; findingCode?: string; at?: string }): OverrideEvent {
    if (!this.specs.has(input.specId)) throw new Error(`unknown spec ${input.specId}`);
    if (!input.justification?.trim()) {
      throw Object.assign(new Error("an override requires a written justification"), { status: 400 });
    }
    const blocking = this.blockingCodes(input.specId);
    const coveredCodes = input.findingCode ? [input.findingCode] : blocking;
    const event: OverrideEvent = {
      specId: input.specId,
      actor: input.actor,
      at: input.at ?? this.now(),
      justification: input.justification.trim(),
      coveredCodes,
      safetyInvariant: coveredCodes.some(isSafetyInvariant),
    };
    this.provenance.recordOverride(event);
    return event;
  }

  overridesForSpec(specId: string): OverrideEvent[] {
    return this.provenance.overridesForSpec(specId);
  }

  /** Can the spec be merged? (Gate clean, or every blocking finding overridden.) */
  canMerge(specId: string): { allowed: boolean; reasons: string[] } {
    const entry = this.specs.get(specId);
    if (!entry) throw new Error(`unknown spec ${specId}`);
    const blocking = this.blockingCodes(specId);
    if (blocking.length === 0) return { allowed: true, reasons: [] };
    const covered = new Set(this.overridesForSpec(specId).flatMap((o) => o.coveredCodes));
    const uncovered = blocking.filter((c) => !covered.has(c));
    return uncovered.length === 0
      ? { allowed: true, reasons: [`${blocking.length} blocking finding(s) overridden`] }
      : { allowed: false, reasons: [`unresolved & not overridden: ${uncovered.join(", ")}`] };
  }

  /** Merge the spec's PR — only when the gate is clean or all blocks are overridden. */
  async merge(input: { specId: string; prNumber?: number; method?: "merge" | "squash" | "rebase" }): Promise<{ merged: boolean; reasons: string[]; result?: MergeResult }> {
    const verdict = this.canMerge(input.specId);
    if (!verdict.allowed) return { merged: false, reasons: verdict.reasons };
    const result = await this.merger.merge({
      repo: this.defaultRepo ?? "unset",
      prNumber: input.prNumber ?? 0,
      method: input.method,
    });
    return { merged: result.merged, reasons: verdict.reasons, result };
  }

  /** Whether an LLM spec co-author is wired in. */
  get assistantAvailable(): boolean {
    return !!this.assistantClient;
  }

  /**
   * Co-author loop: iteratively ask the assistant to revise a draft until it
   * passes the gate (or no longer improves). The gate remains the source of
   * truth — the assistant's output is always re-gated, never trusted.
   */
  async coAuthor(raw: string, maxRounds?: number): Promise<CoAuthorResult> {
    if (!this.assistantClient) throw new Error("Spec assistant is not configured.");
    return coAuthorSpec({ raw, config: this.config, client: this.assistantClient, maxRounds });
  }

  /** Ingest a spec, run the gate + tier engine, and create a DRAFT instance. */
  ingest(raw: string, path?: string): IngestResult {
    const validation = validateSpec(raw, this.config, { path });
    const parsed = validation.parsed;
    if (!parsed) {
      throw new Error(`spec did not parse: ${validation.findings.map((f) => f.message).join("; ")}`);
    }
    const gate = runGate({ raw, config: this.config, path });
    const tier = classifyTier(this.config, { spec: parsed });
    const usesCustom = gate.findings.some((f) => f.code === "policy.standard-first-justification");
    this.specs.set(parsed.frontmatter.id, { parsed, raw, tier, gateOk: gate.ok, usesCustom });
    this.registry.ingest(parsed);
    const instance = createInstance(parsed.frontmatter.id, tier.finalTier, this.config);
    this.instances.set(parsed.frontmatter.id, instance);
    return { specId: parsed.frontmatter.id, tier, gate, instance };
  }

  getInstance(specId: string): WorkflowInstance | undefined {
    return this.instances.get(specId);
  }

  listInstances(): WorkflowInstance[] {
    return [...this.instances.values()];
  }

  /** Apply a workflow event; persists the new instance when accepted. */
  transition(specId: string, event: WorkflowEvent): TransitionResult {
    const instance = this.instances.get(specId);
    if (!instance) throw new Error(`unknown spec ${specId}`);
    const result = applyEvent(instance, event);
    if (result.ok) this.instances.set(specId, result.instance);
    return result;
  }

  /**
   * One aggregated view of everything the engine knows about a spec — for the
   * dashboard detail view: parsed model, re-derived tier, gate findings,
   * verification harness, conflicts, workflow state, provenance, and overrides.
   */
  specDetail(specId: string) {
    const entry = this.specs.get(specId);
    const instance = this.instances.get(specId);
    if (!entry || !instance) throw new Error(`unknown spec ${specId}`);
    const gate = runGate({ raw: entry.raw, config: this.config });
    return {
      id: specId,
      frontmatter: entry.parsed.frontmatter,
      sections: Object.keys(entry.parsed.sections),
      accessMatrix: entry.parsed.accessMatrix,
      criteria: entry.parsed.criteria,
      contentHash: entry.parsed.contentHash,
      tier: entry.tier,
      gate: { ok: gate.ok, blockCount: gate.blockCount, warnCount: gate.warnCount, findings: gate.findings, manualChecklist: gate.manualChecklist },
      verification: this.verify(specId),
      conflicts: this.conflicts().filter((c) => c.specIds.includes(specId)),
      instance,
      eligibility: this.runEligibility(specId),
      canMerge: this.canMerge(specId),
      provenance: this.provenance.bySpec(specId),
      snapshots: this.provenance.snapshotsForSpec(specId),
      overrides: this.overridesForSpec(specId),
    };
  }

  /** Run the verification harness for a spec (separate stage from generation). */
  verify(specId: string): HarnessResult {
    const entry = this.specs.get(specId);
    if (!entry) throw new Error(`unknown spec ${specId}`);
    return runHarness({ spec: entry.parsed, finalTier: entry.tier.finalTier, config: this.config });
  }

  /** Is the spec eligible to run? (APPROVED + clean gate + no blocking conflicts.) */
  runEligibility(specId: string): Eligibility {
    const entry = this.specs.get(specId);
    const instance = this.instances.get(specId);
    if (!entry || !instance) throw new Error(`unknown spec ${specId}`);
    const gate = runGate({ raw: entry.raw, config: this.config });
    const blockingConflicts = this.conflicts().filter(
      (c) => c.severity === "block" && c.specIds.includes(specId),
    ).length;
    return runEligibility({ state: instance.state, gateOk: gate.ok, blockingConflicts });
  }

  /**
   * Run the code from an approved spec: check eligibility, dispatch the spec to
   * the generation target, record provenance, and move APPROVED → GENERATING.
   * Returns the eligibility verdict; dispatch only happens when eligible.
   */
  async run(specId: string, at?: string): Promise<{ eligibility: Eligibility; dispatch?: DispatchResult; instance: WorkflowInstance }> {
    const entry = this.specs.get(specId);
    const instance = this.instances.get(specId);
    if (!entry || !instance) throw new Error(`unknown spec ${specId}`);

    const eligibility = this.runEligibility(specId);
    if (!eligibility.eligible) return { eligibility, instance };

    const timestamp = at ?? this.now();
    const brief: GenerationBrief = {
      specId,
      title: entry.parsed.frontmatter.title,
      specContentHash: entry.parsed.contentHash,
      specMarkdown: entry.raw,
      tier: entry.tier.finalTier,
      requiredApproverRoles: entry.tier.requiredApproverRoles,
      repo: this.defaultRepo,
    };
    const dispatch = await this.target.dispatch(brief);

    this.provenance.record({
      specId,
      specContentHash: entry.parsed.contentHash,
      pinnedModel: this.config.semantic?.model ?? "unset",
      promptContextRef: brief.promptContextRef ?? "",
      timestamp,
      generatedArtifactRefs: [],
      dispatchTarget: dispatch.target,
      dispatchHandle: dispatch.handle,
      gitRef: dispatch.gitRef,
    });

    const transition = applyEvent(instance, { type: "startGeneration", generatorId: `target:${dispatch.target}`, at: timestamp });
    if (transition.ok) this.instances.set(specId, transition.instance);
    return { eligibility, dispatch, instance: transition.ok ? transition.instance : instance };
  }

  /** Record generation provenance and capture artifact snapshots for drift. */
  recordGeneration(input: RecordGenerationInput): ProvenanceRecord {
    const entry = this.specs.get(input.specId);
    if (!entry) throw new Error(`unknown spec ${input.specId}`);
    const pinnedModel = input.pinnedModel ?? this.config.semantic?.model ?? "unset";
    const record: ProvenanceRecord = {
      specId: input.specId,
      specContentHash: entry.parsed.contentHash,
      pinnedModel,
      promptContextRef: input.promptContextRef,
      timestamp: input.at,
      generatedArtifactRefs: input.artifacts.map((a) => a.ref),
    };
    this.provenance.record(record);
    if (typeof input.cost === "number") this.costs.push(input.cost);
    for (const a of input.artifacts) {
      this.provenance.putSnapshot({
        specId: input.specId,
        artifactRef: a.ref,
        hash: hashContent(a.content),
        timestamp: input.at,
      });
    }
    return record;
  }

  /** Detect drift between recorded snapshots and the currently deployed artifacts. */
  drift(deployed: DeployedArtifact[]): DriftFinding[] {
    return detectDrift(this.provenance.allSnapshots(), deployed);
  }

  /** Record a defect found in a given lifecycle phase (drives defect-escape rate). */
  recordDefect(input: DefectInput): void {
    this.defects.push(input);
  }

  /** All cross-spec deterministic conflicts over the current registry. */
  conflicts(): ConflictFinding[] {
    return runDeterministicConflicts(this.registry);
  }

  /** Snapshot of the registry contents. */
  registrySpecs() {
    return this.registry.allSpecs();
  }

  /**
   * Run the advisory semantic layer for a spec, against its related registry
   * specs. Returns [] when no client is configured or the layer is disabled.
   */
  async semantic(specId: string): Promise<ConflictFinding[]> {
    const entry = this.specs.get(specId);
    if (!entry || !this.semanticClient) return [];
    const relatedIds = selectRelatedSpecIds(
      this.registry,
      specId,
      this.config.semantic?.maxRelatedSpecs ?? 5,
    );
    const related = relatedIds
      .map((id) => this.specs.get(id)?.parsed)
      .filter((p): p is ParsedSpec => !!p);
    return runSemanticConflicts({
      target: entry.parsed,
      related,
      config: this.config,
      client: this.semanticClient,
    });
  }

  /** Observability metrics for the dashboard. */
  metrics(): SpecGateMetrics {
    const byState: Record<string, number> = {};
    const tierDistribution: Record<string, number> = {};
    for (const i of this.instances.values()) {
      byState[i.state] = (byState[i.state] ?? 0) + 1;
      tierDistribution[i.finalTier] = (tierDistribution[i.finalTier] ?? 0) + 1;
    }

    let pass = 0;
    let fail = 0;
    let customCount = 0;
    for (const e of this.specs.values()) {
      if (e.gateOk) pass++;
      else fail++;
      if (e.usesCustom) customCount++;
    }

    const generationRecords = this.provenance.all();
    const generations = generationRecords.length;
    const generatedSpecs = new Set(generationRecords.map((r) => r.specId));
    const regeneratedSpecs = [...generatedSpecs].filter(
      (id) => generationRecords.filter((r) => r.specId === id).length > 1,
    ).length;
    const regenerationRate = generatedSpecs.size ? regeneratedSpecs / generatedSpecs.size : 0;

    const reachedSignoff = [...this.instances.values()].filter((i) =>
      ["READY_FOR_UAT", "DONE"].includes(i.state),
    ).length;
    const escapedDefects = this.defects.filter((d) => ["uat", "production"].includes(d.phase)).length;
    const defectEscapeRate = reachedSignoff ? escapedDefects / reachedSignoff : 0;

    const conflictCountsByType: Record<string, number> = {};
    for (const c of this.conflicts()) {
      conflictCountsByType[c.type] = (conflictCountsByType[c.type] ?? 0) + 1;
    }

    const total = this.specs.size;
    const costPerGeneration = this.costs.length
      ? this.costs.reduce((a, b) => a + b, 0) / this.costs.length
      : 0;

    return {
      total: this.instances.size,
      byState,
      tierDistribution,
      gate: { pass, fail },
      generations,
      regenerationRate,
      defectEscapeRate,
      conflictCountsByType,
      customVsStandardRatio: total ? customCount / total : 0,
      costPerGeneration,
      overrides: this.provenance.overrides().length,
      safetyInvariantOverrides: this.provenance.overrides().filter((o) => o.safetyInvariant).length,
    };
  }
}
