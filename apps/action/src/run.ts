import { dirname } from "node:path";
import { resolveConfig, runBatchOverFiles, runRepoPrGate } from "@specgate/cli";
import { runGateBatch, type BatchSpecInput, type GateReport } from "@specgate/gate";
import { loadSpecKitFeature } from "@specgate/speckit-adapter";
import type { Annotation, CheckConclusion, ScmAdapter } from "@specgate/scm-adapter";
import { buildReviewComment, type ReviewView } from "./comment.js";

export type ActionMode = "files" | "speckit" | "repo";

export interface RunActionInput {
  /** In files/speckit mode: the specs to gate. In repo mode: paths covering ALL repo specs. */
  specPaths: string[];
  /** repo mode: the PR's changed spec files (findings are scoped to these). */
  changedPaths?: string[];
  configPath?: string;
  adapter: ScmAdapter;
  mode?: ActionMode;
}

export interface RunActionResult {
  conclusion: CheckConclusion;
  blockCount: number;
  warnCount: number;
  view: ReviewView;
}

function annotationsFor(report: GateReport): Annotation[] {
  return report.findings.map((f) => ({
    level: f.severity === "block" ? ("failure" as const) : ("warning" as const),
    path: report.path,
    title: `SpecGate ${f.source}: ${f.code}`,
    message: f.message,
  }));
}

function speckitInputs(specPaths: string[]): { inputs: BatchSpecInput[]; missing: string[] } {
  const featureDirs = [...new Set(specPaths.map((p) => (p.endsWith("spec.md") ? dirname(p) : p)))];
  const inputs: BatchSpecInput[] = [];
  const missing: string[] = [];
  for (const dir of featureDirs) {
    try {
      const a = loadSpecKitFeature(dir);
      inputs.push({ raw: a.specRaw, path: a.specPath, facts: { promptContext: a.promptContext } });
    } catch {
      missing.push(dir);
    }
  }
  return { inputs, missing };
}

/** Core Action logic, decoupled from process/env for testability. */
export async function runAction(input: RunActionInput): Promise<RunActionResult> {
  const mode = input.mode ?? "files";
  const config = resolveConfig(input.configPath);

  let view: ReviewView;
  let missing: string[] = [];

  if (mode === "repo") {
    const r = runRepoPrGate(input.specPaths, input.changedPaths ?? [], config);
    view = r.scoped;
    missing = r.missing;
  } else if (mode === "speckit") {
    const { inputs, missing: m } = speckitInputs(input.specPaths);
    missing = m;
    view = runGateBatch(inputs, config);
  } else {
    const r = runBatchOverFiles(input.specPaths, config);
    view = r.batch;
    missing = r.missing;
  }

  for (const m of missing) {
    await input.adapter.emitAnnotation({ level: "warning", title: "SpecGate", message: `Spec path not found: ${m}` });
  }
  for (const report of view.reports) {
    for (const a of annotationsFor(report)) await input.adapter.emitAnnotation(a);
  }
  await input.adapter.postInlineComments(
    view.conflicts.flatMap((c) =>
      c.specIds
        .map((id) => view.reports.find((r) => r.specId === id)?.path)
        .filter((p): p is string => !!p)
        .map((path) => ({ path, line: 1, body: `[${c.type}] ${c.explanation}` })),
    ),
  );

  const conclusion: CheckConclusion = view.blockCount > 0 ? "failure" : "success";
  await input.adapter.postSummary(buildReviewComment(view, mode));
  await input.adapter.setConclusion(
    conclusion,
    `${view.reports.length} spec(s), ${view.blockCount} blocking, ${view.warnCount} warning(s), ${view.conflicts.length} conflict(s).`,
  );

  return { conclusion, blockCount: view.blockCount, warnCount: view.warnCount, view };
}
