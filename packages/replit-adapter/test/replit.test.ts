import type { DispatchResult, GenerationBrief, GenerationTarget } from "@specgate/dispatch";
import { describe, expect, it } from "vitest";
import { replitImportUrl, ReplitTarget } from "../src/index.js";

const brief: GenerationBrief = {
  specId: "SPEC-1",
  title: "Feature",
  specContentHash: "abcdef0123456789",
  specMarkdown: "# spec",
  tier: "YELLOW",
  requiredApproverRoles: [],
  repo: "acme/widgets",
};

/** A fake handoff that records it was called and returns a branch ref. */
class FakeHandoff implements GenerationTarget {
  readonly id = "git-handoff";
  called = false;
  async dispatch(): Promise<DispatchResult> {
    this.called = true;
    return { target: this.id, handle: "specgate/spec-1-abcdef01", gitRef: "refs/heads/specgate/spec-1-abcdef01" };
  }
}

describe("ReplitTarget", () => {
  it("composes import URL", () => {
    expect(replitImportUrl("acme/widgets")).toBe("https://replit.com/github/acme/widgets");
  });

  it("dry-run: seeds via the handoff and returns the import URL without calling Replit", async () => {
    const handoff = new FakeHandoff();
    const target = new ReplitTarget({ handoff }); // no token => dry-run
    const r = await target.dispatch(brief);
    expect(handoff.called).toBe(true);
    expect(r.target).toBe("replit");
    expect(r.dryRun).toBe(true);
    expect(r.url).toBe("https://replit.com/github/acme/widgets");
    expect(r.gitRef).toBe("refs/heads/specgate/spec-1-abcdef01");
  });
});
