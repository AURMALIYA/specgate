import type { SpecRecord, StorageAdapter } from "./types.js";

/** Default in-memory storage adapter. */
export class InMemoryStore implements StorageAdapter {
  private readonly records = new Map<string, SpecRecord>();

  put(record: SpecRecord): void {
    this.records.set(record.id, record);
  }
  get(id: string): SpecRecord | undefined {
    return this.records.get(id);
  }
  all(): SpecRecord[] {
    return [...this.records.values()];
  }
  delete(id: string): void {
    this.records.delete(id);
  }
}
