import { describe, expect, it } from "vitest";
import { GitHubOAuth } from "../src/github-oauth.js";

describe("GitHubOAuth", () => {
  const opts = { clientId: "cid", clientSecret: "secret", redirectUri: "https://app/cb" };

  it("builds an authorize URL with client_id, redirect_uri, and state", () => {
    const url = new GitHubOAuth(opts).authorizeUrl("xyz");
    expect(url).toContain("github.com/login/oauth/authorize");
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe("cid");
    expect(q.get("redirect_uri")).toBe("https://app/cb");
    expect(q.get("state")).toBe("xyz");
  });

  it("exchanges a code for an access token", async () => {
    let body: any;
    const fetchImpl = (async (_u: string | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ access_token: "gho_tok" }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const token = await new GitHubOAuth({ ...opts, fetchImpl }).exchangeCode("code123");
    expect(token).toBe("gho_tok");
    expect(body.code).toBe("code123");
    expect(body.client_secret).toBe("secret");
  });

  it("returns null when the exchange fails", async () => {
    const fetchImpl = (async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    expect(await new GitHubOAuth({ ...opts, fetchImpl }).exchangeCode("bad")).toBeNull();
  });
});
