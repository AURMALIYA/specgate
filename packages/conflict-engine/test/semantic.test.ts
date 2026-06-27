import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type SpecGateConfig } from "@specgate/config";
import { validateSpec, type ParsedSpec } from "@specgate/spec-schema";
import { Registry } from "@specgate/registry";
import { describe, expect, it } from "vitest";
import {
  buildSemanticPrompt,
  runSemanticConflicts,
  selectRelatedSpecIds,
  type SemanticClient,
  type SemanticResult,
} from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function parsed(rel: string): ParsedSpec {
  return validateSpec(readFileSync(resolve(ROOT, rel), "utf8"), cfg, { path: rel }).parsed!;
}

class FakeClient implements SemanticClient {
  constructor(private readonly result: SemanticResult | Error) {}
  lastPrompt = "";
  async analyze(prompt: string): Promise<SemanticResult> {
    this.lastPrompt = prompt;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

const support = parsed("config/example-org/specs-conflict/order-notes-support.md");
const readonly = parsed("config/example-org/specs-conflict/order-notes-readonly.md");

describe("selectRelatedSpecIds", () => {
  it("relates specs sharing an access resource", () => {
    const reg = Registry.fromParsedSpecs([support, readonly]);
    expect(selectRelatedSpecIds(reg, "NW-NOTES-SUPPORT", 5)).toContain("NW-NOTES-READONLY");
  });
});

describe("runSemanticConflicts", () => {
  it("maps model output to warn-only findings citing requirement ids", async () => {
    const client = new FakeClient({
      findings: [
        {
          kind: "overlapping-intent",
          specIds: ["NW-NOTES-SUPPORT", "NW-NOTES-READONLY"],
          requirementIds: ["REQ-3001", "REQ-3002"],
          explanation: "Both specs govern editing of order notes.",
        },
      ],
    });
    const findings = await runSemanticConflicts({ target: support, related: [readonly], config: cfg, client });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warn");
    expect(findings[0]!.type).toBe("semantic");
    expect(findings[0]!.explanation).toMatch(/REQ-3001/);
    expect(client.lastPrompt).toContain("TARGET");
  });

  it("returns [] when the semantic layer is disabled in config", async () => {
    const disabled: SpecGateConfig = { ...cfg, semantic: { ...cfg.semantic!, enabled: false } };
    const client = new FakeClient({ findings: [{ kind: "overlapping-intent", specIds: [], requirementIds: [], explanation: "x" }] });
    expect(await runSemanticConflicts({ target: support, related: [readonly], config: disabled, client })).toEqual([]);
  });

  it("fails open (never blocks) when the client throws", async () => {
    const client = new FakeClient(new Error("network down"));
    expect(await runSemanticConflicts({ target: support, related: [readonly], config: cfg, client })).toEqual([]);
  });

  it("builds a prompt that includes both target and related spec ids", () => {
    const prompt = buildSemanticPrompt(support, [readonly]);
    expect(prompt).toContain("NW-NOTES-SUPPORT");
    expect(prompt).toContain("NW-NOTES-READONLY");
  });
});
