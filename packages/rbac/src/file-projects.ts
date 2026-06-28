import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Membership, Project, ProjectStore } from "./projects.js";

/**
 * JSON-file-backed ProjectStore. Loads on construction and rewrites the file on
 * every change, so projects + role assignments survive restarts. Dependency-free.
 */
export class FileProjectStore implements ProjectStore {
  private projects = new Map<string, Project>();

  constructor(private readonly path: string) {
    try {
      const arr = JSON.parse(readFileSync(path, "utf8")) as Project[];
      for (const p of arr) this.projects.set(p.id, p);
    } catch {
      // No file yet — start empty.
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify([...this.projects.values()], null, 2), "utf8");
  }

  create(project: Project): Project {
    if (this.projects.has(project.id)) throw new Error(`project "${project.id}" already exists`);
    const stored: Project = { ...project, members: [...project.members] };
    this.projects.set(project.id, stored);
    this.save();
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
    this.save();
    return p;
  }
  removeMember(projectId: string, userId: string): Project {
    const p = this.require(projectId);
    p.members = p.members.filter((m) => m.userId !== userId);
    this.save();
    return p;
  }
  private require(id: string): Project {
    const p = this.projects.get(id);
    if (!p) throw new Error(`unknown project "${id}"`);
    return p;
  }
}
