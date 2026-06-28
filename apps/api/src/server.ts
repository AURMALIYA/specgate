import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { WorkflowEvent } from "@specgate/workflow";
import type { Capability, Membership } from "@specgate/rbac";
import { GitHubRepos, type GitHubOAuth } from "@specgate/scm-adapter";
import type { AccessController } from "./access.js";
import type { RateLimiter } from "./ratelimit.js";
import { readCookie, SESSION_COOKIE, setCookie, clearCookie, type SessionStore } from "./sessions.js";
import type { DefectInput, SpecGateService } from "./service.js";

/** Extract a bearer/token credential: a header token, or the logged-in session's token. */
function credentialOf(req: IncomingMessage, sessions?: SessionStore): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const tok = req.headers["x-specgate-token"];
  if (typeof tok === "string") return tok;
  const sid = readCookie(req.headers["cookie"], SESSION_COOKIE);
  return sid && sessions ? sessions.get(sid)?.token : undefined;
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
  /** Optional rate limiter applied to all routes except /health. */
  rateLimiter?: RateLimiter;
  /** Session store — enables /auth/* login routes. */
  sessions?: SessionStore;
  /** GitHub OAuth helper — enables "Sign in with GitHub". */
  oauth?: GitHubOAuth;
}

/** Build an HTTP server exposing the service + dashboard. */
export function buildServer(service: SpecGateService, options: ServerOptions = {}): Server {
  const access = options.access;
  const sessions = options.sessions;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = req.method ?? "GET";

      // --- API routes ---
      if (method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

      if (options.rateLimiter) {
        const key = credentialOf(req, sessions) ?? req.socket.remoteAddress ?? "anon";
        if (!options.rateLimiter.allow(key, Date.now())) {
          return send(res, 429, { error: "rate limit exceeded" });
        }
      }

      // --- Auth (sign-in / session) ---
      if (sessions) {
        if (method === "GET" && url.pathname === "/auth/me") {
          const sid = readCookie(req.headers["cookie"], SESSION_COOKIE);
          const s = sid ? sessions.get(sid) : undefined;
          return s ? send(res, 200, { principal: s.principal, oauth: !!options.oauth }) : send(res, 401, { error: "not signed in", oauth: !!options.oauth });
        }
        if (method === "POST" && url.pathname === "/auth/logout") {
          const sid = readCookie(req.headers["cookie"], SESSION_COOKIE);
          if (sid) sessions.delete(sid);
          res.writeHead(200, { "content-type": "application/json", "set-cookie": clearCookie(SESSION_COOKIE) });
          return res.end(JSON.stringify({ ok: true }));
        }
        // Token-based session (dev + API clients): exchange a token for a session cookie.
        if (method === "POST" && url.pathname === "/auth/session" && access) {
          const body = (await readBody(req)) as { token: string };
          const principal = body.token ? await access.authenticate(body.token) : null;
          if (!principal) return send(res, 401, { error: "authentication failed" });
          const s = sessions.create(principal, body.token);
          res.writeHead(200, { "content-type": "application/json", "set-cookie": setCookie(SESSION_COOKIE, s.id) });
          return res.end(JSON.stringify({ principal }));
        }
        // Sign in with GitHub (OAuth authorization-code flow).
        if (method === "GET" && url.pathname === "/auth/login") {
          if (!options.oauth) return send(res, 501, { error: "GitHub OAuth not configured" });
          const state = Math.random().toString(36).slice(2);
          res.writeHead(302, { Location: options.oauth.authorizeUrl(state), "set-cookie": setCookie("sg_oauth_state", state) });
          return res.end();
        }
        if (method === "GET" && url.pathname === "/auth/github/callback" && options.oauth && access) {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!code || !state || state !== readCookie(req.headers["cookie"], "sg_oauth_state")) {
            return send(res, 400, { error: "invalid OAuth callback (state mismatch)" });
          }
          const token = await options.oauth.exchangeCode(code);
          const principal = token ? await access.authenticate(token) : null;
          if (!principal || !token) return send(res, 401, { error: "GitHub sign-in failed" });
          const s = sessions.create(principal, token);
          res.writeHead(302, { Location: "/", "set-cookie": setCookie(SESSION_COOKIE, s.id) });
          return res.end();
        }
      }

      // --- Repo-first browsing (uses the signed-in user's GitHub token) ---
      if (url.pathname.startsWith("/github/")) {
        const token = credentialOf(req, sessions);
        if (!token) return send(res, 401, { error: "sign in with GitHub first" });
        const gh = new GitHubRepos({ token });
        if (method === "GET" && url.pathname === "/github/repos") {
          return send(res, 200, await gh.listRepos());
        }
        if (method === "GET" && url.pathname === "/github/specs") {
          const repo = url.searchParams.get("repo");
          if (!repo) return send(res, 400, { error: "repo query param required" });
          return send(res, 200, await gh.listSpecPaths(repo));
        }
        // Fetch a spec from GitHub and ingest it so the gate/tier/workflow apply.
        if (method === "POST" && url.pathname === "/github/ingest") {
          const body = (await readBody(req)) as { repo: string; path: string };
          const raw = await gh.getSpecFile(body.repo, body.path);
          return send(res, 201, service.ingest(raw, `${body.repo}/${body.path}`));
        }
      }

      // Audit log (override events) — observability for the audit trail.
      if (method === "GET" && url.pathname === "/audit") return send(res, 200, service.provenance.overrides());
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
        const cred = credentialOf(req, sessions);
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

        // Capability gate (when RBAC is enabled). Returns the signed-in actor id.
        const gateCapability = async (cap: Capability): Promise<{ allowed: boolean; actor: string; reason?: string }> => {
          const cred = credentialOf(req, sessions);
          if (!access?.enabled) return { allowed: true, actor: "local" };
          const projectId = req.headers["x-specgate-project"];
          const decision = await access.check(cred, typeof projectId === "string" ? projectId : "", cap);
          return { allowed: decision.allowed, actor: decision.principal?.id ?? "unknown", reason: decision.reason };
        };

        if (method === "GET" && parts.length === 2) {
          const inst = service.getInstance(specId);
          return inst ? send(res, 200, inst) : send(res, 404, { error: "not found" });
        }
        if (method === "POST" && parts[2] === "events") {
          const event = (await readBody(req)) as WorkflowEvent;
          // Approvals are a privileged action: require the "approve" capability and
          // record the SIGNED-IN identity (no self-asserted approver spoofing).
          if (event.type === "approve") {
            const g = await gateCapability("approve");
            if (!g.allowed) return send(res, 403, { error: `approve denied: ${g.reason}` });
            if (access?.enabled) (event as { identity: string }).identity = g.actor;
          }
          const result = service.transition(specId, event);
          return send(res, result.ok ? 200 : 409, result);
        }
        if (method === "GET" && parts[2] === "detail") return send(res, 200, service.specDetail(specId));
        if (method === "POST" && parts[2] === "verify") return send(res, 200, service.verify(specId));
        if (method === "POST" && parts[2] === "semantic") return send(res, 200, await service.semantic(specId));
        if (method === "GET" && parts[2] === "run-eligibility") {
          return send(res, 200, service.runEligibility(specId));
        }

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
