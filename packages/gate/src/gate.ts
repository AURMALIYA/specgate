import type { SpecGateConfig } from "@specgate/config";
import { validateSpec, type Severity } from "@specgate/spec-schema";
import { evaluatePolicy, type ManualChecklistItem, type PolicyRuntimeFacts } from "@specgate/policy";

/** Where a gate finding originated. Tier/conflict sources arrive in Phase 2. */
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
}

export interface RunGateInput {
  raw: string;
  config: SpecGateConfig;
  path?: string;
  facts?: PolicyRuntimeFacts;
}

/** Run the standardization gate (schema + constitution) over one spec. */
export function runGate(input: RunGateInput): GateReport {
  const { raw, config, path, facts } = input;
  const findings: GateFinding[] = [];
  let manualChecklist: ManualChecklistItem[] = [];

  const schema = validateSpec(raw, config, { path });
  for (const f of schema.findings) {
    findings.push({
      source: "schema",
      severity: f.severity,
      code: f.code,
      message: f.message,
      location: f.location,
    });
  }

  // Constitution rules only run when we have a parsed model to evaluate.
  if (schema.parsed) {
    const policy = evaluatePolicy({
      spec: schema.parsed,
      rawText: raw,
      config,
      facts,
    });
    manualChecklist = policy.manualChecklist;
    for (const f of policy.findings) {
      findings.push({
        source: "policy",
        severity: f.severity,
        code: `policy.${f.ruleId}`,
        message: f.message,
        location: f.location,
      });
    }
  }

  const blockCount = findings.filter((f) => f.severity === "block").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;

  return {
    specId: schema.specId,
    path,
    ok: blockCount === 0,
    blockCount,
    warnCount,
    findings,
    manualChecklist,
  };
}
