import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { describe, expect, it } from "vitest";
import { buildCoAuthorPrompt, coAuthorSpec, type SpecAssistantClient } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const GOOD = readFileSync(resolve(ROOT, "config/example-org/specs/storefront-promotion-badge.md"), "utf8");

// A draft that fails the gate: a non-EARS acceptance criterion.
const BROKEN = GOOD.replace(
  "- WHEN a product has an active promotion THE SYSTEM SHALL display a promotion badge on the product card.",
  "- The badge should look nice and load fast.",
);

/** Returns a fixed revised spec regardless of prompt. */
function fixedClient(revisedSpec: string): SpecAssistantClient {
  return { async improve() { return { revisedSpec }; } };
}

describe("coAuthorSpec", () => {
  it("converges a failing draft to a passing spec via the re-gate loop", async () => {
    const result = await coAuthorSpec({ raw: BROKEN, config: cfg, client: fixedClient(GOOD) });
    expect(result.before.ok).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.rounds).toBe(1);
    expect(result.history[0]?.adopted).toBe(true);
    expect(result.finalSpec).toBe(GOOD);
  });

  it("does no rounds when the draft already passes", async () => {
    const result = await coAuthorSpec({ raw: GOOD, config: cfg, client: fixedClient("anything") });
    expect(result.passed).toBe(true);
    expect(result.rounds).toBe(0);
    expect(result.finalSpec).toBe(GOOD);
  });

  it("keeps the original and stops when a revision does not improve", async () => {
    // Client returns an even-more-broken spec (more blocking findings).
    const worse = BROKEN.replace(/risk_tier: GREEN/, "risk_tier: PURPLE");
    const result = await coAuthorSpec({ raw: BROKEN, config: cfg, client: fixedClient(worse) });
    expect(result.passed).toBe(false);
    expect(result.finalSpec).toBe(BROKEN); // not regressed to the worse draft
    expect(result.history[0]?.adopted).toBe(false);
  });

  it("fails safe when the client throws", async () => {
    const throwing: SpecAssistantClient = { async improve() { throw new Error("model down"); } };
    const result = await coAuthorSpec({ raw: BROKEN, config: cfg, client: throwing });
    expect(result.passed).toBe(false);
    expect(result.finalSpec).toBe(BROKEN);
  });

  it("builds a prompt that lists the findings and includes the spec", () => {
    const prompt = buildCoAuthorPrompt("SPEC BODY", [{ code: "ears.non_testable", message: "not EARS", location: "acceptance_criteria" }]);
    expect(prompt).toContain("ears.non_testable");
    expect(prompt).toContain("SPEC BODY");
    expect(prompt).toMatch(/return only the full revised markdown spec/i);
  });
});
