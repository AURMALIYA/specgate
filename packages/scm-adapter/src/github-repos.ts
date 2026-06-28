export interface GitHubReposOptions {
  token: string;
  apiBaseUrl?: string;
  /** Glob-ish prefix specs live under (default "specs/"). */
  specDir?: string;
  fetchImpl?: typeof fetch;
}

export interface RepoSummary {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/**
 * Repo-first browsing: list the repos a signed-in user can access, and discover
 * the SpecGate specs inside a repo. Only spec files (Markdown under the spec
 * directory) are surfaced — never the rest of the repo's contents.
 */
export class GitHubRepos {
  private readonly base: string;
  private readonly specDir: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GitHubReposOptions) {
    this.base = opts.apiBaseUrl ?? "https://api.github.com";
    this.specDir = (opts.specDir ?? "specs/").replace(/\/?$/, "/");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.opts.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
  }

  /** Repos the user owns or collaborates on (most-recently-updated first). */
  async listRepos(): Promise<RepoSummary[]> {
    const res = await this.fetchImpl(
      `${this.base}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`listRepos: ${res.status}`);
    const repos = (await res.json()) as { full_name: string; private: boolean; default_branch: string }[];
    return repos.map((r) => ({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch }));
  }

  /** Paths of spec files (Markdown under the spec dir) in a repo. */
  async listSpecPaths(repo: string): Promise<string[]> {
    const meta = await this.fetchImpl(`${this.base}/repos/${repo}`, { headers: this.headers() });
    if (!meta.ok) throw new Error(`repo lookup: ${meta.status}`);
    const branch = ((await meta.json()) as { default_branch?: string }).default_branch ?? "main";
    const tree = await this.fetchImpl(`${this.base}/repos/${repo}/git/trees/${branch}?recursive=1`, {
      headers: this.headers(),
    });
    if (!tree.ok) throw new Error(`tree: ${tree.status}`);
    const entries = ((await tree.json()) as { tree?: { path: string; type: string }[] }).tree ?? [];
    return entries
      .filter((e) => e.type === "blob" && e.path.startsWith(this.specDir) && e.path.endsWith(".md"))
      .map((e) => e.path)
      .sort();
  }

  /** Raw Markdown of one spec file. */
  async getSpecFile(repo: string, path: string): Promise<string> {
    const res = await this.fetchImpl(`${this.base}/repos/${repo}/contents/${encodeURIComponent(path)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`getSpecFile: ${res.status}`);
    const body = (await res.json()) as { content?: string; encoding?: string };
    if (!body.content) throw new Error("getSpecFile: empty content");
    return Buffer.from(body.content, (body.encoding as BufferEncoding) ?? "base64").toString("utf8");
  }
}
