import { GitHubActionsAdapter } from "@specgate/scm-adapter";
import { runAction } from "./run.js";

/**
 * GitHub Action entrypoint. Inputs are read from environment variables set by
 * the Action runner (`INPUT_*`) with sensible fallbacks so the binary is also
 * runnable locally.
 */
function readSpecPaths(): string[] {
  const raw = process.env["INPUT_SPECS"] ?? process.env["SPECGATE_SPECS"] ?? "specs";
  return raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(): Promise<number> {
  const configPath = process.env["INPUT_CONFIG"] ?? process.env["SPECGATE_CONFIG"] ?? undefined;
  const specPaths = readSpecPaths();
  const adapter = new GitHubActionsAdapter();

  const result = await runAction({ specPaths, configPath, adapter });
  return result.conclusion === "failure" ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stdout.write(`::error title=SpecGate::${(err as Error).message}\n`);
    process.exit(1);
  },
);
