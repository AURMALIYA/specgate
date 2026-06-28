import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { describe, expect, it } from "vitest";
import { SpecGateService } from "../src/service.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("admin override + merge (full, audited)", () => {
  it("blocks merge until a blocking finding is overridden; flags safety-invariant overrides", async () => {
    const svc = new SpecGateService(cfg, { now: () => "t" }); // default DryRunMerger
    // hidden-RED spec: GREEN declared, escalated to RED -> blocking tier.hidden-red.
    const { specId } = svc.ingest(read("config/example-org/specs-conflict/hidden-red-merchant-roles.md"));

    expect(svc.canMerge(specId).allowed).toBe(false);

    // Override requires a justification.
    expect(() => svc.override({ specId, actor: "admin", justification: "" })).toThrow(/justification/);

    // Blanket override covers the current blockers (incl. the hidden-RED safety invariant).
    const ev = svc.override({ specId, actor: "admin", justification: "exec sign-off for hotfix" });
    expect(ev.safetyInvariant).toBe(true);
    expect(ev.coveredCodes).toContain("tier.hidden-red");

    // Now mergeable; merge goes through the (dry-run) merger.
    expect(svc.canMerge(specId).allowed).toBe(true);
    const merged = await svc.merge({ specId });
    expect(merged.merged).toBe(true);

    const m = svc.metrics();
    expect(m.overrides).toBe(1);
    expect(m.safetyInvariantOverrides).toBe(1);
  });

  it("a clean spec is mergeable without any override", async () => {
    const svc = new SpecGateService(cfg, { now: () => "t" });
    const { specId } = svc.ingest(read("config/example-org/specs/storefront-promotion-badge.md"));
    expect(svc.canMerge(specId).allowed).toBe(true);
    expect(svc.metrics().overrides).toBe(0);
  });
});
