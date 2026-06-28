import type { DispatchResult, GenerationBrief, GenerationTarget } from "@specgate/dispatch";

export interface GitHubHandoffOptions {
  token: string;
  /** "owner/name"; overridden by brief.repo when present. */
  repo?: string;
  baseBranch?: string;
  apiBaseUrl?: string;
  /** Open a PR after seeding the branch (default true). */
  openPullRequest?: boolean;
  fetchImpl?: typeof fetch;
}

function brandSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function briefMarkdown(brief: GenerationBrief): string {
  return [
    `# Generation brief: ${brief.title}`,
    "",
    `- spec_id: ${brief.specId}`,
    `- spec_content_hash: ${brief.specContentHash}`,
    `- tier: ${brief.tier}`,
    `- required_approvers: ${brief.requiredApproverRoles.join(", ") || "(none)"}`,
    brief.promptContextRef ? `- prompt_context_ref: ${brief.promptContextRef}` : "",
    "",
    "Implement the code to satisfy the spec below. The spec is the contract.",
    "",
    "---",
    "",
    brief.specMarkdown,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * git-handoff target: seed a fresh branch (and PR) in the repo with a generation
 * brief + the spec, so any downstream codegen agent can pick it up from git. The
 * portable substrate every external target builds on.
 */
export class GitHubHandoffTarget implements GenerationTarget {
  readonly id = "git-handoff";
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GitHubHandoffOptions) {
    this.base = opts.apiBaseUrl ?? "https://api.github.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.opts.token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    };
  }

  async dispatch(brief: GenerationBrief): Promise<DispatchResult> {
    const repo = brief.repo ?? this.opts.repo;
    if (!repo) throw new Error("git-handoff: no target repo (set brief.repo or options.repo)");
    const baseBranch = this.opts.baseBranch ?? "main";
    const branch = `specgate/${brandSlug(brief.specId)}-${brief.specContentHash.slice(0, 8)}`;

    // 1. base sha
    const refRes = await this.fetchImpl(`${this.base}/repos/${repo}/git/ref/heads/${baseBranch}`, {
      headers: this.headers(),
    });
    const baseSha = ((await refRes.json()) as { object?: { sha?: string } }).object?.sha;
    if (!baseSha) throw new Error(`git-handoff: could not read base branch "${baseBranch}"`);

    // 2. create branch
    await this.fetchImpl(`${this.base}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });

    // 3. seed the brief file
    await this.fetchImpl(
      `${this.base}/repos/${repo}/contents/${encodeURIComponent(`.specgate/briefs/${brief.specId}.md`)}`,
      {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({
          message: `SpecGate: generation brief for ${brief.specId}`,
          content: Buffer.from(briefMarkdown(brief), "utf8").toString("base64"),
          branch,
        }),
      },
    );

    // 4. open PR (optional)
    let url: string | undefined;
    if (this.opts.openPullRequest !== false) {
      const prRes = await this.fetchImpl(`${this.base}/repos/${repo}/pulls`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          title: `SpecGate: generate ${brief.specId}`,
          head: branch,
          base: baseBranch,
          body: `Seeded by SpecGate from an approved spec (tier ${brief.tier}).`,
        }),
      });
      url = ((await prRes.json()) as { html_url?: string }).html_url;
    }

    return { target: this.id, handle: branch, url, gitRef: `refs/heads/${branch}` };
  }
}
