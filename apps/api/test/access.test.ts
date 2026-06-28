import { StaticIdentityProvider } from "@specgate/rbac";
import { describe, expect, it } from "vitest";
import { AccessController } from "../src/access.js";

function controller(enabled: boolean) {
  const idp = new StaticIdentityProvider({
    "tok-admin": { id: "admin" },
    "tok-dev": { id: "dev" },
  });
  return new AccessController(idp, undefined, enabled);
}

describe("AccessController (enforcement on)", () => {
  it("creator becomes admin; admin manages members; roles gate capabilities", async () => {
    const ac = controller(true);
    const project = await ac.createProject("tok-admin", { id: "p1", name: "Proj" });
    expect(project.members).toEqual([{ userId: "admin", role: "admin" }]);

    // admin can add a developer
    await ac.upsertMember("tok-admin", "p1", { userId: "dev", role: "developer" });

    // developer can author but not approve/run/merge/override
    expect((await ac.check("tok-dev", "p1", "author")).allowed).toBe(true);
    expect((await ac.check("tok-dev", "p1", "approve")).allowed).toBe(false);
    expect((await ac.check("tok-dev", "p1", "run")).allowed).toBe(false);
    expect((await ac.check("tok-dev", "p1", "override")).allowed).toBe(false);

    // admin holds the privileged capabilities
    for (const cap of ["run", "merge", "override"] as const) {
      expect((await ac.check("tok-admin", "p1", cap)).allowed).toBe(true);
    }
  });

  it("rejects unauthenticated callers and non-admins managing members", async () => {
    const ac = controller(true);
    await ac.createProject("tok-admin", { id: "p1", name: "Proj" });
    await ac.upsertMember("tok-admin", "p1", { userId: "dev", role: "developer" });

    expect((await ac.check(undefined, "p1", "view")).allowed).toBe(false);
    expect((await ac.check("bogus", "p1", "view")).allowed).toBe(false);
    await expect(ac.upsertMember("tok-dev", "p1", { userId: "x", role: "admin" })).rejects.toThrow(/admin role required/);
  });
});

describe("AccessController (enforcement off)", () => {
  it("allows everything so the keyless local demo keeps working", async () => {
    const ac = controller(false);
    await ac.createProject(undefined, { id: "p1", name: "Proj" });
    expect((await ac.check(undefined, "p1", "override")).allowed).toBe(true);
  });
});
