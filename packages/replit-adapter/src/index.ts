import type { DispatchResult, GenerationBrief, GenerationTarget } from "@specgate/dispatch";

export interface ReplitTargetOptions {
  /**
   * The git substrate. Replit imports from git, so the brief is first seeded
   * onto a branch (e.g. GitHubHandoffTarget), then Replit imports that repo.
   */
  handoff?: GenerationTarget;
  /** When true (default without a token), do not call Replit — just return the import URL. */
  dryRun?: boolean;
  /** Replit API token; when present (and not dry-run) the kicker calls the API. */
  token?: string;
  /** Replit API endpoint for starting a workspace from a repo (deployment-specific). */
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Compose the Replit "import from GitHub" URL for a repo. */
export function replitImportUrl(repo: string): string {
  return `https://replit.com/github/${repo}`;
}

/**
 * Replit target: seeds the spec onto a git branch via the handoff substrate,
 * then hands Replit the repo to import + run. Dry-run (the default without a
 * token) performs the git handoff and returns the import URL without calling
 * Replit; live mode additionally POSTs to a configured Replit API endpoint.
 */
export class ReplitTarget implements GenerationTarget {
  readonly id = "replit";
  private readonly dryRun: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ReplitTargetOptions = {}) {
    this.dryRun = opts.dryRun ?? !opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async dispatch(brief: GenerationBrief): Promise<DispatchResult> {
    const seeded = this.opts.handoff ? await this.opts.handoff.dispatch(brief) : undefined;
    const repo = brief.repo;
    const url = repo ? replitImportUrl(repo) : undefined;
    const handle = seeded?.handle ?? `replit:${brief.specId}`;

    if (this.dryRun || !this.opts.token || !this.opts.apiUrl) {
      return { target: this.id, handle, url, gitRef: seeded?.gitRef, dryRun: true };
    }

    // Live: hand Replit the repo/branch to import and run. The exact payload is
    // deployment-specific; configure apiUrl to your Replit workflow.
    const res = await this.fetchImpl(this.opts.apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.opts.token}`, "content-type": "application/json" },
      body: JSON.stringify({ repo, gitRef: seeded?.gitRef, specId: brief.specId }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; id?: string };
    return {
      target: this.id,
      handle: body.id ?? handle,
      url: body.url ?? url,
      gitRef: seeded?.gitRef,
      dryRun: false,
    };
  }
}
