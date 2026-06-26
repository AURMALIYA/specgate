import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { validateSpec } from "@specgate/spec-schema";
import { describe, expect, it } from "vitest";
import { classifyTier, globToRegExp } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function parsed(rel: string) {
  const raw = readFileSync(resolve(ROOT, rel), "utf8");
  return validateSpec(raw, cfg, { path: rel }).parsed!;
}

describe("globToRegExp", () => {
  it("matches ** across separators and * within a segment", () => {
    expect(globToRegExp("services/iam/**").test("services/iam/login.ts")).toBe(true);
    expect(globToRegExp("**/scopes/**").test("a/b/scopes/c.ts")).toBe(true);
    expect(globToRegExp("*.md").test("a/b.md")).toBe(false);
    expect(globToRegExp("*.md").test("b.md")).toBe(true);
  });
});

describe("classifyTier", () => {
  it("keeps a clean storefront spec at its declared GREEN", () => {
    const t = classifyTier(cfg, { spec: parsed("config/example-org/specs/storefront-promotion-badge.md") });
    expect(t.finalTier).toBe("GREEN");
    expect(t.escalated).toBe(false);
    expect(t.hiddenRed).toBe(false);
  });

  it("force-escalates a GREEN spec touching the identity surface to RED (hidden-RED)", () => {
    const t = classifyTier(cfg, {
      spec: parsed("config/example-org/specs-conflict/hidden-red-merchant-roles.md"),
    });
    expect(t.declaredTier).toBe("GREEN");
    expect(t.finalTier).toBe("RED");
    expect(t.escalated).toBe(true);
    expect(t.hiddenRed).toBe(true);
    expect(t.hits.some((h) => h.surfaceId === "nw-iam-surface")).toBe(true);
    expect(t.requiredApproverRoles).toContain("pci-compliance-officer");
  });

  it("escalates via change-category floor even without a surface hit", () => {
    // A checkout-logic change is at least YELLOW by category floor.
    const raw = readFileSync(
      resolve(ROOT, "config/example-org/specs/storefront-promotion-badge.md"),
      "utf8",
    )
      .replace("change_categories:\n  - storefront-ui", "change_categories:\n  - cart-checkout-logic")
      .replace("risk_tier: GREEN", "risk_tier: GREEN");
    const spec = validateSpec(raw, cfg).parsed!;
    const t = classifyTier(cfg, { spec });
    expect(t.categoryFloor).toBe("YELLOW");
    expect(t.finalTier).toBe("YELLOW");
    expect(t.escalated).toBe(true);
  });

  it("uses changed file paths from a diff to trigger a surface", () => {
    const spec = parsed("config/example-org/specs/storefront-promotion-badge.md");
    const t = classifyTier(cfg, { spec, changedPaths: ["services/payments/settle.ts"] });
    expect(t.finalTier).toBe("RED");
    expect(t.hits.some((h) => h.surfaceId === "nw-payments-surface")).toBe(true);
  });
});
