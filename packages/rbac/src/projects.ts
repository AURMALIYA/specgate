import type { Role } from "./roles.js";

/** A user's role within a project. */
export interface Membership {
  userId: string;
  role: Role;
}

/** A project on SpecGate — scopes specs, config, and members. */
export interface Project {
  id: string;
  name: string;
  /** Backing repo "owner/name", when the project tracks a source-control repo. */
  repo?: string;
  /** Path to the org config that governs this project. */
  configPath?: string;
  members: Membership[];
}

/** The role a user holds in a project (null = no access). */
export function roleInProject(project: Project, userId: string): Role | null {
  return project.members.find((m) => m.userId === userId)?.role ?? null;
}

/** Pluggable persistence for projects + memberships. */
export interface ProjectStore {
  create(project: Project): Project;
  get(id: string): Project | undefined;
  all(): Project[];
  upsertMember(projectId: string, member: Membership): Project;
  removeMember(projectId: string, userId: string): Project;
}

export class InMemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>();

  create(project: Project): Project {
    if (this.projects.has(project.id)) throw new Error(`project "${project.id}" already exists`);
    const stored: Project = { ...project, members: [...project.members] };
    this.projects.set(project.id, stored);
    return stored;
  }
  get(id: string): Project | undefined {
    return this.projects.get(id);
  }
  all(): Project[] {
    return [...this.projects.values()];
  }
  upsertMember(projectId: string, member: Membership): Project {
    const p = this.require(projectId);
    const idx = p.members.findIndex((m) => m.userId === member.userId);
    if (idx >= 0) p.members[idx] = member;
    else p.members.push(member);
    return p;
  }
  removeMember(projectId: string, userId: string): Project {
    const p = this.require(projectId);
    p.members = p.members.filter((m) => m.userId !== userId);
    return p;
  }
  private require(id: string): Project {
    const p = this.projects.get(id);
    if (!p) throw new Error(`unknown project "${id}"`);
    return p;
  }
}
