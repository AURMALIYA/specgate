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

export interface ProvenanceStore {
  record(rec: ProvenanceRecord): void;
  bySpec(specId: string): ProvenanceRecord[];
  latestForSpec(specId: string): ProvenanceRecord | undefined;
  all(): ProvenanceRecord[];
  putSnapshot(snapshot: ArtifactSnapshot): void;
  snapshotsForSpec(specId: string): ArtifactSnapshot[];
  allSnapshots(): ArtifactSnapshot[];
}
