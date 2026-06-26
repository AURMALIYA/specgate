import { z } from "zod";

/** Frontmatter — the machine-readable header of a spec. */
export const Frontmatter = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    owner: z.string().min(1),
    team: z.string().min(1),
    /** Optional; when absent the validator derives a version from the content hash. */
    version: z.string().min(1).optional(),
    status: z.string().min(1),
    risk_tier: z.enum(["GREEN", "YELLOW", "RED"]),
    change_categories: z.array(z.string().min(1)).min(1),
    provides: z.array(z.string().min(1)).default([]),
    consumes: z.array(z.string().min(1)).default([]),
    depends_on: z.array(z.string().min(1)).default([]),
    linked_requirements: z.array(z.string().min(1)).default([]),
    success_metric: z.string().min(1),
  })
  .passthrough();
export type Frontmatter = z.infer<typeof Frontmatter>;

/** A single parsed access-matrix row, one per (role, resource). */
export interface AccessMatrixRow {
  role: string;
  resource: string;
  visible: boolean;
  editable: boolean;
  data_scope: string;
  enforcement_layer: string;
  source_attribute: string;
  deny_cases: string[];
  fallback: string;
}

/** The recognized EARS pattern kinds. */
export type EarsKind =
  | "ubiquitous"
  | "event"
  | "state"
  | "unwanted"
  | "optional";

/** One acceptance criterion after EARS parsing. */
export interface EarsCriterion {
  /** 1-based index within the Acceptance criteria section. */
  index: number;
  raw: string;
  kind: EarsKind | null;
  /** True when the criterion matches an EARS pattern and is a single claim. */
  valid: boolean;
  problems: string[];
}

/** A parsed spec, before validation verdicts are attached. */
export interface ParsedSpec {
  /** Source file path, when known. */
  path?: string;
  frontmatter: Frontmatter;
  /** Section id -> raw body text (trimmed). */
  sections: Record<string, string>;
  /** Section ids that were present in the document. */
  presentSections: string[];
  accessMatrix: AccessMatrixRow[];
  criteria: EarsCriterion[];
  /** Hex content hash over the full raw document. */
  contentHash: string;
  /** Resolved version (declared, else derived from contentHash). */
  resolvedVersion: string;
}

export type Severity = "block" | "warn";

export interface ValidationFinding {
  severity: Severity;
  code: string;
  message: string;
  /** Section id or frontmatter field this finding concerns, when applicable. */
  location?: string;
}

export interface ValidationReport {
  specId: string | null;
  path?: string;
  ok: boolean;
  findings: ValidationFinding[];
  /** Present only when parsing got far enough to produce a model. */
  parsed?: ParsedSpec;
}
