import { createHash } from "node:crypto";
import type { ArtifactSnapshot, ProvenanceRecord, ProvenanceStore } from "./types.js";

/** Stable content hash helper used for snapshots and drift comparison. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Default in-memory provenance store. */
export class InMemoryProvenanceStore implements ProvenanceStore {
  private readonly records: ProvenanceRecord[] = [];
  private readonly snapshots: ArtifactSnapshot[] = [];

  record(rec: ProvenanceRecord): void {
    this.records.push(rec);
  }
  bySpec(specId: string): ProvenanceRecord[] {
    return this.records.filter((r) => r.specId === specId);
  }
  latestForSpec(specId: string): ProvenanceRecord | undefined {
    const rs = this.bySpec(specId);
    return rs.length ? rs.reduce((a, b) => (a.timestamp >= b.timestamp ? a : b)) : undefined;
  }
  all(): ProvenanceRecord[] {
    return [...this.records];
  }
  putSnapshot(snapshot: ArtifactSnapshot): void {
    this.snapshots.push(snapshot);
  }
  snapshotsForSpec(specId: string): ArtifactSnapshot[] {
    return this.snapshots.filter((s) => s.specId === specId);
  }
  allSnapshots(): ArtifactSnapshot[] {
    return [...this.snapshots];
  }
}
