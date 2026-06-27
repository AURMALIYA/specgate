export type ConflictSeverity = "block" | "warn";

export type ConflictType =
  | "access-matrix"
  | "capability-ownership"
  | "hidden-red"
  | "dependency-cycle"
  | "contract-breaking"
  | "semantic";

/** A cross-spec (or tier) conflict finding. */
export interface ConflictFinding {
  severity: ConflictSeverity;
  type: ConflictType;
  /** All specs involved in the conflict. */
  specIds: string[];
  /** Specific access-matrix (role, resource) rows involved, when applicable. */
  rows?: { specId: string; role: string; resource: string }[];
  /** Requirement / capability / contract identifier in question, when applicable. */
  subject?: string;
  /** Plain-language explanation naming the parties and the contradiction. */
  explanation: string;
}
