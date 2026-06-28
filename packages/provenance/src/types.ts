/** A generation provenance record. Specs stay tool-portable; agent-specific
 * content lives here, never in the spec body. */
export interface ProvenanceRecord {
  specId: string;
  /** Content hash of the spec that drove the generation. */
  specContentHash: string;
  /** The model id pinned at generation time (from config). */
  pinnedModel: string;
  /** Reference to the prompt-context used (path / object key / digest). */
  promptContextRef: string;
  /** ISO timestamp supplied by the caller. */
  timestamp: string;
  /** References to the generated artifacts. */
  generatedArtifactRefs: string[];
  /** Dispatch target this generation was sent to (e.g. "git-handoff", "replit"). */
  dispatchTarget?: string;
  /** Tracking handle returned by the target (branch name, run id, …). */
  dispatchHandle?: string;
  /** Git ref the spec was seeded onto, when a git-based target was used. */
  gitRef?: string;
}

/** A hash snapshot of a generated artifact, captured at generation time. */
export interface ArtifactSnapshot {
  specId: string;
  artifactRef: string;
  /** Hash of the artifact as generated. */
  hash: string;
  timestamp: string;
}

export type DriftKind = "modified" | "missing" | "untracked";

export interface DriftFinding {
  kind: DriftKind;
  artifactRef: string;
  specId?: string;
  expectedHash?: string;
  actualHash?: string;
  detail: string;
}

/**
 * An immutable audit event recording that an admin overrode the gate. Overrides
 * are append-only — the audit trail is what keeps "spec is a contract"
 * meaningful even when any finding can be bypassed.
 */
export interface OverrideEvent {
  specId: string;
  /** Who performed the override. */
  actor: string;
  at: string;
  /** Required written justification. */
  justification: string;
  /** Finding codes this override covers (a blanket override lists all current blockers). */
  coveredCodes: string[];
  /** True when any covered finding is a safety invariant (hidden-RED, access conflict, generator≠verifier). */
  safetyInvariant: boolean;
}

export interface ProvenanceStore {
  record(rec: ProvenanceRecord): void;
  bySpec(specId: string): ProvenanceRecord[];
  latestForSpec(specId: string): ProvenanceRecord | undefined;
  all(): ProvenanceRecord[];
  putSnapshot(snapshot: ArtifactSnapshot): void;
  snapshotsForSpec(specId: string): ArtifactSnapshot[];
  allSnapshots(): ArtifactSnapshot[];
  recordOverride(event: OverrideEvent): void;
  overrides(): OverrideEvent[];
  overridesForSpec(specId: string): OverrideEvent[];
}
