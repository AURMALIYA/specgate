import type { Evaluator, EvaluatorContext, PolicyFinding } from "./types.js";

function finding(ctx: EvaluatorContext, message: string, location?: string): PolicyFinding {
  return { ruleId: ctx.rule.id, severity: ctx.rule.severity, message, location };
}

/** True when at least one touched change category is more than trivially sensitive. */
function isPromotable(ctx: EvaluatorContext): boolean {
  const byId = new Map(ctx.config.changeTaxonomy.categories.map((c) => [c.id, c]));
  return ctx.spec.frontmatter.change_categories.some((id) => {
    const cat = byId.get(id);
    return !!cat && cat.sensitivity !== "low";
  });
}

/**
 * no-regulated-data-tokens — no regulated/personal data tokens may appear in
 * the spec or any prompt-context file. Patterns come from config.
 */
export const noRegulatedDataTokens: Evaluator = (ctx) => {
  const patterns = ctx.config.dataClassification.regulatedDataPatterns;
  if (patterns.length === 0) return [];
  const sources: { ref: string; text: string }[] = [
    { ref: ctx.spec.path ?? ctx.spec.frontmatter.id, text: ctx.rawText },
    ...(ctx.facts.promptContext ?? []),
  ];
  const out: PolicyFinding[] = [];
  for (const pat of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(pat);
    } catch {
      continue;
    }
    for (const src of sources) {
      if (re.test(src.text)) {
        out.push(
          finding(
            ctx,
            `Possible regulated/personal data token (pattern /${pat}/) found in "${src.ref}". Use synthetic data only.`,
          ),
        );
        break; // one finding per pattern is enough
      }
    }
  }
  return out;
};

/**
 * rollback-reference-present — a rollback reference must appear in the
 * Verification plan for any promotable change.
 */
export const rollbackReferencePresent: Evaluator = (ctx) => {
  if (!isPromotable(ctx)) return [];
  const body = ctx.spec.sections["verification_plan"] ?? "";
  if (!/\brollback\b/i.test(body)) {
    return [
      finding(
        ctx,
        "No rollback reference found in the Verification plan for a promotable change.",
        "verification_plan",
      ),
    ];
  }
  return [];
};

/**
 * generator-verifier-differ — the actor that generated a change may never
 * certify it. At spec-validation time the identities are usually unknown; the
 * rule fires only when both are present and equal. The structural enforcement
 * lives additionally in the approval state machine.
 */
export const generatorVerifierDiffer: Evaluator = (ctx) => {
  const { generatorId, verifierId } = ctx.facts;
  if (generatorId && verifierId && generatorId === verifierId) {
    return [
      finding(
        ctx,
        `Generator and verifier identities are identical ("${generatorId}"); verification must be independent.`,
      ),
    ];
  }
  return [];
};

/**
 * standard-first-justification — when a custom/non-standard surface is used
 * (signaled by configured keywords) a written justification must exist.
 */
export const standardFirstJustification: Evaluator = (ctx) => {
  const raw = (ctx.rule.params["customKeywords"] as unknown) ?? [];
  const keywords = Array.isArray(raw) ? raw.map(String) : [];
  if (keywords.length === 0) return [];
  const text = ctx.rawText.toLowerCase();
  const usesCustom = keywords.some((k) => text.includes(k.toLowerCase()));
  if (!usesCustom) return [];
  const hasJustification = /\b(justification|rationale|because|standard-first|we chose)\b/i.test(
    ctx.rawText,
  );
  if (!hasJustification) {
    return [
      finding(
        ctx,
        "A custom/non-standard surface is used but no written justification was found (standard-first principle).",
      ),
    ];
  }
  return [];
};

/** Registry mapping config evaluator ids to their implementations. */
export const EVALUATORS: Record<string, Evaluator> = {
  "no-regulated-data-tokens": noRegulatedDataTokens,
  "rollback-reference-present": rollbackReferencePresent,
  "generator-verifier-differ": generatorVerifierDiffer,
  "standard-first-justification": standardFirstJustification,
};
