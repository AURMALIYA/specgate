import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Engine packages must be free of any platform/vendor/product identifier.
 * Adapter packages (scm-adapter) and apps (action, api, dashboard) are exempt
 * by design — adapters are vendor-specific.
 */
const ENGINE_PACKAGES = [
  "config",
  "spec-schema",
  "policy",
  "risk-tier",
  "registry",
  "conflict-engine",
  "gate",
  "cli",
];

function loadDenylist(): string[] {
  const text = readFileSync(join(ROOT, "scripts", "neutrality-denylist.txt"), "utf8");
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // package not created yet
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectTsFiles(full));
    else if (e.isFile() && e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("engine neutrality", () => {
  const denylist = loadDenylist();

  it("loads a non-empty denylist", () => {
    expect(denylist.length).toBeGreaterThan(0);
  });

  it("contains no platform/vendor/product identifiers in engine package sources", () => {
    const violations: string[] = [];
    const patterns = denylist.map((token) => ({
      token,
      re: new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    }));

    for (const pkg of ENGINE_PACKAGES) {
      const srcDir = join(ROOT, "packages", pkg, "src");
      for (const file of collectTsFiles(srcDir)) {
        const text = readFileSync(file, "utf8");
        const lines = text.split(/\r?\n/);
        for (const [token, item] of patterns.entries()) {
          void token;
          if (item.re.test(text)) {
            lines.forEach((line, i) => {
              if (item.re.test(line)) {
                violations.push(`${file}:${i + 1} contains denylisted "${item.token}": ${line.trim()}`);
              }
            });
          }
        }
      }
    }

    expect(violations, `Engine neutrality violations:\n${violations.join("\n")}`).toEqual([]);
  });
});
