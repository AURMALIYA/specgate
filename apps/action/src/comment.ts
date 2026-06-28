import type { GateReport } from "@specgate/gate";

/** Marker so the adapter can find + update one sticky comment instead of spamming. */
export const COMMENT_MARKER = "<!-- specgate-review -->";

export interface ReviewView {
  reports: GateReport[];
  conflicts: { severity: "block" | "warn"; type: string; specIds: string[]; subject?: string; explanation: string }[];
  blockCount: number;
  warnCount: number;
}

function findingsBlock(report: GateReport, severity: "block" | "warn"): string[] {
  const items = report.findings
    .filter((f) => f.severity === severity)
    .map((f) => `  - \`${f.source}:${f.code}\`${f.location ? ` (${f.location})` : ""} — ${f.message}`);
  return items;
}

/**
 * Render the "What to fix / improve" PR comment. Blocking findings are grouped
 * as "must fix to merge"; warnings as "should improve". Cross-spec conflicts are
 * listed separately because they name *other* specs in the repo.
 */
export function buildReviewComment(view: ReviewView, mode: string): string {
  const passed = view.blockCount === 0;
  const lines: string[] = [COMMENT_MARKER];
  lines.push(
    passed
      ? "## ✅ SpecGate: governance checks passed"
      : "## ⛔ SpecGate: changes requested",
  );
  lines.push("");
  lines.push(
    `Reviewed **${view.reports.length}** changed spec(s) against the whole repository — ` +
      `**${view.blockCount}** blocking, **${view.warnCount}** advisory.`,
  );
  if (mode === "speckit") lines.push("_(Spec Kit feature mode: constitution/plan/tasks used as context.)_");
  lines.push("");

  for (const r of view.reports) {
    const tier = r.tier
      ? r.tier.escalated
        ? ` — tier ${r.tier.declaredTier}→**${r.tier.finalTier}** (escalated)`
        : ` — tier ${r.tier.finalTier}`
      : "";
    lines.push(`### ${r.ok ? "✅" : "❌"} \`${r.path ?? r.specId ?? "?"}\`${tier}`);
    const mustFix = findingsBlock(r, "block");
    const shouldImprove = findingsBlock(r, "warn");
    if (mustFix.length) {
      lines.push("**Must fix to merge:**");
      lines.push(...mustFix);
    }
    if (shouldImprove.length) {
      lines.push("**Should improve:**");
      lines.push(...shouldImprove);
    }
    if (!mustFix.length && !shouldImprove.length) lines.push("- _No findings._");
    if (r.manualChecklist.length) {
      lines.push("**Reviewer checklist (manual):**");
      lines.push(...r.manualChecklist.map((m) => `  - [ ] (${m.ruleId}) ${m.description}`));
    }
    lines.push("");
  }

  if (view.conflicts.length) {
    lines.push("### 🔗 Cross-spec conflicts (with other specs in the repo)");
    for (const c of view.conflicts) {
      const mark = c.severity === "block" ? "❌" : "⚠️";
      lines.push(`- ${mark} **${c.type}** [${c.specIds.join(", ")}]: ${c.explanation}`);
    }
    lines.push("");
  }

  lines.push(
    passed
      ? "_All clear. This spec meets the governance bar._"
      : "_Fix the blocking items above, then push — the gate re-runs automatically. " +
          "Tip: the SpecGate co-author can auto-repair common issues (EARS, rollback, missing sections)._",
  );
  return lines.join("\n");
}
