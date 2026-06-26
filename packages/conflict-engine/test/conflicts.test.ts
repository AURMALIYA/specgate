import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { validateSpec } from "@specgate/spec-schema";
import { InMemoryStore, Registry, type SpecRecord } from "@specgate/registry";
import { classifyTier } from "@specgate/risk-tier";
import { describe, expect, it } from "vitest";
import {
  detectAccessMatrixConflicts,
  detectCapabilityOwnership,
  detectContractBreaking,
  detectDependencyCycles,
  hiddenRedFinding,
  runDeterministicConflicts,
} from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function parsed(rel: string) {
  return validateSpec(readFileSync(resolve(ROOT, rel), "utf8"), cfg, { path: rel }).parsed!;
}

function rec(partial: Partial<SpecRecord> & { id: string }): SpecRecord {
  return {
    id: partial.id,
    frontmatter: { id: partial.id } as SpecRecord["frontmatter"],
    accessMatrix: partial.accessMatrix ?? [],
    provides: partial.provides ?? [],
    consumes: partial.consumes ?? [],
    dependsOn: partial.dependsOn ?? [],
    contracts: partial.contracts ?? [],
    contentHash: "h",
  };
}

describe("access-matrix conflict (done-criterion a)", () => {
  it("emits a blocking finding naming both specs and the row", () => {
    const reg = Registry.fromParsedSpecs([
      parsed("config/example-org/specs-conflict/order-notes-support.md"),
      parsed("config/example-org/specs-conflict/order-notes-readonly.md"),
    ]);
    const findings = detectAccessMatrixConflicts(reg);
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe("block");
    expect(f.specIds.sort()).toEqual(["NW-NOTES-READONLY", "NW-NOTES-SUPPORT"]);
    expect(f.subject).toBe("support-agent/order-notes");
    expect(f.explanation).toMatch(/editable differs/);
  });
});

describe("capability ownership", () => {
  it("flags two specs providing the same capability", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", provides: ["checkout"] }));
    store.put(rec({ id: "B", provides: ["checkout"] }));
    const findings = detectCapabilityOwnership(new Registry(store));
    expect(findings[0]?.type).toBe("capability-ownership");
    expect(findings[0]?.specIds.sort()).toEqual(["A", "B"]);
  });
});

describe("dependency cycle", () => {
  it("detects a cycle in depends_on", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", dependsOn: ["B"] }));
    store.put(rec({ id: "B", dependsOn: ["C"] }));
    store.put(rec({ id: "C", dependsOn: ["A"] }));
    const findings = detectDependencyCycles(new Registry(store));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe("dependency-cycle");
  });

  it("does not flag an acyclic graph", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", dependsOn: ["B"] }));
    store.put(rec({ id: "B", dependsOn: [] }));
    expect(detectDependencyCycles(new Registry(store))).toHaveLength(0);
  });
});

describe("contract breaking change", () => {
  it("flags a higher version that drops a required field", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", contracts: [{ name: "pay", version: 1, required_fields: ["amount", "currency"] }] }));
    store.put(rec({ id: "B", contracts: [{ name: "pay", version: 2, required_fields: ["amount"] }] }));
    const findings = detectContractBreaking(new Registry(store));
    expect(findings[0]?.type).toBe("contract-breaking");
    expect(findings[0]?.explanation).toMatch(/currency/);
  });

  it("does not flag an additive version", () => {
    const store = new InMemoryStore();
    store.put(rec({ id: "A", contracts: [{ name: "pay", version: 1, required_fields: ["amount"] }] }));
    store.put(rec({ id: "B", contracts: [{ name: "pay", version: 2, required_fields: ["amount", "currency"] }] }));
    expect(detectContractBreaking(new Registry(store))).toHaveLength(0);
  });
});

describe("hidden-RED finding", () => {
  it("converts an escalated tier result into a blocking finding", () => {
    const tier = classifyTier(cfg, {
      spec: parsed("config/example-org/specs-conflict/hidden-red-merchant-roles.md"),
    });
    const finding = hiddenRedFinding("NW-ROLES-001", tier);
    expect(finding?.severity).toBe("block");
    expect(finding?.type).toBe("hidden-red");
    expect(finding?.explanation).toMatch(/RED/);
  });
});

describe("runDeterministicConflicts", () => {
  it("returns no conflicts for the clean example specs", () => {
    const reg = Registry.fromParsedSpecs([
      parsed("config/example-org/specs/storefront-promotion-badge.md"),
    ]);
    expect(runDeterministicConflicts(reg)).toHaveLength(0);
  });
});
