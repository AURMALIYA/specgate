import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { describe, expect, it } from "vitest";
import { runGate } from "../src/gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const exampleCfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const defaultCfg = loadConfig(resolve(ROOT, "config/default.config.yaml"));

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("runGate", () => {
  it("passes a well-formed example spec with no blocking findings", () => {
    const report = runGate({
      raw: read("config/example-org/specs/storefront-promotion-badge.md"),
      config: exampleCfg,
      path: "storefront-promotion-badge.md",
    });
    expect(report.ok, JSON.stringify(report.findings, null, 2)).toBe(true);
    expect(report.blockCount).toBe(0);
  });

  it("fails a malformed spec and merges schema + policy findings", () => {
    const report = runGate({
      raw: read("config/example-org/specs-invalid/malformed-checkout.md"),
      config: exampleCfg,
      path: "malformed-checkout.md",
    });
    expect(report.ok).toBe(false);
    expect(report.blockCount).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.source === "schema")).toBe(true);
  });

  it("passes the platform's own dogfood specs under the default config", () => {
    for (const rel of ["specs/standardization-gate.md", "specs/platform-agnosticism.md"]) {
      const report = runGate({ raw: read(rel), config: defaultCfg, path: rel });
      expect(report.ok, `${rel}: ${JSON.stringify(report.findings, null, 2)}`).toBe(true);
    }
  });
});
