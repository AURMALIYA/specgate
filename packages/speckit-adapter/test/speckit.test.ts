import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { runGate } from "@specgate/gate";
import { describe, expect, it } from "vitest";
import { buildPreset, generateSpecTemplate, gateSpecKitFeature, loadSpecKitFeature } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultCfg = loadConfig(resolve(ROOT, "config/default.config.yaml"));
const exampleCfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const FEATURE = resolve(ROOT, "config/example-org/speckit-example/specs/001-promo-badge");

describe("generated template stays in sync with the gate", () => {
  for (const [name, cfg] of [["default", defaultCfg], ["example-org", exampleCfg]] as const) {
    it(`the generated spec template passes the gate (${name} config)`, () => {
      const report = runGate({ raw: generateSpecTemplate(cfg), config: cfg, path: "template.md" });
      expect(report.ok, JSON.stringify(report.findings, null, 2)).toBe(true);
    });
  }
});

describe("buildPreset", () => {
  it("emits a valid Spec Kit preset bundle", () => {
    const { files } = buildPreset(exampleCfg);
    expect(Object.keys(files).sort()).toEqual([
      "LICENSE",
      "README.md",
      "commands/speckit.gate.md",
      "preset.yml",
      "templates/constitution-template.md",
      "templates/spec-template.md",
    ]);
    expect(files["preset.yml"]).toContain('schema_version: "1.0"');
    expect(files["preset.yml"]).toContain('id: "specgate"');
    expect(files["preset.yml"]).toContain('replaces: "spec-template"');
    expect(files["preset.yml"]).toContain('name: "speckit.gate"');
    expect(files["commands/speckit.gate.md"]).toContain("/speckit.implement");
    expect(files["templates/constitution-template.md"]).toContain("no-regulated-data-in-context");
  });
});

describe("Spec Kit feature ingestion", () => {
  it("loads spec.md plus constitution, plan, and tasks as prompt-context", () => {
    const a = loadSpecKitFeature(FEATURE);
    expect(a.specPath).toMatch(/001-promo-badge\/spec\.md$/);
    expect(a.constitutionPath).toBeDefined();
    expect(a.planPath).toBeDefined();
    expect(a.tasksPath).toBeDefined();
    expect(a.promptContext.length).toBeGreaterThanOrEqual(3);
  });

  it("gates a conformant Spec Kit feature to a pass", () => {
    const { report, artifacts } = gateSpecKitFeature(FEATURE, exampleCfg);
    expect(report.ok, JSON.stringify(report.findings, null, 2)).toBe(true);
    expect(report.specId).toBe("NW-SK-PROMO-001");
    expect(artifacts.constitutionPath).toBeDefined();
  });

  it("scans Spec Kit artifacts for regulated-data tokens via the constitution rule", () => {
    const artifacts = loadSpecKitFeature(FEATURE);
    const polluted = {
      ...artifacts,
      promptContext: [...artifacts.promptContext, { ref: "plan.md", text: "test card 4111 1111 1111 1111" }],
    };
    const report = runGate({
      raw: artifacts.specRaw,
      config: exampleCfg,
      path: artifacts.specPath,
      facts: { promptContext: polluted.promptContext },
    });
    expect(report.findings.some((f) => f.code === "policy.no-regulated-data-in-context")).toBe(true);
  });
});
