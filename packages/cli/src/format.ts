import type { BatchGateReport, GateReport } from "@specgate/gate";

const ICON = { block: "✗", warn: "⚠" } as const;

/** Human-readable rendering of a gate report. */
export function formatGateReport(report: GateReport): string {
  const header = `${report.ok ? "PASS" : "FAIL"}  ${report.specId ?? "<unparsed>"}  (${report.path ?? "?"})`;
  const lines = [header];
  if (report.tier) {
    const t = report.tier;
    const arrow = t.escalated ? `${t.declaredTier} → ${t.finalTier} (ESCALATED)` : t.finalTier;
    lines.push(`  tier: ${arrow}`);
  }
  for (const f of report.findings) {
    const icon = ICON[f.severity];
    const loc = f.location ? ` [${f.location}]` : "";
    lines.push(`  ${icon} ${f.severity.toUpperCase()} ${f.source}:${f.code}${loc}  ${f.message}`);
  }
  if (report.manualChecklist.length > 0) {
    lines.push("  ☐ Manual reviewer checklist:");
    for (const item of report.manualChecklist) lines.push(`     - (${item.ruleId}) ${item.description}`);
  }
  if (report.findings.length === 0) lines.push("  (no findings)");
  return lines.join("\n");
}

/** Tier-focused rendering for the `tier` command. */
export function formatTier(report: GateReport): string {
  if (!report.tier) {
    return `?     ${report.specId ?? "<unparsed>"}  (${report.path ?? "?"})  — could not derive tier`;
  }
  const t = report.tier;
  const lines = [
    `${t.escalated ? "ESCALATED" : "OK"}  ${report.specId}  (${report.path ?? "?"})`,
    `  declared=${t.declaredTier}  category-floor=${t.categoryFloor}  surface=${t.surfaceTier}  => FINAL=${t.finalTier}`,
  ];
  if (t.hiddenRed) lines.push("  ⚑ HIDDEN-RED: a restricted surface forced RED.");
  for (const e of t.evidence) lines.push(`  • [${e.reason}] ${e.detail}`);
  if (t.escalated) {
    lines.push(`  required approvers: ${t.requiredApproverRoles.join(", ") || "(none)"} (min ${t.minApprovals})`);
    lines.push(`  verification: ${t.verificationDepth}`);
  }
  return lines.join("\n");
}

/** Conflict-focused rendering for the `conflicts` command. */
export function formatConflicts(batch: BatchGateReport): string {
  if (batch.conflicts.length === 0) return "No conflicts found.";
  const lines: string[] = [];
  for (const c of batch.conflicts) {
    const icon = ICON[c.severity];
    lines.push(`${icon} ${c.severity.toUpperCase()} ${c.type}  [${c.specIds.join(", ")}]${c.subject ? `  (${c.subject})` : ""}`);
    lines.push(`   ${c.explanation}`);
  }
  return lines.join("\n");
}

export interface RunSummary {
  totalBlocks: number;
  totalWarns: number;
  ok: boolean;
}

export function summarize(reports: GateReport[]): RunSummary {
  const totalBlocks = reports.reduce((n, r) => n + r.blockCount, 0);
  const totalWarns = reports.reduce((n, r) => n + r.warnCount, 0);
  return { totalBlocks, totalWarns, ok: totalBlocks === 0 };
}
