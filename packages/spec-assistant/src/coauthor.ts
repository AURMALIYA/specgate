import type { SpecGateConfig } from "@specgate/config";
import { runGate, type GateReport } from "@specgate/gate";
import type { CoAuthorResult, CoAuthorRound, SpecAssistantClient } from "./types.js";

function blockingOf(report: GateReport) {
  return report.findings
    .filter((f) => f.severity === "block")
    .map((f) => ({ code: f.code, message: f.message, location: f.location }));
}

/** Build the revision prompt from the current spec and its blocking findings. */
export function buildCoAuthorPrompt(
  spec: string,
  blocking: { code: string; message: string; location?: string }[],
): string {
  const findings = blocking
    .map((f, i) => `${i + 1}. [${f.location ?? "spec"}] ${f.code}: ${f.message}`)
    .join("\n");
  return [
    "You are improving a software specification so it passes an automated quality gate.",
    "Revise the spec below to fix EVERY listed finding while preserving the author's intent.",
    "",
    "Rules:",
    "- Keep the YAML frontmatter valid and complete.",
    "- Every acceptance criterion must be a single, testable EARS statement",
    "  (THE SYSTEM SHALL …; WHEN … THE SYSTEM SHALL …; WHILE …; IF … THEN …; WHERE …).",
    "- Keep all mandatory (gate) sections present and non-empty.",
    "- Do not invent sensitive behavior or change the declared scope.",
    "- Return ONLY the full revised Markdown spec — no commentary, no code fences.",
    "",
    "Findings to fix:",
    findings,
    "",
    "Current spec:",
    "----------------",
    spec,
  ].join("\n");
}

export interface CoAuthorInput {
  raw: string;
  config: SpecGateConfig;
  client: SpecAssistantClient;
  /** Model id; defaults to the config's pinned model. */
  model?: string;
  /** Max improvement rounds (default 3). */
  maxRounds?: number;
}

/**
 * Co-author loop: gate the draft, ask the assistant to fix the blocking
 * findings, re-gate, and repeat. The deterministic gate is the source of truth —
 * a revision is adopted only if it does not increase the blocking-finding count,
 * and the loop stops on a pass, on no progress, or at maxRounds. Fails safe:
 * a client error just ends the loop with the best spec so far.
 */
export async function coAuthorSpec(input: CoAuthorInput): Promise<CoAuthorResult> {
  // Model is required by model-backed clients; offline/rule-based clients ignore it.
  const model = input.model ?? input.config.semantic?.model ?? "local";
  const maxRounds = input.maxRounds ?? 3;

  const before = runGate({ raw: input.raw, config: input.config });
  let current = input.raw;
  let report = before;
  const history: CoAuthorRound[] = [];

  let rounds = 0;
  while (!report.ok && rounds < maxRounds) {
    const fixing = blockingOf(report);
    let revisedSpec: string;
    try {
      ({ revisedSpec } = await input.client.improve({
        prompt: buildCoAuthorPrompt(current, fixing),
        currentSpec: current,
        model,
      }));
    } catch {
      break;
    }
    rounds++;
    if (!revisedSpec || !revisedSpec.trim()) break;

    const next = runGate({ raw: revisedSpec, config: input.config });
    // Adopt only a strictly-better draft (fewer blocking findings) so a revision
    // that holds or regresses the count can't be accepted or cause oscillation.
    const adopted = next.blockCount < report.blockCount;
    history.push({ fixing, revisedSpec, ok: next.ok, blockCount: next.blockCount, adopted });
    if (adopted) {
      current = revisedSpec;
      report = next;
    } else {
      break; // no progress — stop rather than loop on a non-improving draft
    }
  }

  return { finalSpec: current, before, after: report, passed: report.ok, rounds, history };
}
