import type { Role } from "./roles.js";
import { roleInProject, type Project } from "./projects.js";

/** An authenticated caller. */
export interface Principal {
  id: string;
  name?: string;
}

/**
 * Resolves *who* a caller is and *what role* they hold in a project. The role
 * source is pluggable: a static map for local/dev, or (in an adapter) a provider
 * that mirrors source-control repository permissions onto roles.
 */
export interface IdentityProvider {
  authenticate(credential: string): Promise<Principal | null>;
  resolveRole(principal: Principal, project: Project): Promise<Role | null>;
}

/**
 * Offline identity provider — no network. Tokens map to principals; roles come
 * from the project's own membership list. Use for local dev and tests.
 */
export class StaticIdentityProvider implements IdentityProvider {
  /** token -> principal */
  private readonly byToken: Map<string, Principal>;

  constructor(users: Record<string, Principal>) {
    this.byToken = new Map(Object.entries(users));
  }

  async authenticate(credential: string): Promise<Principal | null> {
    return this.byToken.get(credential) ?? null;
  }

  async resolveRole(principal: Principal, project: Project): Promise<Role | null> {
    return roleInProject(project, principal.id);
  }
}
