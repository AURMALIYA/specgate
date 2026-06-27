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
  at: string;
}

interface SpecEntry {
  parsed: ParsedSpec;
  raw: string;
  tier: TierResult;
}

/**
 * The SpecGate backend service: ingests specs, runs the gate + tier engine,
 * drives the delivery-loop state machine, runs the verification harness, and
 * records generation provenance + drift. State is in-memory and pluggable.
 */
export class SpecGateService {
  private readonly specs = new Map<string, SpecEntry>();
  private readonly instances = new Map<string, WorkflowInstance>();
  readonly registry: Registry;
  readonly provenance = new InMemoryProvenanceStore();
  private readonly now: () => string;

  constructor(
    private readonly config: SpecGateConfig,
    opts: { now?: () => string; store?: InMemoryStore } = {},
  ) {
    this.registry = new Registry(opts.store ?? new InMemoryStore());
    this.now = opts.now ?? (() => new Date().toISOString());
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
    this.specs.set(parsed.frontmatter.id, { parsed, raw, tier });
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

  /** Basic operational metrics (expanded into the observability API in Phase 4). */
  metrics(): { total: number; byState: Record<WorkflowState, number>; generations: number } {
    const byState = {} as Record<WorkflowState, number>;
    for (const i of this.instances.values()) {
      byState[i.state] = (byState[i.state] ?? 0) + 1;
    }
    return { total: this.instances.size, byState, generations: this.provenance.all().length };
  }
}
