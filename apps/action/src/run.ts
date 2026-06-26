import { resolveConfig, runGateOverFiles } from "@specgate/cli";
import type { GateReport } from "@specgate/gate";
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
  reports: GateReport[];
}

function annotationFor(report: GateReport, severity: "block" | "warn"): Annotation[] {
  return report.findings
    .filter((f) => f.severity === severity)
    .map((f) => ({
      level: severity === "block" ? ("failure" as const) : ("warning" as const),
      path: report.path,
      title: `SpecGate ${f.source}: ${f.code}`,
      message: f.message,
    }));
}

function buildSummary(reports: GateReport[], blockCount: number, warnCount: number): string {
  const lines = ["## SpecGate standardization gate", ""];
  lines.push(`- Specs checked: **${reports.length}**`);
  lines.push(`- Blocking findings: **${blockCount}**`);
  lines.push(`- Warnings: **${warnCount}**`);
  lines.push("");
  for (const r of reports) {
    lines.push(`### ${r.ok ? "✅" : "❌"} ${r.specId ?? "<unparsed>"} — \`${r.path ?? "?"}\``);
    if (r.findings.length === 0) {
      lines.push("- _No findings._");
    } else {
      for (const f of r.findings) {
        const mark = f.severity === "block" ? "❌" : "⚠️";
        lines.push(`- ${mark} \`${f.source}:${f.code}\` ${f.message}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Core Action logic, decoupled from process/env for testability. */
export async function runAction(input: RunActionInput): Promise<RunActionResult> {
  const config = resolveConfig(input.configPath);
  const { reports, missing } = runGateOverFiles(input.specPaths, config);

  for (const m of missing) {
    await input.adapter.emitAnnotation({
      level: "warning",
      title: "SpecGate",
      message: `Spec path not found: ${m}`,
    });
  }

  for (const report of reports) {
    for (const a of annotationFor(report, "block")) await input.adapter.emitAnnotation(a);
    for (const a of annotationFor(report, "warn")) await input.adapter.emitAnnotation(a);
  }

  const blockCount = reports.reduce((n, r) => n + r.blockCount, 0);
  const warnCount = reports.reduce((n, r) => n + r.warnCount, 0);
  const conclusion: CheckConclusion = blockCount > 0 ? "failure" : "success";

  await input.adapter.postSummary(buildSummary(reports, blockCount, warnCount));
  await input.adapter.setConclusion(
    conclusion,
    `${reports.length} spec(s), ${blockCount} blocking, ${warnCount} warning(s).`,
  );

  return { conclusion, blockCount, warnCount, reports };
}
