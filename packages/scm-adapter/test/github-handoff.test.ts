import type { GenerationBrief } from "@specgate/dispatch";
import { describe, expect, it } from "vitest";
import { GitHubHandoffTarget } from "../src/github-handoff.js";

interface Call { url: string; method: string; body?: any }

function fakeFetch() {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), method, body });
    if (String(url).includes("/git/ref/heads/")) {
      return { ok: true, json: async () => ({ object: { sha: "basesha" } }) } as unknown as Response;
    }
    if (String(url).endsWith("/pulls")) {
      return { ok: true, json: async () => ({ html_url: "https://github.com/acme/widgets/pull/1" }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const brief: GenerationBrief = {
  specId: "NW-DISPATCH-001",
  title: "Dispatch",
  specContentHash: "deadbeefcafef00d",
  specMarkdown: "# the spec\nbody",
  tier: "YELLOW",
  requiredApproverRoles: ["domain-owner"],
};

describe("GitHubHandoffTarget", () => {
  it("creates a branch, seeds the brief, opens a PR, and returns the ref + url", async () => {
    const { impl, calls } = fakeFetch();
    const target = new GitHubHandoffTarget({ token: "t", repo: "acme/widgets", fetchImpl: impl });
    const result = await target.dispatch(brief);

    expect(result.target).toBe("git-handoff");
    expect(result.handle).toMatch(/^specgate\/nw-dispatch-001-deadbeef$/);
    expect(result.gitRef).toBe("refs/heads/specgate/nw-dispatch-001-deadbeef");
    expect(result.url).toContain("/pull/1");

    // branch created from base sha
    const createRef = calls.find((c) => c.method === "POST" && c.url.endsWith("/git/refs"));
    expect(createRef?.body.sha).toBe("basesha");
    // brief file written, with spec content embedded
    const put = calls.find((c) => c.method === "PUT");
    const decoded = Buffer.from(put!.body.content, "base64").toString("utf8");
    expect(decoded).toContain("NW-DISPATCH-001");
    expect(decoded).toContain("# the spec");
  });
});
