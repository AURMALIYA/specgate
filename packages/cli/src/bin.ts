#!/usr/bin/env node
import { CliConfigError, resolveConfig } from "./resolve-config.js";
import { formatConflicts, formatGateReport, formatTier, summarize } from "./format.js";
import { runBatchOverFiles, runValidateOverFiles } from "./run.js";

const HELP = `specgate — spec-driven development governance

Usage:
  specgate <command> [paths...] [options]

Commands:
  validate <paths...>    Standardization gate: schema + EARS + constitution (per spec)
  tier <paths...>        Re-derive risk tiers and surface hidden-RED escalation
  conflicts <paths...>   Detect cross-spec conflicts (access, capability, cycle, contract)
  gate <paths...>        Full gate: schema + constitution + tier + conflicts (batch)

Options:
  -c, --config <path>    Path to the org config (YAML). Falls back to specgate.config.yaml
  -f, --format <fmt>     Output format: text (default) | json
  -h, --help             Show this help
  -v, --version          Show version

Exit codes:
  0  no blocking findings
  1  at least one blocking finding
  2  usage / configuration error
`;

interface ParsedArgs {
  command?: string;
  paths: string[];
  config?: string;
  format: "text" | "json";
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { paths: [], format: "text", help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-v" || a === "--version") out.version = true;
    else if (a === "-c" || a === "--config") out.config = argv[++i];
    else if (a === "-f" || a === "--format") {
      const f = argv[++i];
      out.format = f === "json" ? "json" : "text";
    } else if (!out.command) out.command = a;
    else out.paths.push(a);
  }
  return out;
}

function fail(message: string, code = 2): never {
  process.stderr.write(`specgate: ${message}\n`);
  process.exit(code);
}

function loadConfigOrFail(path: string | undefined) {
  try {
    return resolveConfig(path);
  } catch (err) {
    if (err instanceof CliConfigError) fail(err.message);
    throw err;
  }
}

function reportMissing(missing: string[]): void {
  for (const m of missing) process.stderr.write(`specgate: path not found: ${m}\n`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write("specgate 0.2.0\n");
    return 0;
  }
  if (args.help || !args.command) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!["validate", "tier", "conflicts", "gate"].includes(args.command)) {
    fail(`unknown command "${args.command}". Run with --help.`);
  }
  if (args.paths.length === 0) fail("no spec paths provided");
  const config = loadConfigOrFail(args.config);

  if (args.command === "validate") {
    const { reports, missing } = runValidateOverFiles(args.paths, config);
    reportMissing(missing);
    if (reports.length === 0) fail("no spec files matched the given paths");
    const summary = summarize(reports);
    if (args.format === "json") {
      process.stdout.write(JSON.stringify({ reports, ...summary }, null, 2) + "\n");
    } else {
      for (const r of reports) process.stdout.write(formatGateReport(r) + "\n");
      process.stdout.write(
        `\n${summary.ok ? "PASS" : "FAIL"} — ${reports.length} spec(s), ${summary.totalBlocks} blocking, ${summary.totalWarns} warning(s)\n`,
      );
    }
    return summary.ok ? 0 : 1;
  }

  // tier | conflicts | gate all use the full batch engine.
  const { batch, missing } = runBatchOverFiles(args.paths, config);
  reportMissing(missing);
  if (batch.reports.length === 0) fail("no spec files matched the given paths");

  if (args.command === "tier") {
    if (args.format === "json") {
      process.stdout.write(JSON.stringify(batch.reports.map((r) => ({ specId: r.specId, tier: r.tier })), null, 2) + "\n");
    } else {
      for (const r of batch.reports) process.stdout.write(formatTier(r) + "\n");
    }
    const escalated = batch.reports.some((r) => r.tier?.escalated);
    return escalated ? 1 : 0;
  }

  if (args.command === "conflicts") {
    if (args.format === "json") {
      process.stdout.write(JSON.stringify(batch.conflicts, null, 2) + "\n");
    } else {
      process.stdout.write(formatConflicts(batch) + "\n");
    }
    return batch.conflicts.some((c) => c.severity === "block") ? 1 : 0;
  }

  // gate
  if (args.format === "json") {
    process.stdout.write(JSON.stringify(batch, null, 2) + "\n");
  } else {
    for (const r of batch.reports) process.stdout.write(formatGateReport(r) + "\n");
    if (batch.conflicts.length > 0) {
      process.stdout.write("\nCross-spec conflicts:\n" + formatConflicts(batch) + "\n");
    }
    process.stdout.write(
      `\n${batch.ok ? "PASS" : "FAIL"} — ${batch.reports.length} spec(s), ${batch.blockCount} blocking, ${batch.warnCount} warning(s)\n`,
    );
  }
  return batch.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`specgate: ${(err as Error).stack ?? err}\n`);
    process.exit(2);
  },
);
