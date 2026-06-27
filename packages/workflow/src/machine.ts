import type { RiskTier, SpecGateConfig } from "@specgate/config";
import type {
  Approval,
  TransitionResult,
  WorkflowEvent,
  WorkflowInstance,
  WorkflowState,
} from "./types.js";

/** Create a fresh workflow instance for a spec at its enforced (final) tier. */
export function createInstance(
  specId: string,
  finalTier: RiskTier,
  config: SpecGateConfig,
): WorkflowInstance {
  const policy = config.reviewerMatrix[finalTier];
  return {
    specId,
    finalTier,
    requiredApproverRoles: policy?.requiredApproverRoles ?? [],
    minApprovals: policy?.minApprovals ?? 1,
    state: "DRAFT",
    approvals: [],
    history: [],
  };
}

/** Distinct approver identities recorded so far. */
function distinctApprovers(instance: WorkflowInstance): Set<string> {
  return new Set(instance.approvals.map((a) => a.identity));
}

/**
 * Whether the tier-required approver set is satisfied: every required role is
 * covered by at least one approval AND the minimum distinct-approver count is met.
 */
export function approvalSatisfied(instance: WorkflowInstance): boolean {
  const rolesCovered = new Set(instance.approvals.map((a) => a.role));
  const allRoles = instance.requiredApproverRoles.every((r) => rolesCovered.has(r));
  return allRoles && distinctApprovers(instance).size >= instance.minApprovals;
}

/** Roles still missing an approval. */
export function missingRoles(instance: WorkflowInstance): string[] {
  const covered = new Set(instance.approvals.map((a) => a.role));
  return instance.requiredApproverRoles.filter((r) => !covered.has(r));
}

function clone(instance: WorkflowInstance): WorkflowInstance {
  return {
    ...instance,
    approvals: instance.approvals.map((a) => ({ ...a })),
    history: instance.history.map((h) => ({ ...h })),
  };
}

function record(
  next: WorkflowInstance,
  from: WorkflowState,
  to: WorkflowState,
  event: string,
  at: string,
  detail?: string,
): void {
  next.state = to;
  next.history.push({ from, to, event, at, detail });
}

function reject(instance: WorkflowInstance, error: string): TransitionResult {
  return { ok: false, instance, error };
}

/** Apply an event to an instance, returning a new instance or a rejection. */
export function applyEvent(instance: WorkflowInstance, event: WorkflowEvent): TransitionResult {
  const from = instance.state;
  const next = clone(instance);

  switch (event.type) {
    case "submit":
      if (from !== "DRAFT") return reject(instance, `cannot submit from ${from}`);
      record(next, from, "IN_REVIEW", "submit", event.at);
      return { ok: true, instance: next };

    case "approve": {
      if (from !== "IN_REVIEW") return reject(instance, `cannot approve from ${from}`);
      const approval: Approval = { role: event.role, identity: event.identity, at: event.at };
      next.approvals.push(approval);
      // Auto-advance to APPROVED only when the tier-required set is satisfied.
      if (approvalSatisfied(next)) {
        record(next, from, "APPROVED", "approve", event.at, `approved by ${event.identity} (${event.role})`);
      }
      return { ok: true, instance: next };
    }

    case "requestChanges":
      if (from !== "IN_REVIEW") return reject(instance, `cannot request changes from ${from}`);
      next.approvals = [];
      record(next, from, "DRAFT", "requestChanges", event.at, event.reason);
      return { ok: true, instance: next };

    case "startGeneration":
      if (from !== "APPROVED") return reject(instance, `cannot start generation from ${from}`);
      next.generatorId = event.generatorId;
      record(next, from, "GENERATING", "startGeneration", event.at, `generator=${event.generatorId}`);
      return { ok: true, instance: next };

    case "completeGeneration":
      if (from !== "GENERATING") return reject(instance, `cannot complete generation from ${from}`);
      record(next, from, "VERIFYING", "completeGeneration", event.at);
      return { ok: true, instance: next };

    case "signOffVerification": {
      if (from !== "VERIFYING") return reject(instance, `cannot sign off verification from ${from}`);
      // Independent verification: the generator may never certify their own work.
      if (next.generatorId && event.verifierId === next.generatorId) {
        return reject(
          instance,
          `independent-verification violation: verifier "${event.verifierId}" is the same as the generator`,
        );
      }
      if (!event.passed) {
        return reject(instance, "verification did not pass; cannot sign off");
      }
      next.verifierId = event.verifierId;
      next.verificationPassed = true;
      record(next, from, "READY_FOR_UAT", "signOffVerification", event.at, `verifier=${event.verifierId}`);
      return { ok: true, instance: next };
    }

    case "completeUAT":
      if (from !== "READY_FOR_UAT") return reject(instance, `cannot complete UAT from ${from}`);
      record(next, from, "DONE", "completeUAT", event.at);
      return { ok: true, instance: next };

    case "block":
      if (from === "DONE" || from === "BLOCKED") return reject(instance, `cannot block from ${from}`);
      next.blockedReason = event.reason;
      record(next, from, "BLOCKED", "block", event.at, event.reason);
      return { ok: true, instance: next };

    case "unblock":
      if (from !== "BLOCKED") return reject(instance, `cannot unblock from ${from}`);
      next.blockedReason = undefined;
      record(next, from, "DRAFT", "unblock", event.at);
      return { ok: true, instance: next };

    default:
      return reject(instance, "unknown event");
  }
}
