export interface GitHubOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string;
  authBaseUrl?: string; // default https://github.com
  fetchImpl?: typeof fetch;
}

/**
 * GitHub OAuth (authorization-code) helper for "Sign in with GitHub". Builds the
 * authorize URL and exchanges the returned code for a user access token. The
 * token is then used by GitHubIdentityProvider to resolve the principal + role.
 */
export class GitHubOAuth {
  private readonly authBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GitHubOAuthOptions) {
    this.authBase = opts.authBaseUrl ?? "https://github.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** URL to redirect the browser to for consent. */
  authorizeUrl(state: string): string {
    const p = new URLSearchParams({
      client_id: this.opts.clientId,
      redirect_uri: this.opts.redirectUri,
      scope: this.opts.scope ?? "read:user read:org",
      state,
    });
    return `${this.authBase}/login/oauth/authorize?${p.toString()}`;
  }

  /** Exchange the callback code for a user access token. */
  async exchangeCode(code: string): Promise<string | null> {
    const res = await this.fetchImpl(`${this.authBase}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        code,
        redirect_uri: this.opts.redirectUri,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return body.access_token ?? null;
  }
}
