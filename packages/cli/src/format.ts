import type { GateReport } from "@specgate/gate";

const ICON = { block: "✗", warn: "⚠" } as const;

/** Human-readable rendering of a gate report. */
export function formatGateReport(report: GateReport): string {
  const header = `${report.ok ? "PASS" : "FAIL"}  ${report.specId ?? "<unparsed>"}  (${report.path ?? "?"})`;
  const lines = [header];
  for (const f of report.findings) {
    const icon = ICON[f.severity];
    const loc = f.location ? ` [${f.location}]` : "";
    lines.push(`  ${icon} ${f.severity.toUpperCase()} ${f.source}:${f.code}${loc}  ${f.message}`);
  }
  if (report.manualChecklist.length > 0) {
    lines.push("  ☐ Manual reviewer checklist:");
    for (const item of report.manualChecklist) {
      lines.push(`     - (${item.ruleId}) ${item.description}`);
    }
  }
  if (report.findings.length === 0) {
    lines.push("  (no findings)");
  }
  return lines.join("\n");
}

export interface RunSummary {
  reports: GateReport[];
  totalBlocks: number;
  totalWarns: number;
  ok: boolean;
}

export function summarize(reports: GateReport[]): RunSummary {
  const totalBlocks = reports.reduce((n, r) => n + r.blockCount, 0);
  const totalWarns = reports.reduce((n, r) => n + r.warnCount, 0);
  return { reports, totalBlocks, totalWarns, ok: totalBlocks === 0 };
}
