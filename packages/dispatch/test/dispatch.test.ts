import { describe, expect, it } from "vitest";
import { DryRunTarget, runEligibility, type GenerationBrief } from "../src/index.js";

const brief: GenerationBrief = {
  specId: "SPEC-1",
  title: "Feature",
  specContentHash: "abcdef0123456789",
  specMarkdown: "# spec",
  tier: "YELLOW",
  requiredApproverRoles: ["domain-owner"],
};

describe("runEligibility", () => {
  it("is eligible only when APPROVED, gate-clean, and conflict-free", () => {
    expect(runEligibility({ state: "APPROVED", gateOk: true, blockingConflicts: 0 }).eligible).toBe(true);
  });
  it("reports each blocker", () => {
    const r = runEligibility({ state: "DRAFT", gateOk: false, blockingConflicts: 2 });
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(3);
    expect(r.reasons.join(" ")).toMatch(/APPROVED/);
    expect(r.reasons.join(" ")).toMatch(/blocking findings/);
    expect(r.reasons.join(" ")).toMatch(/conflict/);
  });
});

describe("DryRunTarget", () => {
  it("returns a no-side-effect handle", async () => {
    const r = await new DryRunTarget().dispatch(brief);
    expect(r.target).toBe("dry-run");
    expect(r.dryRun).toBe(true);
    expect(r.handle).toContain("SPEC-1");
  });
});
