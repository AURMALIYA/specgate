import { DEFAULT_RUNNERS } from "./runners.js";
import type { HarnessResult, Runner, VerificationContext } from "./types.js";

/**
 * Run the verification harness. Runs as a separate stage from generation; it
 * never mutates the spec. A runner that does not apply is skipped. The harness
 * passes when no runner and no check failed; `todo` checks (manual / integration
 * hooks) are surfaced but do not fail the harness.
 */
export function runHarness(
  ctx: VerificationContext,
  runners: Runner[] = DEFAULT_RUNNERS,
): HarnessResult {
  const results = runners.map((r) =>
    r.applies(ctx) ? r.run(ctx) : { runnerId: r.id, status: "skip" as const, checks: [], artifacts: [] },
  );

  const failures: HarnessResult["failures"] = [];
  const todos: HarnessResult["todos"] = [];
  for (const res of results) {
    for (const check of res.checks) {
      if (check.status === "fail") failures.push({ runnerId: res.runnerId, check });
      else if (check.status === "todo") todos.push({ runnerId: res.runnerId, check });
    }
  }
  const passed = !results.some((r) => r.status === "fail") && failures.length === 0;
  return { passed, results, failures, todos };
}
