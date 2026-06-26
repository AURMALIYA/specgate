import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { describe, expect, it } from "vitest";
import { validateSpec } from "../src/validate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("validateSpec", () => {
  it("passes the well-formed example spec", () => {
    const raw = read("config/example-org/specs/storefront-promotion-badge.md");
    const report = validateSpec(raw, cfg, { path: "storefront-promotion-badge.md" });
    expect(report.ok, JSON.stringify(report.findings, null, 2)).toBe(true);
    expect(report.specId).toBe("NW-STOREFRONT-001");
    expect(report.parsed?.accessMatrix).toHaveLength(2);
    expect(report.parsed?.criteria.every((c) => c.valid)).toBe(true);
  });

  it("blocks the malformed spec and names the issues", () => {
    const raw = read("config/example-org/specs-invalid/malformed-checkout.md");
    const report = validateSpec(raw, cfg, { path: "malformed-checkout.md" });
    expect(report.ok).toBe(false);
    const codes = report.findings.map((f) => f.code);
    // Missing Verification plan gate section.
    expect(codes).toContain("gate_section.missing");
    // Non-EARS + bundled criteria.
    expect(codes).toContain("ears.non_testable");
    // Invalid data_scope "galaxy".
    expect(codes).toContain("access_matrix.data_scope");
    // Non-boolean "editable".
    expect(codes).toContain("access_matrix.parse");
  });

  it("names a missing gate section", () => {
    const report = validateSpec(
      read("config/example-org/specs-invalid/malformed-checkout.md"),
      cfg,
    );
    const missing = report.findings.find((f) => f.code === "gate_section.missing");
    expect(missing?.message).toMatch(/Verification plan/);
  });

  it("derives a version from the content hash when none is declared", () => {
    const raw = read("config/example-org/specs/storefront-promotion-badge.md").replace(
      /^version: .*$/m,
      "",
    );
    const report = validateSpec(raw, cfg);
    expect(report.parsed?.resolvedVersion).toMatch(/^sha256:/);
  });
});
