/**
 * Generation dispatch — the neutral spine for "run the code from an approved
 * spec". It defines what gets handed off (a brief), the target interface, and
 * the eligibility predicate. Concrete targets (git-handoff, Replit, …) live in
 * adapter packages; this package names no vendor.
 */

/** The payload handed to a generation target. */
export interface GenerationBrief {
  specId: string;
  title: string;
  specContentHash: string;
  /** The full spec markdown — the contract the generator implements against. */
  specMarkdown: string;
  tier: string;
  requiredApproverRoles: string[];
  /** Optional reference to the prompt-context used (for provenance). */
  promptContextRef?: string;
  /** Target repo "owner/name" for git-based targets. */
  repo?: string;
}

export interface DispatchResult {
  /** The target's id (e.g. "dry-run", "git-handoff", "replit"). */
  target: string;
  /** An opaque tracking handle (branch name, run id, …). */
  handle: string;
  /** A URL to track/open the run, when available. */
  url?: string;
  /** Git ref the spec was seeded onto, when a git-based target was used. */
  gitRef?: string;
  /** True when nothing was actually dispatched (no side effects). */
  dryRun?: boolean;
}

/** A pluggable generation target. */
export interface GenerationTarget {
  readonly id: string;
  dispatch(brief: GenerationBrief): Promise<DispatchResult>;
}

export interface EligibilityInput {
  /** Current workflow state. */
  state: string;
  /** Does the spec pass the gate (no blocking findings)? */
  gateOk: boolean;
  /** Number of unresolved blocking cross-spec conflicts/dependencies. */
  blockingConflicts: number;
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
}

/**
 * A spec is eligible to run only when review is complete and dependencies are
 * resolved: APPROVED state, a clean gate, and no unresolved blocking conflicts.
 */
export function runEligibility(input: EligibilityInput): Eligibility {
  const reasons: string[] = [];
  if (input.state !== "APPROVED") reasons.push(`workflow state is ${input.state}; must be APPROVED`);
  if (!input.gateOk) reasons.push("the gate has blocking findings");
  if (input.blockingConflicts > 0) {
    reasons.push(`${input.blockingConflicts} unresolved blocking cross-spec conflict(s)/dependency(ies)`);
  }
  return { eligible: reasons.length === 0, reasons };
}

/** A no-op target: validates the flow without any side effects. */
export class DryRunTarget implements GenerationTarget {
  readonly id = "dry-run";
  async dispatch(brief: GenerationBrief): Promise<DispatchResult> {
    return {
      target: this.id,
      handle: `dry-run:${brief.specId}@${brief.specContentHash.slice(0, 8)}`,
      dryRun: true,
    };
  }
}
