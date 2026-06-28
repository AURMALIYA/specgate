import { describe, expect, it } from "vitest";
import { GitHubIdentityProvider, roleFromGitHubPermission } from "../src/github-identity.js";

function fetchReturning(map: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL) => {
    const key = Object.keys(map).find((k) => String(url).includes(k));
    if (!key) return { ok: false, json: async () => ({}) } as unknown as Response;
    return { ok: true, json: async () => map[key] } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("roleFromGitHubPermission", () => {
  it("maps GitHub permission levels to SpecGate roles", () => {
    expect(roleFromGitHubPermission("admin")).toBe("admin");
    expect(roleFromGitHubPermission("maintain")).toBe("admin");
    expect(roleFromGitHubPermission("write")).toBe("contributor");
    expect(roleFromGitHubPermission("triage")).toBe("developer");
    expect(roleFromGitHubPermission("read")).toBe("viewer");
    expect(roleFromGitHubPermission("none")).toBeNull();
  });
});

describe("GitHubIdentityProvider", () => {
  it("authenticates via /user and resolves role from repo permission", async () => {
    const idp = new GitHubIdentityProvider({
      serverToken: "srv",
      fetchImpl: fetchReturning({
        "/user": { login: "octocat", name: "Octo Cat" },
        "/collaborators/octocat/permission": { permission: "write" },
      }),
    });
    const principal = await idp.authenticate("tok");
    expect(principal).toEqual({ id: "octocat", name: "Octo Cat" });
    const role = await idp.resolveRole(principal!, { id: "p", name: "P", repo: "acme/widgets", members: [] });
    expect(role).toBe("contributor");
  });

  it("returns null role when the project has no repo", async () => {
    const idp = new GitHubIdentityProvider({ fetchImpl: fetchReturning({}) });
    expect(await idp.resolveRole({ id: "x" }, { id: "p", name: "P", members: [] })).toBeNull();
  });
});
