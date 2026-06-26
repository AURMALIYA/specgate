import type { SpecGateConfig } from "@specgate/config";
import { validateSpec, type ParsedSpec, type Severity } from "@specgate/spec-schema";
import { evaluatePolicy, type ManualChecklistItem, type PolicyRuntimeFacts } from "@specgate/policy";
import { classifyTier, type TierResult } from "@specgate/risk-tier";
import { Registry } from "@specgate/registry";
import {
  hiddenRedFinding,
  runDeterministicConflicts,
  type ConflictFinding,
} from "@specgate/conflict-engine";

export type FindingSource = "schema" | "policy" | "tier" | "conflict";

export interface GateFinding {
  source: FindingSource;
  severity: Severity;
  code: string;
  message: string;
  location?: string;
}

export interface GateReport {
  specId: string | null;
  path?: string;
  ok: boolean;
  blockCount: number;
  warnCount: number;
  findings: GateFinding[];
  manualChecklist: ManualChecklistItem[];
  /** Re-derived tier result, when the spec parsed. */
  tier?: TierResult;
}

export interface RunGateInput {
  raw: string;
  config: SpecGateConfig;
  path?: string;
  facts?: PolicyRuntimeFacts;
  /** Changed/generated artifact paths from a diff, fed to the surface scanner. */
  changedPaths?: string[];
  /** When true, skip tier re-derivation (used by the standardization-only `validate`). */
  skipTier?: boolean;
}

interface GateOneResult {
  report: GateReport;
  parsed?: ParsedSpec;
}

function tally(findings: GateFinding[]): { block: number; warn: number } {
  return {
    block: findings.filter((f) => f.severity === "block").length,
    warn: findings.filter((f) => f.severity === "warn").length,
  };
}

/** Run schema + policy + tier over a single spec (no cross-spec conflicts). */
function gateOne(input: RunGateInput): GateOneResult {
  const { raw, config, path, facts, changedPaths } = input;
  const findings: GateFinding[] = [];
  let manualChecklist: ManualChecklistItem[] = [];
  let tier: TierResult | undefined;

  const schema = validateSpec(raw, config, { path });
  for (const f of schema.findings) {
    findings.push({ source: "schema", severity: f.severity, code: f.code, message: f.message, location: f.location });
  }

  if (schema.parsed) {
    const policy = evaluatePolicy({ spec: schema.parsed, rawText: raw, config, facts });
    manualChecklist = policy.manualChecklist;
    for (const f of policy.findings) {
      findings.push({ source: "policy", severity: f.severity, code: `policy.${f.ruleId}`, message: f.message, location: f.location });
    }

    // Risk-tier re-derivation + hidden-RED escalation.
    if (!input.skipTier) {
      tier = classifyTier(config, { spec: schema.parsed, changedPaths });
      const hidden = hiddenRedFinding(schema.parsed.frontmatter.id, tier);
      if (hidden) {
        findings.push({
          source: "tier",
          severity: hidden.severity,
          code: "tier.hidden-red",
          message: hidden.explanation,
          location: "risk_approvers",
        });
      }
    }
  }

  const { block, warn } = tally(findings);
  const report: GateReport = {
    specId: schema.specId,
    path,
    ok: block === 0,
    blockCount: block,
    warnCount: warn,
    findings,
    manualChecklist,
    tier,
  };
  return { report, parsed: schema.parsed };
}

/** Run the full gate over a single spec (schema + policy + tier). */
export function runGate(input: RunGateInput): GateReport {
  return gateOne(input).report;
}

export interface BatchSpecInput {
  raw: string;
  path?: string;
  facts?: PolicyRuntimeFacts;
  changedPaths?: string[];
}

export interface BatchGateReport {
  ok: boolean;
  reports: GateReport[];
  /** Cross-spec conflict findings (also distributed onto each involved report). */
  conflicts: ConflictFinding[];
  blockCount: number;
  warnCount: number;
}

/**
 * Run the full gate over a set of specs, including cross-spec conflict
 * detection. Each conflict is attached to every involved spec's report so the
 * SCM adapter can annotate the right files.
 */
export function runGateBatch(specs: BatchSpecInput[], config: SpecGateConfig): BatchGateReport {
  const results = specs.map((s) =>
    gateOne({ raw: s.raw, config, path: s.path, facts: s.facts, changedPaths: s.changedPaths }),
  );
  const reports = results.map((r) => r.report);

  const parsed = results.map((r) => r.parsed).filter((p): p is ParsedSpec => !!p);
  const registry = Registry.fromParsedSpecs(parsed);
  const conflicts = runDeterministicConflicts(registry);

  // Distribute conflicts onto each involved spec report.
  const byId = new Map<string, GateReport>();
  for (const r of reports) if (r.specId) byId.set(r.specId, r);
  for (const c of conflicts) {
    for (const id of c.specIds) {
      const report = byId.get(id);
      if (!report) continue;
      report.findings.push({
        source: "conflict",
        severity: c.severity,
        code: `conflict.${c.type}`,
        message: c.explanation,
        location: c.type === "access-matrix" ? "access_matrix" : undefined,
      });
      const t = tally(report.findings);
      report.blockCount = t.block;
      report.warnCount = t.warn;
      report.ok = t.block === 0;
    }
  }

  const blockCount = reports.reduce((n, r) => n + r.blockCount, 0);
  const warnCount = reports.reduce((n, r) => n + r.warnCount, 0);
  return { ok: blockCount === 0, reports, conflicts, blockCount, warnCount };
}
