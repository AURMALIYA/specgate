import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { describe, expect, it } from "vitest";
import { runGate, runGateBatch, scopeBatchToChanged } from "../src/gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const exampleCfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const defaultCfg = loadConfig(resolve(ROOT, "config/default.config.yaml"));

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("runGate", () => {
  it("passes a well-formed example spec with no blocking findings", () => {
    const report = runGate({
      raw: read("config/example-org/specs/storefront-promotion-badge.md"),
      config: exampleCfg,
      path: "storefront-promotion-badge.md",
    });
    expect(report.ok, JSON.stringify(report.findings, null, 2)).toBe(true);
    expect(report.blockCount).toBe(0);
  });

  it("fails a malformed spec and merges schema + policy findings", () => {
    const report = runGate({
      raw: read("config/example-org/specs-invalid/malformed-checkout.md"),
      config: exampleCfg,
      path: "malformed-checkout.md",
    });
    expect(report.ok).toBe(false);
    expect(report.blockCount).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.source === "schema")).toBe(true);
  });

  it("passes the platform's own dogfood specs under the default config", () => {
    for (const rel of ["specs/standardization-gate.md", "specs/platform-agnosticism.md"]) {
      const report = runGate({ raw: read(rel), config: defaultCfg, path: rel });
      expect(report.ok, `${rel}: ${JSON.stringify(report.findings, null, 2)}`).toBe(true);
    }
  });
});

describe("runGateBatch — Phase 2 done-criteria", () => {
  it("(a) two specs with contradictory access rows produce a blocking conflict naming both", () => {
    const batch = runGateBatch(
      [
        { raw: read("config/example-org/specs-conflict/order-notes-support.md"), path: "support.md" },
        { raw: read("config/example-org/specs-conflict/order-notes-readonly.md"), path: "readonly.md" },
      ],
      exampleCfg,
    );
    expect(batch.ok).toBe(false);
    const conflict = batch.conflicts.find((c) => c.type === "access-matrix");
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe("block");
    expect(conflict!.specIds.sort()).toEqual(["NW-NOTES-READONLY", "NW-NOTES-SUPPORT"]);
    // The conflict is attached to both specs' reports.
    for (const r of batch.reports) {
      expect(r.findings.some((f) => f.source === "conflict")).toBe(true);
    }
  });

  it("(b) a GREEN spec touching the identity surface is force-escalated to RED and blocks", () => {
    const batch = runGateBatch(
      [{ raw: read("config/example-org/specs-conflict/hidden-red-merchant-roles.md"), path: "roles.md" }],
      exampleCfg,
    );
    const report = batch.reports[0]!;
    expect(report.tier?.declaredTier).toBe("GREEN");
    expect(report.tier?.finalTier).toBe("RED");
    expect(report.tier?.escalated).toBe(true);
    expect(report.findings.some((f) => f.code === "tier.hidden-red")).toBe(true);
    expect(report.tier?.requiredApproverRoles).toContain("pci-compliance-officer");
    expect(batch.ok).toBe(false);
  });
});

describe("whole-repo PR gate (Phase 8)", () => {
  it("flags a dangling dependency only with includeDanglingDeps", () => {
    const spec = { raw: read("config/example-org/specs-conflict/dangling-dep.md"), path: "dangling.md" };
    expect(runGateBatch([spec], exampleCfg).conflicts.some((c) => c.type === "dangling-dependency")).toBe(false);
    const withDeps = runGateBatch([spec], exampleCfg, { includeDanglingDeps: true });
    expect(withDeps.conflicts.some((c) => c.type === "dangling-dependency")).toBe(true);
    expect(withDeps.ok).toBe(false);
  });

  it("scopes a whole-repo batch to the changed spec but keeps conflicts that name unchanged specs", () => {
    const batch = runGateBatch(
      [
        { raw: read("config/example-org/specs-conflict/order-notes-support.md"), path: "a/support.md" },
        { raw: read("config/example-org/specs-conflict/order-notes-readonly.md"), path: "b/readonly.md" },
      ],
      exampleCfg,
    );
    const scoped = scopeBatchToChanged(batch, ["a/support.md"]);
    expect(scoped.reports.map((r) => r.specId)).toEqual(["NW-NOTES-SUPPORT"]);
    // The access conflict with the UNCHANGED readonly spec is still in scope.
    expect(scoped.conflicts.some((c) => c.specIds.includes("NW-NOTES-READONLY"))).toBe(true);
    expect(scoped.ok).toBe(false);
  });
});
