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
  type ProvenanceRecord,
} from "@specgate/provenance";

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
  readonly provenance = new InMemoryProvenanceStore();
  private readonly now: () => string;
  private readonly semanticClient?: SemanticClient;
  private readonly assistantClient?: SpecAssistantClient;

  constructor(
    private readonly config: SpecGateConfig,
    opts: {
      now?: () => string;
      store?: InMemoryStore;
      semanticClient?: SemanticClient;
      assistantClient?: SpecAssistantClient;
    } = {},
  ) {
    this.registry = new Registry(opts.store ?? new InMemoryStore());
    this.now = opts.now ?? (() => new Date().toISOString());
    this.semanticClient = opts.semanticClient;
    this.assistantClient = opts.assistantClient;
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

  /** Run the verification harness for a spec (separate stage from generation). */
  verify(specId: string): HarnessResult {
    const entry = this.specs.get(specId);
    if (!entry) throw new Error(`unknown spec ${specId}`);
    return runHarness({ spec: entry.parsed, finalTier: entry.tier.finalTier, config: this.config });
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
    };
  }
}
