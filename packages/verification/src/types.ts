import type { RiskTier, SpecGateConfig } from "@specgate/config";
import type { ParsedSpec } from "@specgate/spec-schema";

export type CheckStatus = "pass" | "fail" | "todo";
export type RunnerStatus = "pass" | "fail" | "skip";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface RunnerResult {
  runnerId: string;
  status: RunnerStatus;
  checks: Check[];
  /** Generated artifacts (e.g. compiled test stubs). */
  artifacts: string[];
}

export interface VerificationContext {
  spec: ParsedSpec;
  finalTier: RiskTier;
  config: SpecGateConfig;
}

/** A pluggable verification runner. */
export interface Runner {
  id: string;
  description: string;
  applies(ctx: VerificationContext): boolean;
  run(ctx: VerificationContext): RunnerResult;
}

export interface HarnessResult {
  /** True when no runner and no check failed (todo items are allowed). */
  passed: boolean;
  results: RunnerResult[];
  /** Flattened failing checks for quick reporting. */
  failures: { runnerId: string; check: Check }[];
  /** Flattened todo (manual / integration) checks. */
  todos: { runnerId: string; check: Check }[];
}
