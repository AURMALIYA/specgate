import type { GateReport } from "@specgate/gate";

/**
 * A pluggable model client that revises a spec. The *logic* (what to ask, how to
 * re-gate) is neutral and lives in this package; the model call is implemented
 * in an adapter package. This package names no vendor and pins no model.
 */
export interface SpecAssistantClient {
  improve(req: { prompt: string; model: string; maxOutputTokens?: number }): Promise<{ revisedSpec: string }>;
}

export interface CoAuthorRound {
  /** Blocking findings the assistant was asked to fix this round. */
  fixing: { code: string; message: string; location?: string }[];
  /** The revised spec the assistant returned. */
  revisedSpec: string;
  /** Did the revision pass the gate? */
  ok: boolean;
  /** Blocking-finding count after the revision. */
  blockCount: number;
  /** Whether the revision was adopted (it reduced or held the blocking count). */
  adopted: boolean;
}

export interface CoAuthorResult {
  /** Best spec text reached (the original if no revision improved on it). */
  finalSpec: string;
  before: GateReport;
  after: GateReport;
  /** True when the final spec passes the gate. */
  passed: boolean;
  rounds: number;
  history: CoAuthorRound[];
}
