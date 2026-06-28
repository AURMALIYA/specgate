import {
  authorize,
  InMemoryProjectStore,
  roleInProject,
  type Capability,
  type IdentityProvider,
  type Membership,
  type Principal,
  type Project,
  type ProjectStore,
  type Role,
} from "@specgate/rbac";

export interface AccessDecision {
  allowed: boolean;
  principal?: Principal;
  role?: Role | null;
  reason?: string;
}

export interface CreateProjectInput {
  id: string;
  name: string;
  repo?: string;
  configPath?: string;
}

/**
 * Composes identity + projects + the RBAC matrix. When `enabled` is false the
 * controller allows everything (keeps the keyless local demo working); when true
 * it authenticates the caller and checks their project role against the needed
 * capability.
 */
export class AccessController {
  readonly projects: ProjectStore;

  constructor(
    private readonly identity: IdentityProvider,
    projects?: ProjectStore,
    public readonly enabled = false,
  ) {
    this.projects = projects ?? new InMemoryProjectStore();
  }

  /** Authenticate a caller (or null). */
  async principal(credential?: string): Promise<Principal | null> {
    if (!credential) return null;
    return this.identity.authenticate(credential);
  }

  /** Decide whether a credential may perform a capability in a project. */
  async check(credential: string | undefined, projectId: string, capability: Capability): Promise<AccessDecision> {
    if (!this.enabled) return { allowed: true, reason: "auth disabled" };
    const project = this.projects.get(projectId);
    if (!project) return { allowed: false, reason: `unknown project "${projectId}"` };
    const principal = await this.principal(credential);
    if (!principal) return { allowed: false, reason: "authentication failed" };
    const role = await this.identity.resolveRole(principal, project);
    if (!authorize(role, capability)) {
      return { allowed: false, principal, role, reason: `role "${role ?? "none"}" lacks "${capability}"` };
    }
    return { allowed: true, principal, role };
  }

  /** Create a project; when auth is on, the creator must authenticate and becomes its admin. */
  async createProject(credential: string | undefined, input: CreateProjectInput): Promise<Project> {
    const members: Membership[] = [];
    if (this.enabled) {
      const principal = await this.principal(credential);
      if (!principal) throw Object.assign(new Error("authentication required to create a project"), { status: 401 });
      members.push({ userId: principal.id, role: "admin" });
    }
    return this.projects.create({ ...input, members });
  }

  listProjects(): Project[] {
    return this.projects.all();
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  /** Add/update a member — admin only (when auth is on). */
  async upsertMember(credential: string | undefined, projectId: string, member: Membership): Promise<Project> {
    await this.requireAdmin(credential, projectId);
    return this.projects.upsertMember(projectId, member);
  }

  async removeMember(credential: string | undefined, projectId: string, userId: string): Promise<Project> {
    await this.requireAdmin(credential, projectId);
    return this.projects.removeMember(projectId, userId);
  }

  private async requireAdmin(credential: string | undefined, projectId: string): Promise<void> {
    if (!this.enabled) return;
    const project = this.projects.get(projectId);
    if (!project) throw Object.assign(new Error(`unknown project "${projectId}"`), { status: 404 });
    const principal = await this.principal(credential);
    if (!principal) throw Object.assign(new Error("authentication required"), { status: 401 });
    if (roleInProject(project, principal.id) !== "admin") {
      throw Object.assign(new Error("admin role required"), { status: 403 });
    }
  }
}
