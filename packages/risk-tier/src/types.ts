import type { RiskTier } from "@specgate/config";

export type MatcherType = "pathGlob" | "metadataField" | "keyword" | "contractSignal";

/** One reason a sensitive surface was considered to match. */
export interface SurfaceHit {
  surfaceId: string;
  surfaceLabel: string;
  restricted: boolean;
  forcesTier: RiskTier;
  matcherType: MatcherType;
  /** The configured pattern/glob/keyword that matched. */
  pattern: string;
  /** The concrete text/path that triggered the match (the evidence). */
  evidence: string;
}

export type EscalationReason = "surface" | "category-floor";

export interface TierEvidence {
  reason: EscalationReason;
  detail: string;
}

export interface TierResult {
  declaredTier: RiskTier;
  /** Tier implied by the change categories' minimum tier. */
  categoryFloor: RiskTier;
  /** Tier implied by matched sensitive surfaces (GREEN when none). */
  surfaceTier: RiskTier;
  /** max(categoryFloor, surfaceTier). */
  derivedTier: RiskTier;
  /** max(declaredTier, derivedTier) — the tier the platform enforces. */
  finalTier: RiskTier;
  /** True when the platform raised the tier above the author's declaration. */
  escalated: boolean;
  /** True when a restricted surface forced RED. */
  hiddenRed: boolean;
  hits: SurfaceHit[];
  evidence: TierEvidence[];
  requiredApproverRoles: string[];
  minApprovals: number;
  verificationDepth: string;
}
