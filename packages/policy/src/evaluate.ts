import type { SpecGateConfig } from "@specgate/config";
import type { ParsedSpec } from "@specgate/spec-schema";
import { EVALUATORS } from "./evaluators.js";
import type {
  EvaluatorContext,
  ManualChecklistItem,
  PolicyFinding,
  PolicyReport,
  PolicyRuntimeFacts,
} from "./types.js";

export interface EvaluatePolicyInput {
  spec: ParsedSpec;
  rawText: string;
  config: SpecGateConfig;
  facts?: PolicyRuntimeFacts;
}

/** Run all configured constitution rules against a parsed spec. */
export function evaluatePolicy(input: EvaluatePolicyInput): PolicyReport {
  const { spec, rawText, config } = input;
  const facts = input.facts ?? {};
  const findings: PolicyFinding[] = [];
  const manualChecklist: ManualChecklistItem[] = [];

  for (const rule of config.constitution.rules) {
    if (rule.check === "manual") {
      manualChecklist.push({
        ruleId: rule.id,
        description: rule.description,
        severity: rule.severity,
      });
      continue;
    }

    const evaluator = rule.evaluator ? EVALUATORS[rule.evaluator] : undefined;
    if (!evaluator) {
      findings.push({
        ruleId: rule.id,
        severity: "block",
        message: `Constitution rule "${rule.id}" references unknown evaluator "${rule.evaluator}".`,
      });
      continue;
    }

    const ctx: EvaluatorContext = { spec, rawText, config, rule, facts };
    findings.push(...evaluator(ctx));
  }

  return { findings, manualChecklist };
}
