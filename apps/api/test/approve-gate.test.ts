import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { loadConfig } from "@specgate/config";
import { InMemoryProjectStore, StaticIdentityProvider } from "@specgate/rbac";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessController } from "../src/access.js";
import { buildServer } from "../src/server.js";
import { SpecGateService } from "../src/service.js";
import { SessionStore } from "../src/sessions.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const GOOD = readFileSync(resolve(ROOT, "config/example-org/specs/storefront-promotion-badge.md"), "utf8");

let base = "";
let server: ReturnType<typeof buildServer>;
let service: SpecGateService;

beforeAll(async () => {
  const identity = new StaticIdentityProvider({ "tok-admin": { id: "admin" }, "tok-dev": { id: "dev" } });
  const projects = new InMemoryProjectStore();
  projects.create({ id: "p1", name: "P1", members: [{ userId: "admin", role: "admin" }, { userId: "dev", role: "developer" }] });
  const access = new AccessController(identity, projects, true);
  service = new SpecGateService(cfg, { now: () => "t" });
  service.ingest(GOOD);
  service.transition("NW-STOREFRONT-001", { type: "submit", at: "t" }); // -> IN_REVIEW
  server = buildServer(service, { access, sessions: new SessionStore() });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function approve(token: string, identity: string) {
  return fetch(`${base}/instances/NW-STOREFRONT-001/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-specgate-project": "p1" },
    body: JSON.stringify({ type: "approve", role: "frontend-peer", identity, at: "t" }),
  });
}

describe("approvals are capability-gated and identity is enforced", () => {
  it("a developer (no approve capability) is denied", async () => {
    const r = await approve("tok-dev", "dev");
    expect(r.status).toBe(403);
    expect(service.getInstance("NW-STOREFRONT-001")!.state).toBe("IN_REVIEW");
  });

  it("an admin can approve, and the recorded identity is the signed-in user (not spoofable)", async () => {
    const r = await approve("tok-admin", "i-am-someone-else"); // spoof attempt
    expect(r.status).toBe(200);
    const inst = service.getInstance("NW-STOREFRONT-001")!;
    expect(inst.state).toBe("APPROVED");
    expect(inst.approvals.at(-1)!.identity).toBe("admin"); // forced to the authenticated principal
  });
});
