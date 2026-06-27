import type { Check, Runner, RunnerResult, VerificationContext } from "./types.js";

function result(
  runnerId: string,
  status: RunnerResult["status"],
  checks: Check[],
  artifacts: string[] = [],
): RunnerResult {
  return { runnerId, status, checks, artifacts };
}

function touchedCategories(ctx: VerificationContext) {
  const byId = new Map(ctx.config.changeTaxonomy.categories.map((c) => [c.id, c]));
  return ctx.spec.frontmatter.change_categories.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Compile each valid EARS criterion into a test stub. Stubs are generated, not
 * executed (there is no application code at the governance layer), so each
 * stub is a `todo` check; the runner passes when stubs compile for all criteria.
 */
export const earsStubRunner: Runner = {
  id: "ears-stub",
  description: "Compile EARS acceptance criteria into test stubs.",
  applies: (ctx) => ctx.spec.criteria.some((c) => c.valid),
  run: (ctx) => {
    const valid = ctx.spec.criteria.filter((c) => c.valid);
    const artifacts = valid.map(
      (c) =>
        `it(${JSON.stringify(`${ctx.spec.frontmatter.id} #${c.index} [${c.kind}]: ${c.raw}`)}, () => {\n  // TODO: assert this single observable claim\n});`,
    );
    const checks: Check[] = valid.map((c) => ({
      name: `criterion-${c.index}`,
      status: "todo",
      detail: `Stub generated for: ${c.raw}`,
    }));
    return result("ears-stub", "pass", checks, artifacts);
  },
};

/**
 * Persona/access assertions from the access matrix — treated as the most
 * important gate. Generates positive and negative assertions and FAILS on a
 * structural contradiction (e.g. editable without visibility).
 */
export const personaAccessRunner: Runner = {
  id: "persona-access",
  description: "Derive persona/access assertions from the access matrix.",
  applies: (ctx) => ctx.spec.accessMatrix.length > 0,
  run: (ctx) => {
    const checks: Check[] = [];
    const artifacts: string[] = [];
    for (const row of ctx.spec.accessMatrix) {
      const who = `${row.role}/${row.resource}`;
      if (row.editable && !row.visible) {
        checks.push({
          name: `${who}:editable-without-visible`,
          status: "fail",
          detail: `Role "${row.role}" is editable but not visible on "${row.resource}" — cannot edit what cannot be seen.`,
        });
      }
      artifacts.push(
        `assert.equal(can(${JSON.stringify(row.role)}, "view", ${JSON.stringify(row.resource)}), ${row.visible}); // scope=${row.data_scope}`,
      );
      artifacts.push(
        `assert.equal(can(${JSON.stringify(row.role)}, "edit", ${JSON.stringify(row.resource)}), ${row.editable});`,
      );
      for (const dc of row.deny_cases) {
        checks.push({ name: `${who}:deny`, status: "todo", detail: `Assert denial: ${dc}` });
      }
    }
    const failed = checks.some((c) => c.status === "fail");
    return result("persona-access", failed ? "fail" : "pass", checks, artifacts);
  },
};

/** Parity-oracle hook for migration-class (high-sensitivity) changes. */
export const parityOracleRunner: Runner = {
  id: "parity-oracle",
  description: "Require a parity oracle for migration-class changes.",
  applies: (ctx) => touchedCategories(ctx).some((c) => c!.sensitivity === "high"),
  run: (ctx) => {
    const plan = ctx.spec.sections["verification_plan"] ?? "";
    const mentioned = /\b(parity|oracle)\b/i.test(plan);
    const checks: Check[] = [
      {
        name: "parity-oracle",
        status: mentioned ? "todo" : "fail",
        detail: mentioned
          ? "Parity oracle referenced in the verification plan; run it before promotion."
          : "Migration-class change has no parity-oracle reference in the verification plan.",
      },
    ];
    return result("parity-oracle", mentioned ? "pass" : "fail", checks);
  },
};

/** Rollback-validation hook for any promotable (non-GREEN) change. */
export const rollbackValidationRunner: Runner = {
  id: "rollback-validation",
  description: "Require and validate a rollback reference for promotable changes.",
  applies: (ctx) => ctx.finalTier !== "GREEN",
  run: (ctx) => {
    const plan = ctx.spec.sections["verification_plan"] ?? "";
    const ok = /\brollback\b/i.test(plan);
    return result("rollback-validation", ok ? "pass" : "fail", [
      {
        name: "rollback-reference",
        status: ok ? "pass" : "fail",
        detail: ok ? "Rollback reference present." : "No rollback reference in the verification plan.",
      },
    ]);
  },
};

/** Security/data gate for RED work — surfaces mandatory manual checks. */
export const securityDataGateRunner: Runner = {
  id: "security-data-gate",
  description: "Mandatory security/data review for RED changes.",
  applies: (ctx) => ctx.finalTier === "RED",
  run: (ctx) => {
    const checks: Check[] = [
      { name: "human-design", status: "todo", detail: "Confirm the change was human-designed (RED is scaffold-only for AI)." },
      { name: "security-review", status: "todo", detail: "Independent security review of the restricted-domain change." },
      { name: "data-handling", status: "todo", detail: "Confirm data classification and handling for regulated/sensitive data." },
    ];
    void ctx;
    return result("security-data-gate", "pass", checks);
  },
};

export const DEFAULT_RUNNERS: Runner[] = [
  earsStubRunner,
  personaAccessRunner,
  parityOracleRunner,
  rollbackValidationRunner,
  securityDataGateRunner,
];
