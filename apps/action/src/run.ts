import { resolveConfig, runBatchOverFiles } from "@specgate/cli";
import type { BatchGateReport, GateReport } from "@specgate/gate";
import type { Annotation, CheckConclusion, ScmAdapter } from "@specgate/scm-adapter";

export interface RunActionInput {
  specPaths: string[];
  configPath?: string;
  adapter: ScmAdapter;
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

function buildSummary(batch: BatchGateReport): string {
  const lines = ["## SpecGate gate", ""];
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

/** Core Action logic, decoupled from process/env for testability. */
export async function runAction(input: RunActionInput): Promise<RunActionResult> {
  const config = resolveConfig(input.configPath);
  const { batch, missing } = runBatchOverFiles(input.specPaths, config);

  for (const m of missing) {
    await input.adapter.emitAnnotation({ level: "warning", title: "SpecGate", message: `Spec path not found: ${m}` });
  }

  for (const report of batch.reports) {
    for (const a of annotationsFor(report)) await input.adapter.emitAnnotation(a);
  }

  // Post conflicts as inline comments where a file is known (downgraded to
  // annotations by the GitHub adapter until the REST review path lands).
  await input.adapter.postInlineComments(
    batch.conflicts.flatMap((c) =>
      c.specIds
        .map((id) => batch.reports.find((r) => r.specId === id)?.path)
        .filter((p): p is string => !!p)
        .map((path) => ({ path, line: 1, body: `[${c.type}] ${c.explanation}` })),
    ),
  );

  const conclusion: CheckConclusion = batch.blockCount > 0 ? "failure" : "success";
  await input.adapter.postSummary(buildSummary(batch));
  await input.adapter.setConclusion(
    conclusion,
    `${batch.reports.length} spec(s), ${batch.blockCount} blocking, ${batch.warnCount} warning(s), ${batch.conflicts.length} conflict(s).`,
  );

  return { conclusion, blockCount: batch.blockCount, warnCount: batch.warnCount, batch };
}
