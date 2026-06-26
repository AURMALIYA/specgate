import type { ConstitutionRule, SpecGateConfig } from "@specgate/config";
import type { ParsedSpec, Severity } from "@specgate/spec-schema";

/** A reference to a prompt-context file (scanned for forbidden tokens). */
export interface PromptContextRef {
  ref: string;
  text: string;
}

/** Runtime facts available to evaluators, populated as a spec moves through the loop. */
export interface PolicyRuntimeFacts {
  generatorId?: string;
  verifierId?: string;
  promptContext?: PromptContextRef[];
}

export interface EvaluatorContext {
  spec: ParsedSpec;
  /** Full raw document text. */
  rawText: string;
  config: SpecGateConfig;
  rule: ConstitutionRule;
  facts: PolicyRuntimeFacts;
}

export interface PolicyFinding {
  ruleId: string;
  severity: Severity;
  message: string;
  location?: string;
}

/** An auto-rule evaluator: returns one finding per violation (empty = pass). */
export type Evaluator = (ctx: EvaluatorContext) => PolicyFinding[];

export interface ManualChecklistItem {
  ruleId: string;
  description: string;
  severity: Severity;
}

export interface PolicyReport {
  findings: PolicyFinding[];
  manualChecklist: ManualChecklistItem[];
}
