import { maxTier, tierBelow, type RiskTier, type SpecGateConfig } from "@specgate/config";
import type { ParsedSpec } from "@specgate/spec-schema";
import { scanSensitiveSurfaces, type ScanInput } from "./scan.js";
import type { SurfaceHit, TierEvidence, TierResult } from "./types.js";

/** Highest minTier across the spec's declared change categories. */
function categoryFloor(config: SpecGateConfig, spec: ParsedSpec): { tier: RiskTier; from?: string } {
  const byId = new Map(config.changeTaxonomy.categories.map((c) => [c.id, c]));
  let floor: RiskTier = "GREEN";
  let from: string | undefined;
  for (const id of spec.frontmatter.change_categories) {
    const cat = byId.get(id);
    if (!cat) continue;
    if (tierBelow(floor, cat.minTier)) {
      floor = cat.minTier;
      from = cat.id;
    }
  }
  return { tier: floor, from };
}

function surfaceTier(hits: SurfaceHit[]): RiskTier {
  let tier: RiskTier = "GREEN";
  for (const h of hits) tier = maxTier(tier, h.forcesTier);
  return tier;
}

/**
 * Re-derive the risk tier for a spec from what it actually touches, never
 * trusting the author's declaration. Restricted-surface matches force RED
 * (hidden-RED escalation).
 */
export function classifyTier(config: SpecGateConfig, input: ScanInput): TierResult {
  const { spec } = input;
  const declaredTier = spec.frontmatter.risk_tier;
  const hits = scanSensitiveSurfaces(config, input);

  const { tier: catFloor, from: catFrom } = categoryFloor(config, spec);
  const surfTier = surfaceTier(hits);
  const derivedTier = maxTier(catFloor, surfTier);
  const finalTier = maxTier(declaredTier, derivedTier);

  const evidence: TierEvidence[] = [];
  if (tierBelow(declaredTier, catFloor) && catFrom) {
    evidence.push({
      reason: "category-floor",
      detail: `change category "${catFrom}" requires at least ${catFloor}, above the declared ${declaredTier}.`,
    });
  }
  for (const h of hits) {
    if (tierBelow(declaredTier, h.forcesTier)) {
      evidence.push({
        reason: "surface",
        detail: `sensitive surface "${h.surfaceId}" (${h.matcherType}: ${h.pattern}) forces ${h.forcesTier}; evidence: ${h.evidence}`,
      });
    }
  }

  const policy = config.reviewerMatrix[finalTier];
  const escalated = tierBelow(declaredTier, finalTier);
  const hiddenRed = finalTier === "RED" && hits.some((h) => h.restricted) && tierBelow(declaredTier, "RED");

  return {
    declaredTier,
    categoryFloor: catFloor,
    surfaceTier: surfTier,
    derivedTier,
    finalTier,
    escalated,
    hiddenRed,
    hits,
    evidence,
    requiredApproverRoles: policy?.requiredApproverRoles ?? [],
    minApprovals: policy?.minApprovals ?? 1,
    verificationDepth: policy?.verificationDepth ?? "",
  };
}
