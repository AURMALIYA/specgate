import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { loadConfig } from "@specgate/config";
import { StaticIdentityProvider } from "@specgate/rbac";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessController } from "../src/access.js";
import { buildServer } from "../src/server.js";
import { SpecGateService } from "../src/service.js";
import { SessionStore } from "../src/sessions.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

let base = "";
let server: ReturnType<typeof buildServer>;

beforeAll(async () => {
  const identity = new StaticIdentityProvider({ "dev-admin": { id: "admin", name: "Dev Admin" } });
  const access = new AccessController(identity, undefined, true);
  const service = new SpecGateService(cfg, { now: () => "t" });
  server = buildServer(service, { access, sessions: new SessionStore() });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("session auth flow", () => {
  it("token sign-in → cookie → /auth/me → logout", async () => {
    // not signed in
    const me0 = await fetch(`${base}/auth/me`);
    expect(me0.status).toBe(401);

    // sign in with a (dev) token
    const login = await fetch(`${base}/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "dev-admin" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^sg_session=/);

    // authenticated
    const me1 = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(me1.status).toBe(200);
    expect((await me1.json()).principal.id).toBe("admin");

    // logout clears the session
    await fetch(`${base}/auth/logout`, { method: "POST", headers: { cookie } });
    const me2 = await fetch(`${base}/auth/me`, { headers: { cookie } });
    expect(me2.status).toBe(401);
  });

  it("rejects an unknown token", async () => {
    const r = await fetch(`${base}/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "nope" }),
    });
    expect(r.status).toBe(401);
  });
});
