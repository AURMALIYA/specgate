import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ArtifactSnapshot,
  OverrideEvent,
  ProvenanceRecord,
  ProvenanceStore,
} from "./types.js";

interface FileShape {
  records: ProvenanceRecord[];
  snapshots: ArtifactSnapshot[];
  overrides: OverrideEvent[];
}

/**
 * JSON-file-backed provenance store. Loads on construction and rewrites the file
 * on every mutation, so the generation provenance + override audit log survive
 * process restarts. Dependency-free (no DB); swap for a real backend in prod.
 */
export class FileProvenanceStore implements ProvenanceStore {
  private data: FileShape = { records: [], snapshots: [], overrides: [] };

  constructor(private readonly path: string) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FileShape>;
      this.data = {
        records: parsed.records ?? [],
        snapshots: parsed.snapshots ?? [],
        overrides: parsed.overrides ?? [],
      };
    } catch {
      // No file yet (or unreadable) — start empty and create it on first write.
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), "utf8");
  }

  record(rec: ProvenanceRecord): void {
    this.data.records.push(rec);
    this.save();
  }
  bySpec(specId: string): ProvenanceRecord[] {
    return this.data.records.filter((r) => r.specId === specId);
  }
  latestForSpec(specId: string): ProvenanceRecord | undefined {
    const rs = this.bySpec(specId);
    return rs.length ? rs.reduce((a, b) => (a.timestamp >= b.timestamp ? a : b)) : undefined;
  }
  all(): ProvenanceRecord[] {
    return [...this.data.records];
  }
  putSnapshot(snapshot: ArtifactSnapshot): void {
    this.data.snapshots.push(snapshot);
    this.save();
  }
  snapshotsForSpec(specId: string): ArtifactSnapshot[] {
    return this.data.snapshots.filter((s) => s.specId === specId);
  }
  allSnapshots(): ArtifactSnapshot[] {
    return [...this.data.snapshots];
  }
  recordOverride(event: OverrideEvent): void {
    this.data.overrides.push(event);
    this.save();
  }
  overrides(): OverrideEvent[] {
    return [...this.data.overrides];
  }
  overridesForSpec(specId: string): OverrideEvent[] {
    return this.data.overrides.filter((e) => e.specId === specId);
  }
}
