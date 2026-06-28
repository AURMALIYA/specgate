import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorize,
  can,
  FileProjectStore,
  InMemoryProjectStore,
  roleInProject,
  StaticIdentityProvider,
  type Project,
} from "../src/index.js";

describe("capability matrix", () => {
  it("grants escalating capabilities by role", () => {
    expect(can("viewer", "view")).toBe(true);
    expect(can("viewer", "author")).toBe(false);
    expect(can("developer", "author")).toBe(true);
    expect(can("developer", "approve")).toBe(false);
    expect(can("contributor", "approve")).toBe(true);
    expect(can("contributor", "merge")).toBe(false);
    for (const cap of ["run", "merge", "override"] as const) expect(can("admin", cap)).toBe(true);
  });

  it("authorize() rejects a null role", () => {
    expect(authorize(null, "view")).toBe(false);
    expect(authorize("admin", "override")).toBe(true);
  });
});

describe("projects + membership", () => {
  it("resolves a member's role and supports upsert/remove", () => {
    const store = new InMemoryProjectStore();
    const p = store.create({ id: "p1", name: "Proj", members: [{ userId: "alice", role: "admin" }] });
    expect(roleInProject(p, "alice")).toBe("admin");
    expect(roleInProject(p, "bob")).toBeNull();
    store.upsertMember("p1", { userId: "bob", role: "developer" });
    expect(roleInProject(store.get("p1")!, "bob")).toBe("developer");
    store.upsertMember("p1", { userId: "bob", role: "contributor" }); // update
    expect(roleInProject(store.get("p1")!, "bob")).toBe("contributor");
    store.removeMember("p1", "bob");
    expect(roleInProject(store.get("p1")!, "bob")).toBeNull();
  });
});

describe("StaticIdentityProvider", () => {
  const project: Project = {
    id: "p1",
    name: "Proj",
    members: [{ userId: "alice", role: "admin" }, { userId: "dev", role: "developer" }],
  };
  const idp = new StaticIdentityProvider({
    "tok-alice": { id: "alice" },
    "tok-dev": { id: "dev" },
  });

  it("authenticates known tokens and resolves project roles", async () => {
    expect(await idp.authenticate("tok-alice")).toEqual({ id: "alice" });
    expect(await idp.authenticate("nope")).toBeNull();
    expect(await idp.resolveRole({ id: "alice" }, project)).toBe("admin");
    expect(await idp.resolveRole({ id: "dev" }, project)).toBe("developer");
    expect(await idp.resolveRole({ id: "stranger" }, project)).toBeNull();
  });
});

describe("FileProjectStore (durable)", () => {
  it("persists projects + memberships across instances", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sg-proj-")), "projects.json");
    const s1 = new FileProjectStore(path);
    s1.create({ id: "p1", name: "Proj", members: [{ userId: "alice", role: "admin" }] });
    s1.upsertMember("p1", { userId: "bob", role: "developer" });

    const s2 = new FileProjectStore(path); // reload from disk
    expect(s2.all()).toHaveLength(1);
    expect(roleInProject(s2.get("p1")!, "alice")).toBe("admin");
    expect(roleInProject(s2.get("p1")!, "bob")).toBe("developer");
  });
});
