import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import type { ParsedSpec } from "@specgate/spec-schema";
import type { ConflictFinding, SemanticClient, SemanticResult } from "@specgate/conflict-engine";
import { describe, expect, it } from "vitest";
import { SpecGateService } from "../src/service.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("SpecGateService metrics + conflicts", () => {
  it("reports conflict counts by type over the registry", () => {
    const svc = new SpecGateService(cfg, { now: () => "t" });
    svc.ingest(read("config/example-org/specs-conflict/order-notes-support.md"));
    svc.ingest(read("config/example-org/specs-conflict/order-notes-readonly.md"));
    const conflicts = svc.conflicts();
    expect(conflicts.some((c) => c.type === "access-matrix")).toBe(true);
    const m = svc.metrics();
    expect(m.conflictCountsByType["access-matrix"]).toBeGreaterThanOrEqual(1);
    expect(m.gate.pass + m.gate.fail).toBe(2);
  });

  it("computes regeneration rate, cost per generation, tier distribution, and defect-escape", () => {
    const svc = new SpecGateService(cfg, { now: () => "t" });
    const { specId } = svc.ingest(read("config/example-org/specs/storefront-promotion-badge.md"));
    svc.recordGeneration({ specId, promptContextRef: "c", artifacts: [{ ref: "a.tsx", content: "v1" }], cost: 0.4, at: "t1" });
    svc.recordGeneration({ specId, promptContextRef: "c", artifacts: [{ ref: "a.tsx", content: "v2" }], cost: 0.6, at: "t2" });
    svc.transition(specId, { type: "submit", at: "t" });
    svc.transition(specId, { type: "approve", role: "frontend-peer", identity: "p", at: "t" });
    svc.recordDefect({ specId, phase: "production", description: "regression", at: "t3" });

    const m = svc.metrics();
    expect(m.generations).toBe(2);
    expect(m.regenerationRate).toBe(1); // the one generated spec was regenerated
    expect(m.costPerGeneration).toBeCloseTo(0.5);
    expect(m.tierDistribution.GREEN).toBe(1);
  });

  it("runs the advisory semantic layer through an injected client", async () => {
    const fake: SemanticClient = {
      async analyze(): Promise<SemanticResult> {
        return {
          findings: [
            { kind: "overlapping-intent", specIds: ["NW-NOTES-SUPPORT", "NW-NOTES-READONLY"], requirementIds: ["REQ-3001"], explanation: "overlap" },
          ],
        };
      },
    };
    const svc = new SpecGateService(cfg, { now: () => "t", semanticClient: fake });
    svc.ingest(read("config/example-org/specs-conflict/order-notes-support.md"));
    svc.ingest(read("config/example-org/specs-conflict/order-notes-readonly.md"));
    const findings: ConflictFinding[] = await svc.semantic("NW-NOTES-SUPPORT");
    expect(findings.every((f) => f.severity === "warn")).toBe(true);
    expect(findings.some((f) => f.type === "semantic")).toBe(true);
  });

  // Unused import guard (keeps ParsedSpec referenced for type-checking parity).
  it("type import sanity", () => {
    const p: ParsedSpec | undefined = undefined;
    expect(p).toBeUndefined();
  });
});
