#!/usr/bin/env node
import { CliConfigError, resolveConfig } from "./resolve-config.js";
import { formatGateReport, summarize } from "./format.js";
import { runGateOverFiles } from "./run.js";

const HELP = `specgate — spec-driven development governance

Usage:
  specgate <command> [paths...] [options]

Commands:
  validate <paths...>    Validate specs against the schema + constitution (standardization gate)
  gate <paths...>        Alias for the full gate report over the given specs
  tier <paths...>        Re-derive risk tiers and detect hidden-RED escalation   (Phase 2)
  conflicts <paths...>   Detect cross-spec conflicts                              (Phase 2)

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
  let i = 0;
  for (; i < argv.length; i++) {
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write("specgate 0.1.0\n");
    return 0;
  }
  if (args.help || !args.command) {
    process.stdout.write(HELP);
    return 0;
  }

  switch (args.command) {
    case "validate":
    case "gate": {
      if (args.paths.length === 0) fail("no spec paths provided");
      let config;
      try {
        config = resolveConfig(args.config);
      } catch (err) {
        if (err instanceof CliConfigError) fail(err.message);
        throw err;
      }
      const { reports, missing } = runGateOverFiles(args.paths, config);
      for (const m of missing) process.stderr.write(`specgate: path not found: ${m}\n`);
      if (reports.length === 0) fail("no spec files matched the given paths");

      const summary = summarize(reports);
      if (args.format === "json") {
        process.stdout.write(JSON.stringify({ ...summary }, null, 2) + "\n");
      } else {
        for (const r of reports) process.stdout.write(formatGateReport(r) + "\n");
        process.stdout.write(
          `\n${summary.ok ? "PASS" : "FAIL"} — ${reports.length} spec(s), ${summary.totalBlocks} blocking, ${summary.totalWarns} warning(s)\n`,
        );
      }
      return summary.ok ? 0 : 1;
    }
    case "tier":
    case "conflicts":
      fail(`"${args.command}" is not available yet (arrives in Phase 2)`, 2);
      break;
    default:
      fail(`unknown command "${args.command}". Run with --help.`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`specgate: ${(err as Error).stack ?? err}\n`);
    process.exit(2);
  },
);
