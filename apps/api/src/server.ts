import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { WorkflowEvent } from "@specgate/workflow";
import type { SpecGateService } from "./service.js";

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Build an HTTP server exposing the service. Routing is intentionally minimal. */
export function buildServer(service: SpecGateService): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = req.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
      if (method === "GET" && url.pathname === "/metrics") return send(res, 200, service.metrics());
      if (method === "GET" && url.pathname === "/instances") return send(res, 200, service.listInstances());

      if (method === "POST" && url.pathname === "/ingest") {
        const body = (await readBody(req)) as { raw: string; path?: string };
        return send(res, 201, service.ingest(body.raw, body.path));
      }

      if (parts[0] === "instances" && parts[1]) {
        const specId = decodeURIComponent(parts[1]);
        if (method === "GET" && parts.length === 2) {
          const inst = service.getInstance(specId);
          return inst ? send(res, 200, inst) : send(res, 404, { error: "not found" });
        }
        if (method === "POST" && parts[2] === "events") {
          const event = (await readBody(req)) as WorkflowEvent;
          const result = service.transition(specId, event);
          return send(res, result.ok ? 200 : 409, result);
        }
        if (method === "POST" && parts[2] === "verify") {
          return send(res, 200, service.verify(specId));
        }
      }

      send(res, 404, { error: "no route" });
    } catch (err) {
      send(res, 400, { error: (err as Error).message });
    }
  });
}
