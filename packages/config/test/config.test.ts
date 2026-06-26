import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, parseConfig, ConfigError, maxTier, tierBelow } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("config loader", () => {
  it("loads the default config", () => {
    const cfg = loadConfig(resolve(ROOT, "config/default.config.yaml"));
    expect(cfg.org).toBe("default");
    expect(cfg.changeTaxonomy.categories.length).toBeGreaterThan(0);
    expect(cfg.reviewerMatrix.RED?.minApprovals).toBe(3);
  });

  it("loads the example-org config", () => {
    const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
    expect(cfg.org).toBe("northwind-commerce-cloud");
    expect(cfg.dataScopes).toContain("merchant");
    expect(cfg.semantic?.enabled).toBe(true);
  });

  it("rejects a restricted category that is not scaffold-only", () => {
    expect(() =>
      parseConfig({
        version: "1",
        org: "x",
        changeTaxonomy: {
          categories: [
            {
              id: "iam",
              label: "iam",
              sensitivity: "restricted",
              aiAuthorityCeiling: "draft-and-apply",
              minTier: "RED",
              restrictedDomain: true,
            },
          ],
        },
        dataScopes: ["own"],
        enforcementLayers: ["app"],
        reviewerMatrix: {
          GREEN: { verificationDepth: "x" },
          YELLOW: { verificationDepth: "x" },
          RED: { verificationDepth: "x" },
        },
        constitution: { rules: [] },
      }),
    ).toThrow(ConfigError);
  });

  it("rejects a config missing a reviewer-matrix tier", () => {
    expect(() =>
      parseConfig({
        version: "1",
        org: "x",
        changeTaxonomy: {
          categories: [
            {
              id: "ui",
              label: "ui",
              sensitivity: "low",
              aiAuthorityCeiling: "draft-and-apply",
              minTier: "GREEN",
            },
          ],
        },
        dataScopes: ["own"],
        enforcementLayers: ["app"],
        reviewerMatrix: { GREEN: { verificationDepth: "x" } },
        constitution: { rules: [] },
      }),
    ).toThrow(ConfigError);
  });
});

describe("tier helpers", () => {
  it("maxTier picks the more sensitive tier", () => {
    expect(maxTier("GREEN", "RED")).toBe("RED");
    expect(maxTier("YELLOW", "GREEN")).toBe("YELLOW");
  });
  it("tierBelow compares sensitivity", () => {
    expect(tierBelow("GREEN", "RED")).toBe(true);
    expect(tierBelow("RED", "GREEN")).toBe(false);
  });
});
