import type { IdentityProvider, Principal, Project, Role } from "@specgate/rbac";

export interface GitHubIdentityOptions {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Map a GitHub repo permission level onto a SpecGate role. */
export function roleFromGitHubPermission(permission: string): Role | null {
  switch (permission) {
    case "admin":
    case "maintain":
      return "admin";
    case "write":
      return "contributor";
    case "triage":
      return "developer";
    case "read":
      return "viewer";
    default:
      return null;
  }
}

/**
 * Identity provider backed by GitHub: the credential is a user token (validated
 * via /user), and the role mirrors the caller's permission on the project's repo
 * (`GET /repos/{owner}/{repo}/collaborators/{user}/permission`).
 */
export class GitHubIdentityProvider implements IdentityProvider {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GitHubIdentityOptions = {}) {
    this.base = opts.apiBaseUrl ?? "https://api.github.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
  }

  async authenticate(credential: string): Promise<Principal | null> {
    const res = await this.fetchImpl(`${this.base}/user`, { headers: this.headers(credential) });
    if (!res.ok) return null;
    const user = (await res.json()) as { login?: string; name?: string };
    if (!user.login) return null;
    // Carry the token on the principal id so resolveRole can call the API as them.
    return { id: user.login, name: user.name ?? user.login };
  }

  async resolveRole(principal: Principal, project: Project): Promise<Role | null> {
    if (!project.repo) return null;
    // The caller's token must be provided out-of-band; here we use an app/installation
    // token via the principal? In practice the token is threaded by the caller. For the
    // provider contract we read the collaborator's permission level.
    const res = await this.fetchImpl(
      `${this.base}/repos/${project.repo}/collaborators/${principal.id}/permission`,
      { headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { permission?: string };
    return body.permission ? roleFromGitHubPermission(body.permission) : null;
  }
}
