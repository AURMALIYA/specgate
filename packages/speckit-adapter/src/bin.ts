#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "@specgate/config";
import { buildPreset } from "./preset.js";
import { gateSpecKitFeature } from "./ingest.js";

const HELP = `specgate-speckit — Spec Kit integration for SpecGate

Usage:
  specgate-speckit emit-preset <outDir> [--config <path>]   Generate a Spec Kit preset bundle
  specgate-speckit gate <featureDir> [--config <path>]      Gate a Spec Kit specs/<feature>/ dir

Options:
  -c, --config <path>   Org config (YAML). Defaults to config/default.config.yaml
  -h, --help            Show this help
`;

function fail(msg: string): never {
  process.stderr.write(`specgate-speckit: ${msg}\n`);
  process.exit(2);
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    return 0;
  }
  const cmd = argv[0];
  const positionals: string[] = [];
  let configPath = "config/default.config.yaml";
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-c" || a === "--config") configPath = argv[++i] ?? configPath;
    else positionals.push(a);
  }
  const config = loadConfig(configPath);

  if (cmd === "emit-preset") {
    const outDir = positionals[0];
    if (!outDir) fail("emit-preset requires an output directory");
    const bundle = buildPreset(config);
    for (const [rel, content] of Object.entries(bundle.files)) {
      const full = join(outDir!, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content, "utf8");
      process.stdout.write(`wrote ${full}\n`);
    }
    return 0;
  }

  if (cmd === "gate") {
    const featureDir = positionals[0];
    if (!featureDir) fail("gate requires a Spec Kit feature directory");
    const { artifacts, report } = gateSpecKitFeature(featureDir!, config);
    process.stdout.write(`spec: ${report.specId ?? "<unparsed>"} (${report.path})\n`);
    process.stdout.write(
      `artifacts: constitution=${!!artifacts.constitutionPath} plan=${!!artifacts.planPath} tasks=${!!artifacts.tasksPath} contracts=${artifacts.contractPaths.length}\n`,
    );
    if (report.tier) {
      const t = report.tier;
      process.stdout.write(`tier: ${t.escalated ? `${t.declaredTier} -> ${t.finalTier} (ESCALATED)` : t.finalTier}\n`);
    }
    for (const f of report.findings) {
      process.stdout.write(`  ${f.severity === "block" ? "✗" : "⚠"} ${f.source}:${f.code} ${f.message}\n`);
    }
    process.stdout.write(`${report.ok ? "PASS" : "FAIL"} — ${report.blockCount} blocking, ${report.warnCount} warning(s)\n`);
    return report.ok ? 0 : 1;
  }

  fail(`unknown command "${cmd}". Run with --help.`);
}

process.exit(main());
