import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { WorkflowEvent } from "@specgate/workflow";
import type { Capability, Membership } from "@specgate/rbac";
import type { AccessController } from "./access.js";
import type { DefectInput, SpecGateService } from "./service.js";

/** Extract a bearer/token credential from the request headers. */
function credentialOf(req: IncomingMessage): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const tok = req.headers["x-specgate-token"];
  return typeof tok === "string" ? tok : undefined;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function serveStatic(res: ServerResponse, staticDir: string, pathname: string): boolean {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(staticDir, rel));
  if (!filePath.startsWith(normalize(staticDir)) || !existsSync(filePath)) return false;
  res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
  return true;
}

export interface ServerOptions {
  /** Directory of dashboard static files served at `/`. */
  staticDir?: string;
  /** Optional RBAC controller — enables project + membership endpoints. */
  access?: AccessController;
}

/** Build an HTTP server exposing the service + dashboard. */
export function buildServer(service: SpecGateService, options: ServerOptions = {}): Server {
  const access = options.access;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = req.method ?? "GET";

      // --- API routes ---
      if (method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
      if (method === "GET" && url.pathname === "/metrics") return send(res, 200, service.metrics());
      if (method === "GET" && url.pathname === "/instances") return send(res, 200, service.listInstances());
      if (method === "GET" && url.pathname === "/registry") return send(res, 200, service.registrySpecs());
      if (method === "GET" && url.pathname === "/conflicts") return send(res, 200, service.conflicts());

      if (method === "POST" && url.pathname === "/ingest") {
        const body = (await readBody(req)) as { raw: string; path?: string };
        return send(res, 201, service.ingest(body.raw, body.path));
      }
      if (method === "POST" && url.pathname === "/coauthor") {
        if (!service.assistantAvailable) {
          return send(res, 501, { error: "Spec assistant not configured. Set ANTHROPIC_API_KEY and enable config.semantic." });
        }
        const body = (await readBody(req)) as { raw: string; maxRounds?: number };
        return send(res, 200, await service.coAuthor(body.raw, body.maxRounds));
      }
      if (method === "POST" && url.pathname === "/defects") {
        service.recordDefect((await readBody(req)) as DefectInput);
        return send(res, 201, { ok: true });
      }

      // --- Projects & RBAC ---
      if (access) {
        const cred = credentialOf(req);
        if (method === "GET" && url.pathname === "/projects") return send(res, 200, access.listProjects());
        if (method === "POST" && url.pathname === "/projects") {
          const body = (await readBody(req)) as { id: string; name: string; repo?: string; configPath?: string };
          return send(res, 201, await access.createProject(cred, body));
        }
        if (parts[0] === "projects" && parts[1]) {
          const projectId = decodeURIComponent(parts[1]);
          if (method === "GET" && parts.length === 2) {
            const p = access.getProject(projectId);
            return p ? send(res, 200, p) : send(res, 404, { error: "not found" });
          }
          // GET /projects/:id/can/:capability — does the caller hold a capability?
          if (method === "GET" && parts[2] === "can" && parts[3]) {
            const decision = await access.check(cred, projectId, parts[3] as Capability);
            return send(res, 200, decision);
          }
          if (parts[2] === "members") {
            if (method === "POST") {
              const m = (await readBody(req)) as Membership;
              return send(res, 200, await access.upsertMember(cred, projectId, m));
            }
            if (method === "DELETE" && parts[3]) {
              return send(res, 200, await access.removeMember(cred, projectId, decodeURIComponent(parts[3])));
            }
          }
        }
      }

      if (parts[0] === "instances" && parts[1]) {
        const specId = decodeURIComponent(parts[1]);
        if (method === "GET" && parts.length === 2) {
          const inst = service.getInstance(specId);
          return inst ? send(res, 200, inst) : send(res, 404, { error: "not found" });
        }
        if (method === "POST" && parts[2] === "events") {
          const result = service.transition(specId, (await readBody(req)) as WorkflowEvent);
          return send(res, result.ok ? 200 : 409, result);
        }
        if (method === "POST" && parts[2] === "verify") return send(res, 200, service.verify(specId));
        if (method === "POST" && parts[2] === "semantic") return send(res, 200, await service.semantic(specId));
        if (method === "GET" && parts[2] === "run-eligibility") {
          return send(res, 200, service.runEligibility(specId));
        }
        // Admin-only capability gate (when RBAC is enabled). Returns the actor id.
        const gateCapability = async (cap: Capability): Promise<{ allowed: boolean; actor: string; reason?: string }> => {
          const cred = credentialOf(req);
          if (!access?.enabled) return { allowed: true, actor: "local" };
          const projectId = req.headers["x-specgate-project"];
          const decision = await access.check(cred, typeof projectId === "string" ? projectId : "", cap);
          return { allowed: decision.allowed, actor: decision.principal?.id ?? "unknown", reason: decision.reason };
        };

        if (method === "POST" && parts[2] === "run") {
          const g = await gateCapability("run");
          if (!g.allowed) return send(res, 403, { error: `run denied: ${g.reason}` });
          return send(res, 200, await service.run(specId));
        }
        if (method === "GET" && parts[2] === "can-merge") return send(res, 200, service.canMerge(specId));
        if (method === "GET" && parts[2] === "overrides") return send(res, 200, service.overridesForSpec(specId));
        if (method === "POST" && parts[2] === "override") {
          const g = await gateCapability("override");
          if (!g.allowed) return send(res, 403, { error: `override denied: ${g.reason}` });
          const body = (await readBody(req)) as { justification: string; findingCode?: string };
          return send(res, 200, service.override({ specId, actor: g.actor, justification: body.justification, findingCode: body.findingCode }));
        }
        if (method === "POST" && parts[2] === "merge") {
          const g = await gateCapability("merge");
          if (!g.allowed) return send(res, 403, { error: `merge denied: ${g.reason}` });
          const body = (await readBody(req)) as { prNumber?: number; method?: "merge" | "squash" | "rebase" };
          return send(res, 200, await service.merge({ specId, prNumber: body.prNumber, method: body.method }));
        }
      }

      // --- Dashboard static files ---
      if (method === "GET" && options.staticDir && serveStatic(res, options.staticDir, url.pathname)) {
        return;
      }

      send(res, 404, { error: "no route" });
    } catch (err) {
      const status = (err as { status?: number }).status;
      send(res, typeof status === "number" ? status : 400, { error: (err as Error).message });
    }
  });
}
