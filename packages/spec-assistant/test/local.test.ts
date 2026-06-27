import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { runGate } from "@specgate/gate";
import { describe, expect, it } from "vitest";
import { coAuthorSpec, LocalSpecAssistantClient, repairSpec } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const GOOD = readFileSync(resolve(ROOT, "config/example-org/specs/storefront-promotion-badge.md"), "utf8");

describe("LocalSpecAssistantClient (offline, no API key)", () => {
  it("repairs a non-EARS acceptance criterion into valid EARS", () => {
    const broken = GOOD.replace(
      "- WHEN a product has an active promotion THE SYSTEM SHALL display a promotion badge on the product card.",
      "- The system should show a promotion badge fast.",
    );
    expect(runGate({ raw: broken, config: cfg }).ok).toBe(false);
    const fixed = repairSpec(broken, cfg);
    expect(fixed).toContain("THE SYSTEM SHALL show a promotion badge fast.");
    expect(runGate({ raw: fixed, config: cfg }).ok).toBe(true);
  });

  it("re-adds a missing gate section so the spec parses again", () => {
    // Drop the entire access-matrix section heading + body.
    const withoutMatrix = GOOD.replace(/# 3\. Persona & access matrix[\s\S]*?(?=# 4\.)/, "");
    expect(runGate({ raw: withoutMatrix, config: cfg }).ok).toBe(false);
    const fixed = repairSpec(withoutMatrix, cfg);
    expect(fixed).toMatch(/# Persona & access matrix/);
  });

  it("drives the co-author loop to a pass with no API key", async () => {
    const broken = GOOD.replace(
      "- WHEN a product has an active promotion THE SYSTEM SHALL display a promotion badge on the product card.",
      "- it should be quick and pretty.",
    );
    const result = await coAuthorSpec({ raw: broken, config: cfg, client: new LocalSpecAssistantClient(cfg) });
    expect(result.before.ok).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.rounds).toBeGreaterThanOrEqual(1);
  });
});
