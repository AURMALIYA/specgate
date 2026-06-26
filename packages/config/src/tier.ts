import { RISK_TIERS, type RiskTier } from "./schema.js";

/** Numeric rank of a tier; higher means more sensitive. */
export function tierRank(tier: RiskTier): number {
  return RISK_TIERS.indexOf(tier);
}

/** Returns the more sensitive of two tiers. */
export function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

/** True if `a` is strictly less sensitive than `b`. */
export function tierBelow(a: RiskTier, b: RiskTier): boolean {
  return tierRank(a) < tierRank(b);
}
