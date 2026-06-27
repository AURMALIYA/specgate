import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type RiskTier } from "@specgate/config";
import { validateSpec, type ParsedSpec } from "@specgate/spec-schema";
import { describe, expect, it } from "vitest";
import { runHarness, personaAccessRunner } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function parse(rel: string): ParsedSpec {
  return validateSpec(readFileSync(resolve(ROOT, rel), "utf8"), cfg, { path: rel }).parsed!;
}

function ctxFor(rel: string, finalTier: RiskTier) {
  return { spec: parse(rel), finalTier, config: cfg };
}

describe("verification harness", () => {
  it("compiles EARS criteria into stubs and derives access assertions for a clean spec", () => {
    const ctx = ctxFor("config/example-org/specs/storefront-promotion-badge.md", "GREEN");
    const result = runHarness(ctx);
    expect(result.passed).toBe(true);
    const ears = result.results.find((r) => r.runnerId === "ears-stub")!;
    expect(ears.artifacts.length).toBe(ctx.spec.criteria.filter((c) => c.valid).length);
    const access = result.results.find((r) => r.runnerId === "persona-access")!;
    expect(access.status).toBe("pass");
    expect(access.artifacts.length).toBeGreaterThan(0);
  });

  it("runs RED-tier runners and surfaces mandatory security todos", () => {
    const ctx = ctxFor("config/example-org/specs-conflict/hidden-red-merchant-roles.md", "RED");
    const result = runHarness(ctx);
    const sec = result.results.find((r) => r.runnerId === "security-data-gate")!;
    expect(sec.status).toBe("pass");
    expect(result.todos.some((t) => t.runnerId === "security-data-gate")).toBe(true);
  });

  it("FAILS persona-access on an editable-without-visible contradiction", () => {
    const ctx = ctxFor("config/example-org/specs/storefront-promotion-badge.md", "GREEN");
    const broken: ParsedSpec = {
      ...ctx.spec,
      accessMatrix: [
        { role: "ghost", resource: "ledger", visible: false, editable: true, data_scope: "all", enforcement_layer: "service", source_attribute: "", deny_cases: [], fallback: "" },
      ],
    };
    const result = personaAccessRunner.run({ spec: broken, finalTier: "GREEN", config: cfg });
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.status === "fail")).toBe(true);
  });

  it("FAILS rollback-validation when a promotable spec omits a rollback reference", () => {
    const ctx = ctxFor("config/example-org/specs/storefront-promotion-badge.md", "GREEN");
    const noRollback: ParsedSpec = {
      ...ctx.spec,
      sections: { ...ctx.spec.sections, verification_plan: "Automated checks only." },
    };
    const result = runHarness({ spec: noRollback, finalTier: "YELLOW", config: cfg });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.runnerId === "rollback-validation")).toBe(true);
  });
});
