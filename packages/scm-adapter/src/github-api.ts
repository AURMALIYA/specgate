import type {
  Annotation,
  CheckConclusion,
  InlineComment,
  ScmAdapter,
} from "./types.js";
import { GitHubActionsAdapter } from "./github.js";

export interface GitHubApiOptions {
  token: string;
  /** "owner/name" */
  repo: string;
  prNumber: number;
  apiBaseUrl?: string;
  /** Marker used to find + update one sticky comment. */
  marker?: string;
  fetchImpl?: typeof fetch;
}

/**
 * GitHub REST implementation: annotations via workflow commands (delegated to
 * GitHubActionsAdapter), and the summary upserted as a single sticky PR comment
 * (found by a hidden marker) via the Issues comments API. This is what posts the
 * "what to fix / improve" review back onto the pull request.
 */
export class GitHubApiAdapter implements ScmAdapter {
  private readonly base: string;
  private readonly marker: string;
  private readonly fetchImpl: typeof fetch;
  private readonly annotations = new GitHubActionsAdapter();

  constructor(private readonly opts: GitHubApiOptions) {
    this.base = opts.apiBaseUrl ?? "https://api.github.com";
    this.marker = opts.marker ?? "<!-- specgate-review -->";
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

  emitAnnotation(a: Annotation): void {
    this.annotations.emitAnnotation(a);
  }

  postInlineComments(comments: InlineComment[]): void {
    // Inline review comments need a commit + diff position; downgrade to
    // annotations so nothing is silently dropped.
    this.annotations.postInlineComments(comments);
  }

  setConclusion(conclusion: CheckConclusion, summary: string): void {
    this.annotations.setConclusion(conclusion, summary);
  }

  /** Create the sticky comment, or update it if one with our marker exists. */
  async postSummary(markdown: string): Promise<void> {
    const body = markdown.includes(this.marker) ? markdown : `${this.marker}\n${markdown}`;
    const issues = `${this.base}/repos/${this.opts.repo}/issues/${this.opts.prNumber}/comments`;
    const existingId = await this.findExistingCommentId(issues);
    if (existingId !== null) {
      await this.fetchImpl(`${this.base}/repos/${this.opts.repo}/issues/comments/${existingId}`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ body }),
      });
    } else {
      await this.fetchImpl(issues, { method: "POST", headers: this.headers(), body: JSON.stringify({ body }) });
    }
  }

  private async findExistingCommentId(issuesUrl: string): Promise<number | null> {
    const res = await this.fetchImpl(`${issuesUrl}?per_page=100`, { headers: this.headers() });
    if (!res.ok) return null;
    const comments = (await res.json()) as { id: number; body?: string }[];
    const mine = comments.find((c) => (c.body ?? "").includes(this.marker));
    return mine ? mine.id : null;
  }
}
