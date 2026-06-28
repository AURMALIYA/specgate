import { describe, expect, it } from "vitest";
import { GitHubApiAdapter } from "../src/github-api.js";

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

function fakeFetch(listResponse: { id: number; body: string }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET") {
      return { ok: true, json: async () => listResponse } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const base = {
  token: "t",
  repo: "acme/widgets",
  prNumber: 7,
  marker: "<!-- specgate-review -->",
};

describe("GitHubApiAdapter sticky PR comment", () => {
  it("creates a new comment when none exists", async () => {
    const { impl, calls } = fakeFetch([]);
    const adapter = new GitHubApiAdapter({ ...base, fetchImpl: impl });
    await adapter.postSummary("## review\nfix this");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toContain("/repos/acme/widgets/issues/7/comments");
    expect((post?.body as { body: string }).body).toContain("<!-- specgate-review -->");
  });

  it("updates the existing comment found by marker", async () => {
    const { impl, calls } = fakeFetch([{ id: 42, body: "<!-- specgate-review -->\nold" }]);
    const adapter = new GitHubApiAdapter({ ...base, fetchImpl: impl });
    await adapter.postSummary("## review\nnew content");
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toContain("/issues/comments/42");
    expect((patch?.body as { body: string }).body).toContain("new content");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
