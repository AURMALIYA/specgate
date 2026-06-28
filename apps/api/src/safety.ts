/**
 * Governance policy: which finding codes are *safety invariants*. The product
 * decision is "full override" (an admin can bypass anything with a logged
 * justification) — but overriding one of these is flagged loudly in the audit
 * trail and metrics, because they are the core guarantees ("spec is a contract").
 */
export const SAFETY_INVARIANT_CODES = [
  "tier.hidden-red",
  "conflict.hidden-red",
  "conflict.access-matrix",
  "policy.generator-verifier-differ",
];

export function isSafetyInvariant(code: string): boolean {
  return SAFETY_INVARIANT_CODES.includes(code);
}
