import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Annotation,
  CheckConclusion,
  InlineComment,
  ScmAdapter,
} from "@specgate/scm-adapter";
import { describe, expect, it } from "vitest";
import { runAction } from "../src/run.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIG = resolve(ROOT, "config/example-org/config.yaml");

class FakeAdapter implements ScmAdapter {
  annotations: Annotation[] = [];
  summary = "";
  conclusion: CheckConclusion | null = null;
  emitAnnotation(a: Annotation): void {
    this.annotations.push(a);
  }
  postSummary(md: string): void {
    this.summary += md;
  }
  postInlineComments(_: InlineComment[]): void {}
  setConclusion(c: CheckConclusion): void {
    this.conclusion = c;
  }
}

describe("runAction", () => {
  it("succeeds on a well-formed spec", async () => {
    const adapter = new FakeAdapter();
    const result = await runAction({
      specPaths: [resolve(ROOT, "config/example-org/specs/storefront-promotion-badge.md")],
      configPath: CONFIG,
      adapter,
    });
    expect(result.conclusion).toBe("success");
    expect(adapter.annotations.filter((a) => a.level === "failure")).toHaveLength(0);
  });

  it("fails and emits failure annotations on a malformed spec", async () => {
    const adapter = new FakeAdapter();
    const result = await runAction({
      specPaths: [resolve(ROOT, "config/example-org/specs-invalid/malformed-checkout.md")],
      configPath: CONFIG,
      adapter,
    });
    expect(result.conclusion).toBe("failure");
    expect(result.blockCount).toBeGreaterThan(0);
    expect(adapter.annotations.some((a) => a.level === "failure")).toBe(true);
    expect(adapter.conclusion).toBe("failure");
  });

  it("gates a Spec Kit feature in speckit mode (spec.md path → feature dir + context)", async () => {
    const adapter = new FakeAdapter();
    const result = await runAction({
      specPaths: [
        resolve(ROOT, "config/example-org/speckit-example/specs/001-promo-badge/spec.md"),
      ],
      configPath: CONFIG,
      adapter,
      mode: "speckit",
    });
    expect(result.conclusion).toBe("success");
    expect(result.view.reports[0]?.specId).toBe("NW-SK-PROMO-001");
  });

  it("repo mode: scopes findings to the changed spec but names conflicts with unchanged specs", async () => {
    const adapter = new FakeAdapter();
    const support = resolve(ROOT, "config/example-org/specs-conflict/order-notes-support.md");
    const readonly = resolve(ROOT, "config/example-org/specs-conflict/order-notes-readonly.md");
    const result = await runAction({
      specPaths: [support, readonly], // whole "repo"
      changedPaths: [support], // only this one changed in the PR
      configPath: CONFIG,
      adapter,
      mode: "repo",
    });
    // Only the changed spec is reported...
    expect(result.view.reports).toHaveLength(1);
    expect(result.view.reports[0]?.specId).toBe("NW-NOTES-SUPPORT");
    // ...but the conflict with the UNCHANGED readonly spec is surfaced + blocks.
    expect(result.conclusion).toBe("failure");
    expect(adapter.summary).toContain("NW-NOTES-READONLY");
    expect(adapter.summary).toContain("Cross-spec conflicts");
  });
});
