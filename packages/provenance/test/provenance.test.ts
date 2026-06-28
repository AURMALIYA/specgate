import { describe, expect, it } from "vitest";
import { detectDrift, hashContent, InMemoryProvenanceStore } from "../src/index.js";

describe("provenance store", () => {
  it("records generations and returns the latest per spec", () => {
    const store = new InMemoryProvenanceStore();
    store.record({ specId: "S1", specContentHash: "h1", pinnedModel: "m", promptContextRef: "ctx/1", timestamp: "2026-01-01T00:00:00Z", generatedArtifactRefs: ["a.ts"] });
    store.record({ specId: "S1", specContentHash: "h2", pinnedModel: "m", promptContextRef: "ctx/2", timestamp: "2026-02-01T00:00:00Z", generatedArtifactRefs: ["a.ts"] });
    expect(store.bySpec("S1")).toHaveLength(2);
    expect(store.latestForSpec("S1")?.specContentHash).toBe("h2");
  });
});

describe("drift detection", () => {
  const snapshots = [
    { specId: "S1", artifactRef: "a.ts", hash: hashContent("v1"), timestamp: "t" },
    { specId: "S1", artifactRef: "b.ts", hash: hashContent("vb"), timestamp: "t" },
  ];

  it("flags a deployed artifact whose hash diverges from its snapshot", () => {
    const findings = detectDrift(snapshots, [
      { artifactRef: "a.ts", hash: hashContent("v1-edited") },
      { artifactRef: "b.ts", hash: hashContent("vb") },
    ]);
    const modified = findings.filter((f) => f.kind === "modified");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.artifactRef).toBe("a.ts");
    expect(modified[0]?.specId).toBe("S1");
  });

  it("reports untracked and missing artifacts", () => {
    const findings = detectDrift(snapshots, [{ artifactRef: "c.ts", hash: "x" }]);
    expect(findings.some((f) => f.kind === "untracked" && f.artifactRef === "c.ts")).toBe(true);
    expect(findings.filter((f) => f.kind === "missing").map((f) => f.artifactRef).sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("reports no drift when everything matches", () => {
    const findings = detectDrift(snapshots, [
      { artifactRef: "a.ts", hash: hashContent("v1") },
      { artifactRef: "b.ts", hash: hashContent("vb") },
    ]);
    expect(findings).toHaveLength(0);
  });
});

describe("override audit log", () => {
  it("appends immutable override events, queryable per spec", () => {
    const store = new InMemoryProvenanceStore();
    store.recordOverride({ specId: "S1", actor: "alice", at: "t", justification: "hotfix", coveredCodes: ["ears.non_testable"], safetyInvariant: false });
    store.recordOverride({ specId: "S2", actor: "bob", at: "t", justification: "exec call", coveredCodes: ["tier.hidden-red"], safetyInvariant: true });
    expect(store.overrides()).toHaveLength(2);
    expect(store.overridesForSpec("S1")).toHaveLength(1);
    expect(store.overrides().filter((o) => o.safetyInvariant)).toHaveLength(1);
  });
});
