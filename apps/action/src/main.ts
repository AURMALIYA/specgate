import { readFileSync } from "node:fs";
import { GitHubActionsAdapter, GitHubApiAdapter, type ScmAdapter } from "@specgate/scm-adapter";
import { runAction, type ActionMode } from "./run.js";

/**
 * GitHub Action entrypoint. Inputs come from `INPUT_*` env vars set by the
 * Action runner, with fallbacks so the binary also runs locally.
 */
function splitList(raw: string | undefined): string[] {
  return (raw ?? "").split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
}

/** Read changed spec files from an explicit input or the PR event payload. */
function readChangedPaths(): string[] {
  const explicit = splitList(process.env["INPUT_CHANGED"] ?? process.env["SPECGATE_CHANGED"]);
  if (explicit.length) return explicit;
  const eventPath = process.env["GITHUB_EVENT_PATH"];
  if (eventPath) {
    try {
      const ev = JSON.parse(readFileSync(eventPath, "utf8")) as { pull_request?: { number?: number } };
      void ev; // changed files aren't in the base payload; rely on INPUT_CHANGED from a diff step
    } catch {
      /* ignore */
    }
  }
  return [];
}

function selectAdapter(): ScmAdapter {
  const token = process.env["GITHUB_TOKEN"] ?? process.env["INPUT_GITHUB_TOKEN"];
  const repo = process.env["GITHUB_REPOSITORY"];
  const prNumber = Number(process.env["INPUT_PR_NUMBER"] ?? process.env["SPECGATE_PR_NUMBER"] ?? "");
  if (token && repo && Number.isInteger(prNumber) && prNumber > 0) {
    return new GitHubApiAdapter({ token, repo, prNumber });
  }
  return new GitHubActionsAdapter();
}

async function main(): Promise<number> {
  const configPath = process.env["INPUT_CONFIG"] ?? process.env["SPECGATE_CONFIG"] ?? undefined;
  const specPaths = splitList(process.env["INPUT_SPECS"] ?? process.env["SPECGATE_SPECS"] ?? "specs");
  const modeRaw = process.env["INPUT_MODE"] ?? process.env["SPECGATE_MODE"] ?? "files";
  const mode: ActionMode = modeRaw === "speckit" || modeRaw === "repo" ? modeRaw : "files";
  const changedPaths = readChangedPaths();

  const result = await runAction({ specPaths, changedPaths, configPath, adapter: selectAdapter(), mode });
  return result.conclusion === "failure" ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stdout.write(`::error title=SpecGate::${(err as Error).message}\n`);
    process.exit(1);
  },
);
