import { describe, expect, it } from "vitest";
import { DryRunMerger, GitHubMerger } from "../src/merger.js";

describe("DryRunMerger", () => {
  it("returns a no-op merge", async () => {
    const r = await new DryRunMerger().merge({ repo: "acme/widgets", prNumber: 3 });
    expect(r.merged).toBe(true);
    expect(r.dryRun).toBe(true);
  });
});

describe("GitHubMerger", () => {
  it("PUTs the pulls/{n}/merge endpoint and reports merged", async () => {
    let calledUrl = "";
    let body: any;
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calledUrl = String(url);
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return { ok: true, json: async () => ({ merged: true, sha: "abc123" }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await new GitHubMerger({ token: "t", fetchImpl }).merge({ repo: "acme/widgets", prNumber: 7, method: "squash" });
    expect(calledUrl).toBe("https://api.github.com/repos/acme/widgets/pulls/7/merge");
    expect(body.merge_method).toBe("squash");
    expect(r.merged).toBe(true);
    expect(r.sha).toBe("abc123");
  });
});
