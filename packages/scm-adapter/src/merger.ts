import type { MergeRequest, MergeResult, PullRequestMerger } from "./types.js";

/** No-op merger — validates the flow without touching any SCM. */
export class DryRunMerger implements PullRequestMerger {
  async merge(req: MergeRequest): Promise<MergeResult> {
    return { merged: true, dryRun: true, message: `dry-run merge of ${req.repo}#${req.prNumber}` };
  }
}

export interface GitHubMergerOptions {
  token: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Merges a pull request via the GitHub REST API. */
export class GitHubMerger implements PullRequestMerger {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GitHubMergerOptions) {
    this.base = opts.apiBaseUrl ?? "https://api.github.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async merge(req: MergeRequest): Promise<MergeResult> {
    const res = await this.fetchImpl(`${this.base}/repos/${req.repo}/pulls/${req.prNumber}/merge`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${this.opts.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ merge_method: req.method ?? "merge" }),
    });
    const body = (await res.json().catch(() => ({}))) as { merged?: boolean; sha?: string; message?: string };
    return { merged: res.ok && body.merged !== false, sha: body.sha, message: body.message };
  }
}
