import { z } from "zod";

/**
 * SpecGate configuration schema.
 *
 * This module defines the *structure* of an organization's governance
 * configuration. It is deliberately free of any platform-, vendor-, or
 * product-specific identifiers: every concrete notion of "what is sensitive",
 * "which change categories exist", "who approves what", and "what the
 * constitution forbids" is supplied by an org's config file, not encoded here.
 *
 * The engine reads these values; it never hard-codes them.
 */

/** The fixed risk tiers, ordered from least to most sensitive. */
export const RISK_TIERS = ["GREEN", "YELLOW", "RED"] as const;
export const RiskTier = z.enum(RISK_TIERS);
export type RiskTier = z.infer<typeof RiskTier>;

/**
 * The ceiling on how much an AI agent may do for a change category, ordered
 * from most permissive to most restrictive. These four levels are a fixed part
 * of the governance model; which categories map to which ceiling is config.
 */
export const AI_AUTHORITY_LEVELS = [
  "draft-and-apply",
  "draft-then-verify",
  "draft-with-review",
  "scaffold-only",
] as const;
export const AiAuthority = z.enum(AI_AUTHORITY_LEVELS);
export type AiAuthority = z.infer<typeof AiAuthority>;

/** Coarse sensitivity label used to validate declared tiers against a category. */
export const Sensitivity = z.enum(["low", "medium", "high", "restricted"]);
export type Sensitivity = z.infer<typeof Sensitivity>;

/** One entry in the change taxonomy. */
export const ChangeCategory = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().default(""),
    sensitivity: Sensitivity,
    /** Maximum authority an AI agent may exercise for changes in this category. */
    aiAuthorityCeiling: AiAuthority,
    /** Minimum risk tier any spec touching this category must carry. */
    minTier: RiskTier,
    /**
     * Restricted-domain categories (identity, access control, data governance,
     * money movement, regulated data). The platform never *designs* these.
     */
    restrictedDomain: z.boolean().default(false),
  })
  .strict();
export type ChangeCategory = z.infer<typeof ChangeCategory>;

/** Matchers that signal a change touches a particular surface. */
export const SurfaceMatchers = z
  .object({
    /** Glob patterns over file/artifact paths. */
    pathGlobs: z.array(z.string()).default([]),
    /** Regex patterns matched against frontmatter / metadata field values. */
    metadataFieldPatterns: z.array(z.string()).default([]),
    /** Case-insensitive keywords matched against spec body text. */
    keywords: z.array(z.string()).default([]),
    /** Regex patterns matched against declared integration-contract references. */
    contractSignals: z.array(z.string()).default([]),
  })
  .strict();
export type SurfaceMatchers = z.infer<typeof SurfaceMatchers>;

/** A sensitive surface; a match can force a tier floor. */
export const SensitiveSurface = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** True when this surface belongs to the restricted domain. */
    restricted: z.boolean().default(false),
    /** The tier this surface forces when matched. Restricted surfaces force RED. */
    forcesTier: RiskTier,
    matchers: SurfaceMatchers,
  })
  .strict();
export type SensitiveSurface = z.infer<typeof SensitiveSurface>;

/** Required approvers and verification depth for a tier. */
export const TierPolicy = z
  .object({
    requiredApproverRoles: z.array(z.string()).default([]),
    /** Free-form label describing how deep verification must go for this tier. */
    verificationDepth: z.string().min(1),
    /** Minimum number of distinct approver identities required. */
    minApprovals: z.number().int().nonnegative().default(1),
  })
  .strict();
export type TierPolicy = z.infer<typeof TierPolicy>;

/** A single constitution rule. */
export const ConstitutionRule = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    severity: z.enum(["block", "warn"]),
    check: z.enum(["auto", "manual"]),
    /**
     * For auto rules, the id of a built-in evaluator implemented in @specgate/policy.
     * For manual rules, omit; the rule is surfaced as a reviewer checklist item.
     */
    evaluator: z.string().min(1).optional(),
    /** Arbitrary evaluator parameters, validated by the evaluator itself. */
    params: z.record(z.unknown()).default({}),
  })
  .strict()
  .refine((r) => r.check === "manual" || !!r.evaluator, {
    message: "auto rules must declare an evaluator id",
    path: ["evaluator"],
  });
export type ConstitutionRule = z.infer<typeof ConstitutionRule>;

/** Data-classification config that drives policy + tiering, kept neutral. */
export const DataClassification = z
  .object({
    /** Regex patterns whose presence in prompt-context indicates regulated/sensitive data. */
    regulatedDataPatterns: z.array(z.string()).default([]),
    /** Frontmatter sensitivity flags that should raise the tier floor. */
    sensitiveFlags: z.array(z.string()).default([]),
  })
  .strict();
export type DataClassification = z.infer<typeof DataClassification>;

/** Configuration for the advisory semantic conflict layer. */
export const SemanticConfig = z
  .object({
    enabled: z.boolean().default(false),
    /** Pinned model id; the engine never hard-codes a model. */
    model: z.string().min(1),
    maxRelatedSpecs: z.number().int().positive().default(5),
  })
  .strict();
export type SemanticConfig = z.infer<typeof SemanticConfig>;

/** The complete SpecGate configuration. */
export const SpecGateConfig = z
  .object({
    version: z.string().min(1),
    org: z.string().min(1),
    changeTaxonomy: z
      .object({
        categories: z.array(ChangeCategory).min(1),
      })
      .strict(),
    sensitiveSurfaces: z.array(SensitiveSurface).default([]),
    /** Allowed values for access-matrix `data_scope` (config enum). */
    dataScopes: z.array(z.string().min(1)).min(1),
    /** Allowed values for access-matrix `enforcement_layer` (config enum). */
    enforcementLayers: z.array(z.string().min(1)).min(1),
    /** Per-tier approver + verification policy. Every tier must be present. */
    reviewerMatrix: z.record(RiskTier, TierPolicy),
    constitution: z
      .object({
        rules: z.array(ConstitutionRule).default([]),
      })
      .strict(),
    dataClassification: DataClassification.default({
      regulatedDataPatterns: [],
      sensitiveFlags: [],
    }),
    semantic: SemanticConfig.optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    for (const tier of RISK_TIERS) {
      if (!cfg.reviewerMatrix[tier]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `reviewerMatrix is missing the required tier "${tier}"`,
          path: ["reviewerMatrix", tier],
        });
      }
    }
    // Restricted-domain categories must be scaffold-only and RED.
    for (const [i, cat] of cfg.changeTaxonomy.categories.entries()) {
      if (cat.restrictedDomain && cat.aiAuthorityCeiling !== "scaffold-only") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `restricted-domain category "${cat.id}" must have aiAuthorityCeiling "scaffold-only"`,
          path: ["changeTaxonomy", "categories", i, "aiAuthorityCeiling"],
        });
      }
      if (cat.restrictedDomain && cat.minTier !== "RED") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `restricted-domain category "${cat.id}" must have minTier "RED"`,
          path: ["changeTaxonomy", "categories", i, "minTier"],
        });
      }
    }
    // Restricted surfaces must force RED.
    for (const [i, s] of cfg.sensitiveSurfaces.entries()) {
      if (s.restricted && s.forcesTier !== "RED") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `restricted surface "${s.id}" must force tier RED`,
          path: ["sensitiveSurfaces", i, "forcesTier"],
        });
      }
    }
  });
export type SpecGateConfig = z.infer<typeof SpecGateConfig>;
