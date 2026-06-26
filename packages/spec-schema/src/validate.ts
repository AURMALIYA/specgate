import type { SpecGateConfig } from "@specgate/config";
import { parseAccessMatrix } from "./access-matrix.js";
import { parseCriteria } from "./ears.js";
import { splitDocument, SpecParseError } from "./parse.js";
import { GATE_SECTIONS, SECTION_DEFS } from "./sections.js";
import {
  Frontmatter,
  type AccessMatrixRow,
  type EarsCriterion,
  type ParsedSpec,
  type ValidationFinding,
  type ValidationReport,
} from "./types.js";

export interface ValidateOptions {
  path?: string;
}

/** Validate a single spec document against the schema and an org config. */
export function validateSpec(
  raw: string,
  config: SpecGateConfig,
  opts: ValidateOptions = {},
): ValidationReport {
  const findings: ValidationFinding[] = [];
  const block = (code: string, message: string, location?: string) =>
    findings.push({ severity: "block", code, message, location });
  const warn = (code: string, message: string, location?: string) =>
    findings.push({ severity: "warn", code, message, location });

  // 1. Structural parse.
  let split;
  try {
    split = splitDocument(raw);
  } catch (err) {
    if (err instanceof SpecParseError) {
      block("parse.structure", err.message);
      return { specId: null, path: opts.path, ok: false, findings };
    }
    throw err;
  }

  // 2. Frontmatter validation.
  const fmResult = Frontmatter.safeParse(split.frontmatterRaw);
  if (!fmResult.success) {
    for (const issue of fmResult.error.issues) {
      block(
        "frontmatter.invalid",
        `Frontmatter field "${issue.path.join(".") || "<root>"}": ${issue.message}`,
        `frontmatter.${issue.path.join(".")}`,
      );
    }
    // Without valid frontmatter we cannot produce a reliable model.
    return { specId: null, path: opts.path, ok: false, findings };
  }
  const frontmatter = fmResult.data;
  const specId = frontmatter.id;

  // 3. Change categories must exist in the configured taxonomy.
  const validCategoryIds = new Set(config.changeTaxonomy.categories.map((c) => c.id));
  for (const cat of frontmatter.change_categories) {
    if (!validCategoryIds.has(cat)) {
      block(
        "frontmatter.unknown_category",
        `change_category "${cat}" is not defined in the change taxonomy.`,
        "frontmatter.change_categories",
      );
    }
  }

  // 4. Gate sections must be present and non-empty.
  for (const def of GATE_SECTIONS) {
    const body = split.sections[def.id];
    if (body === undefined) {
      block(
        "gate_section.missing",
        `Required gate section "${def.title}" is missing.`,
        def.id,
      );
    } else if (body.trim().length === 0) {
      block(
        "gate_section.empty",
        `Required gate section "${def.title}" is present but empty.`,
        def.id,
      );
    }
  }

  // 5. Access matrix.
  let accessMatrix: AccessMatrixRow[] = [];
  const amBody = split.sections["access_matrix"];
  if (amBody && amBody.trim().length > 0) {
    const am = parseAccessMatrix(amBody);
    accessMatrix = am.rows;
    for (const p of am.problems) {
      block("access_matrix.parse", `Access matrix: ${p}`, "access_matrix");
    }
    const scopes = new Set(config.dataScopes);
    const layers = new Set(config.enforcementLayers);
    for (const [i, row] of accessMatrix.entries()) {
      if (row.data_scope && !scopes.has(row.data_scope)) {
        block(
          "access_matrix.data_scope",
          `Row ${i + 1} (${row.role}/${row.resource}): data_scope "${row.data_scope}" is not one of [${config.dataScopes.join(", ")}].`,
          "access_matrix",
        );
      }
      if (row.enforcement_layer && !layers.has(row.enforcement_layer)) {
        block(
          "access_matrix.enforcement_layer",
          `Row ${i + 1} (${row.role}/${row.resource}): enforcement_layer "${row.enforcement_layer}" is not one of [${config.enforcementLayers.join(", ")}].`,
          "access_matrix",
        );
      }
    }
  }

  // 6. EARS acceptance criteria.
  let criteria: EarsCriterion[] = [];
  const acBody = split.sections["acceptance_criteria"];
  if (acBody && acBody.trim().length > 0) {
    criteria = parseCriteria(acBody);
    if (criteria.length === 0) {
      block(
        "ears.none",
        "Acceptance criteria section contains no parseable criteria.",
        "acceptance_criteria",
      );
    }
    for (const c of criteria) {
      if (!c.valid) {
        block(
          "ears.non_testable",
          `Acceptance criterion #${c.index} is not a single testable EARS claim: ${c.problems.join(" ")} [${c.raw}]`,
          "acceptance_criteria",
        );
      }
    }
  }

  // 7. Unknown sections are advisory only.
  const knownIds = new Set(SECTION_DEFS.map((s) => s.id));
  for (const present of split.presentSections) {
    if (!knownIds.has(present)) {
      warn("section.unknown", `Unrecognized section "${present}".`, present);
    }
  }

  const resolvedVersion = frontmatter.version ?? `sha256:${split.contentHash.slice(0, 12)}`;

  const parsed: ParsedSpec = {
    path: opts.path,
    frontmatter,
    sections: split.sections,
    presentSections: split.presentSections,
    accessMatrix,
    criteria,
    contentHash: split.contentHash,
    resolvedVersion,
  };

  const ok = !findings.some((f) => f.severity === "block");
  return { specId, path: opts.path, ok, findings, parsed };
}
