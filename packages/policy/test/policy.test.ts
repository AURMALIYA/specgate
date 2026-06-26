import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { validateSpec } from "@specgate/spec-schema";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/evaluate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function parse(rel: string) {
  const raw = readFileSync(resolve(ROOT, rel), "utf8");
  const report = validateSpec(raw, cfg, { path: rel });
  return { raw, spec: report.parsed! };
}

describe("constitution evaluators", () => {
  it("emits a manual checklist and no violations for the good spec", () => {
    const { raw, spec } = parse("config/example-org/specs/storefront-promotion-badge.md");
    const report = evaluatePolicy({ spec, rawText: raw, config: cfg });
    expect(report.findings).toEqual([]);
    expect(report.manualChecklist.map((m) => m.ruleId)).toContain("pci-scope-documented");
  });

  it("flags a regulated-data token in the spec text", () => {
    const { raw, spec } = parse("config/example-org/specs/storefront-promotion-badge.md");
    const polluted = raw + "\nExample card: 4111 1111 1111 1111\n";
    const report = evaluatePolicy({ spec, rawText: polluted, config: cfg });
    expect(report.findings.map((f) => f.ruleId)).toContain("no-regulated-data-in-context");
  });

  it("blocks when generator and verifier identities match", () => {
    const { raw, spec } = parse("config/example-org/specs/storefront-promotion-badge.md");
    const report = evaluatePolicy({
      spec,
      rawText: raw,
      config: cfg,
      facts: { generatorId: "agent-7", verifierId: "agent-7" },
    });
    expect(report.findings.map((f) => f.ruleId)).toContain("generator-verifier-differ");
  });

  it("does not flag distinct generator and verifier", () => {
    const { raw, spec } = parse("config/example-org/specs/storefront-promotion-badge.md");
    const report = evaluatePolicy({
      spec,
      rawText: raw,
      config: cfg,
      facts: { generatorId: "agent-7", verifierId: "human-2" },
    });
    expect(report.findings.map((f) => f.ruleId)).not.toContain("generator-verifier-differ");
  });
});
