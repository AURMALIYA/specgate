import type { AccessMatrixRow } from "@specgate/spec-schema";
import type { Registry, TaggedAccessRow } from "@specgate/registry";
import type { ConflictFinding } from "./types.js";

const VIEW_TERMS = ["view", "read", "see", "visible", "display"];
const EDIT_TERMS = ["edit", "modify", "write", "update", "change", "delete"];

/** Reasons two rows for the same (role, resource) contradict each other. */
function rowsContradict(
  a: TaggedAccessRow,
  b: TaggedAccessRow,
): string[] {
  const reasons: string[] = [];
  const ra = a.row;
  const rb = b.row;

  if (ra.visible !== rb.visible) {
    reasons.push(
      `visible differs (${a.specId}=${ra.visible} vs ${b.specId}=${rb.visible})`,
    );
  }
  if (ra.editable !== rb.editable) {
    reasons.push(
      `editable differs (${a.specId}=${ra.editable} vs ${b.specId}=${rb.editable})`,
    );
  }
  if (ra.data_scope && rb.data_scope && ra.data_scope !== rb.data_scope) {
    reasons.push(
      `data_scope differs (${a.specId}="${ra.data_scope}" vs ${b.specId}="${rb.data_scope}")`,
    );
  }

  // ALLOW in one spec vs a deny_case in the other.
  reasons.push(...allowVsDeny(a.specId, ra, b.specId, rb));
  reasons.push(...allowVsDeny(b.specId, rb, a.specId, ra));

  return reasons;
}

function allowVsDeny(
  allowSpec: string,
  allow: AccessMatrixRow,
  denySpec: string,
  deny: AccessMatrixRow,
): string[] {
  const reasons: string[] = [];
  for (const dc of deny.deny_cases) {
    const lc = dc.toLowerCase();
    if (allow.visible && VIEW_TERMS.some((t) => lc.includes(t))) {
      reasons.push(
        `${allowSpec} grants visibility but ${denySpec} declares a deny_case "${dc}"`,
      );
    }
    if (allow.editable && EDIT_TERMS.some((t) => lc.includes(t))) {
      reasons.push(
        `${allowSpec} grants edit but ${denySpec} declares a deny_case "${dc}"`,
      );
    }
  }
  return reasons;
}

/**
 * Detect contradictory access decisions for the same (role, resource) across
 * specs. Blocking — contradictory access/identity is the costliest conflict to
 * discover after code generation.
 */
export function detectAccessMatrixConflicts(registry: Registry): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  for (const [, group] of registry.accessRowsByKey()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.specId === b.specId) continue; // same-spec duplicates are out of scope
        const reasons = rowsContradict(a, b);
        if (reasons.length > 0) {
          findings.push({
            severity: "block",
            type: "access-matrix",
            specIds: [a.specId, b.specId],
            rows: [
              { specId: a.specId, role: a.row.role, resource: a.row.resource },
              { specId: b.specId, role: b.row.role, resource: b.row.resource },
            ],
            subject: `${a.row.role}/${a.row.resource}`,
            explanation:
              `Contradictory access for role "${a.row.role}" on resource "${a.row.resource}" ` +
              `between ${a.specId} and ${b.specId}: ${reasons.join("; ")}.`,
          });
        }
      }
    }
  }
  return findings;
}
