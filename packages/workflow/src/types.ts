import type { RiskTier } from "@specgate/config";

/** The delivery-loop states. */
export const WORKFLOW_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "GENERATING",
  "VERIFYING",
  "READY_FOR_UAT",
  "DONE",
  "BLOCKED",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** A recorded approval: who approved, in what role, when. */
export interface Approval {
  role: string;
  identity: string;
  /** ISO timestamp supplied by the caller (keeps the engine deterministic). */
  at: string;
}

export interface TransitionRecord {
  from: WorkflowState;
  to: WorkflowState;
  event: string;
  at: string;
  detail?: string;
}

export interface WorkflowInstance {
  specId: string;
  finalTier: RiskTier;
  requiredApproverRoles: string[];
  minApprovals: number;
  state: WorkflowState;
  approvals: Approval[];
  generatorId?: string;
  verifierId?: string;
  verificationPassed?: boolean;
  blockedReason?: string;
  history: TransitionRecord[];
}

export type WorkflowEvent =
  | { type: "submit"; at: string }
  | { type: "approve"; role: string; identity: string; at: string }
  | { type: "requestChanges"; at: string; reason?: string }
  | { type: "startGeneration"; generatorId: string; at: string }
  | { type: "completeGeneration"; at: string }
  | { type: "signOffVerification"; verifierId: string; passed: boolean; at: string }
  | { type: "completeUAT"; at: string }
  | { type: "block"; reason: string; at: string }
  | { type: "unblock"; at: string };

export interface TransitionResult {
  ok: boolean;
  instance: WorkflowInstance;
  /** Present when the transition was rejected; the instance is unchanged. */
  error?: string;
}
