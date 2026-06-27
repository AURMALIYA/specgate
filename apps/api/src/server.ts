import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { WorkflowEvent } from "@specgate/workflow";
import type { DefectInput, SpecGateService } from "./service.js";

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
}

/** Build an HTTP server exposing the service + dashboard. */
export function buildServer(service: SpecGateService, options: ServerOptions = {}): Server {
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
      }

      // --- Dashboard static files ---
      if (method === "GET" && options.staticDir && serveStatic(res, options.staticDir, url.pathname)) {
        return;
      }

      send(res, 404, { error: "no route" });
    } catch (err) {
      send(res, 400, { error: (err as Error).message });
    }
  });
}
