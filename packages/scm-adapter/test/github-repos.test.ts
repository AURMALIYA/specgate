import { describe, expect, it } from "vitest";
import { GitHubRepos } from "../src/github-repos.js";

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: true, json: async () => routes[key] } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("GitHubRepos", () => {
  it("lists repos the user can access", async () => {
    const gh = new GitHubRepos({
      token: "t",
      fetchImpl: fakeFetch({
        "/user/repos": [
          { full_name: "me/specgate", private: true, default_branch: "main" },
          { full_name: "org/other", private: false, default_branch: "trunk" },
        ],
      }),
    });
    const repos = await gh.listRepos();
    expect(repos.map((r) => r.fullName)).toEqual(["me/specgate", "org/other"]);
    expect(repos[1].defaultBranch).toBe("trunk");
  });

  it("lists ONLY spec files under specs/ — never other repo content", async () => {
    const gh = new GitHubRepos({
      token: "t",
      fetchImpl: fakeFetch({
        "/repos/me/specgate/git/trees/": {
          tree: [
            { path: "specs/a.md", type: "blob" },
            { path: "specs/sub/b.md", type: "blob" },
            { path: "src/index.ts", type: "blob" }, // not a spec
            { path: "README.md", type: "blob" }, // not under specs/
            { path: "specs", type: "tree" },
          ],
        },
        "/repos/me/specgate": { default_branch: "main" },
      }),
    });
    const paths = await gh.listSpecPaths("me/specgate");
    expect(paths).toEqual(["specs/a.md", "specs/sub/b.md"]);
  });

  it("fetches + decodes a spec file", async () => {
    const gh = new GitHubRepos({
      token: "t",
      fetchImpl: fakeFetch({
        "/contents/": { content: Buffer.from("# spec body", "utf8").toString("base64"), encoding: "base64" },
      }),
    });
    expect(await gh.getSpecFile("me/specgate", "specs/a.md")).toBe("# spec body");
  });
});
