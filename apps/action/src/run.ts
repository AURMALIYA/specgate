import { dirname } from "node:path";
import { resolveConfig, runBatchOverFiles } from "@specgate/cli";
import { runGateBatch, type BatchGateReport, type BatchSpecInput, type GateReport } from "@specgate/gate";
import { loadSpecKitFeature } from "@specgate/speckit-adapter";
import type { Annotation, CheckConclusion, ScmAdapter } from "@specgate/scm-adapter";

export type ActionMode = "files" | "speckit";

export interface RunActionInput {
  specPaths: string[];
  configPath?: string;
  adapter: ScmAdapter;
  /** "files": gate the given spec files. "speckit": treat paths as Spec Kit specs/<feature>/spec.md. */
  mode?: ActionMode;
}

export interface RunActionResult {
  conclusion: CheckConclusion;
  blockCount: number;
  warnCount: number;
  batch: BatchGateReport;
}

function annotationsFor(report: GateReport): Annotation[] {
  return report.findings.map((f) => ({
    level: f.severity === "block" ? ("failure" as const) : ("warning" as const),
    path: report.path,
    title: `SpecGate ${f.source}: ${f.code}`,
    message: f.message,
  }));
}

function buildSummary(batch: BatchGateReport, mode: ActionMode): string {
  const lines = [`## SpecGate gate${mode === "speckit" ? " (Spec Kit features)" : ""}`, ""];
  lines.push(`- Specs checked: **${batch.reports.length}**`);
  lines.push(`- Blocking findings: **${batch.blockCount}**`);
  lines.push(`- Warnings: **${batch.warnCount}**`);
  lines.push(`- Cross-spec conflicts: **${batch.conflicts.length}**`);
  lines.push("");
  for (const r of batch.reports) {
    const tier = r.tier
      ? r.tier.escalated
        ? ` — tier ${r.tier.declaredTier}→**${r.tier.finalTier}** (escalated)`
        : ` — tier ${r.tier.finalTier}`
      : "";
    lines.push(`### ${r.ok ? "✅" : "❌"} ${r.specId ?? "<unparsed>"} — \`${r.path ?? "?"}\`${tier}`);
    if (r.findings.length === 0) lines.push("- _No findings._");
    else
      for (const f of r.findings) {
        const mark = f.severity === "block" ? "❌" : "⚠️";
        lines.push(`- ${mark} \`${f.source}:${f.code}\` ${f.message}`);
      }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Build the batch for Spec Kit mode: each path is a `specs/<feature>/spec.md`
 * (or feature dir). The feature's constitution/plan/tasks/contracts are loaded
 * as prompt-context so the constitution rules scan them too.
 */
function speckitBatch(
  specPaths: string[],
  config: Parameters<typeof runGateBatch>[1],
): { batch: BatchGateReport; missing: string[] } {
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
  return { batch: runGateBatch(inputs, config), missing };
}

/** Core Action logic, decoupled from process/env for testability. */
export async function runAction(input: RunActionInput): Promise<RunActionResult> {
  const mode = input.mode ?? "files";
  const config = resolveConfig(input.configPath);
  const { batch, missing } =
    mode === "speckit" ? speckitBatch(input.specPaths, config) : runBatchOverFiles(input.specPaths, config);

  for (const m of missing) {
    await input.adapter.emitAnnotation({
      level: "warning",
      title: "SpecGate",
      message: mode === "speckit" ? `No spec.md in Spec Kit feature: ${m}` : `Spec path not found: ${m}`,
    });
  }

  for (const report of batch.reports) {
    for (const a of annotationsFor(report)) await input.adapter.emitAnnotation(a);
  }

  await input.adapter.postInlineComments(
    batch.conflicts.flatMap((c) =>
      c.specIds
        .map((id) => batch.reports.find((r) => r.specId === id)?.path)
        .filter((p): p is string => !!p)
        .map((path) => ({ path, line: 1, body: `[${c.type}] ${c.explanation}` })),
    ),
  );

  const conclusion: CheckConclusion = batch.blockCount > 0 ? "failure" : "success";
  await input.adapter.postSummary(buildSummary(batch, mode));
  await input.adapter.setConclusion(
    conclusion,
    `${batch.reports.length} spec(s), ${batch.blockCount} blocking, ${batch.warnCount} warning(s), ${batch.conflicts.length} conflict(s).`,
  );

  return { conclusion, blockCount: batch.blockCount, warnCount: batch.warnCount, batch };
}
