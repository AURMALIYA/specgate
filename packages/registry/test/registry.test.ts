import { describe, expect, it } from "vitest";
import { InMemoryStore, Registry, accessKey, type SpecRecord } from "../src/index.js";

function rec(partial: Partial<SpecRecord> & { id: string }): SpecRecord {
  return {
    id: partial.id,
    frontmatter: { id: partial.id } as SpecRecord["frontmatter"],
    accessMatrix: partial.accessMatrix ?? [],
    provides: partial.provides ?? [],
    consumes: partial.consumes ?? [],
    dependsOn: partial.dependsOn ?? [],
    contracts: partial.contracts ?? [],
    contentHash: "deadbeef",
    path: partial.path,
  };
}

describe("Registry", () => {
  it("groups access rows by (role, resource)", () => {
    const reg = new Registry(new InMemoryStore());
    reg.ingest(
      // @ts-expect-error minimal parsed-spec shape for the test
      { frontmatter: { id: "S1", provides: [], consumes: [], depends_on: [], contracts: [] }, accessMatrix: [
        { role: "Admin", resource: "Orders", visible: true, editable: true, data_scope: "all", enforcement_layer: "svc", source_attribute: "", deny_cases: [], fallback: "" },
      ], contentHash: "h", path: "s1.md" },
    );
    const grouped = reg.accessRowsByKey();
    expect([...grouped.keys()]).toContain(accessKey("admin", "orders"));
  });

  it("indexes capability providers and dependency edges", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", provides: ["cap-x"], dependsOn: ["B"] }));
    store.put(rec({ id: "B", provides: ["cap-x"], dependsOn: [] }));
    const reg = new Registry(store);
    expect(reg.capabilityProviders().get("cap-x")).toEqual(["A", "B"]);
    expect(reg.dependencyEdges()).toContainEqual(["A", "B"]);
  });

  it("collects contracts by name", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", contracts: [{ name: "pay", version: 1, required_fields: ["amount"] }] }));
    store.put(rec({ id: "B", contracts: [{ name: "pay", version: 2, required_fields: [] }] }));
    const reg = new Registry(store);
    expect(reg.contractsByName().get("pay")).toHaveLength(2);
  });
});
