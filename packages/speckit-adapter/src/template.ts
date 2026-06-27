import type { SpecGateConfig } from "@specgate/config";
import { SECTION_DEFS } from "@specgate/spec-schema";

/** Pick a safe default change category for the starter template: a non-restricted,
 *  GREEN-floor category if one exists, else the first declared category. */
function defaultCategory(config: SpecGateConfig): string {
  const cats = config.changeTaxonomy.categories;
  return (cats.find((c) => !c.restrictedDomain && c.minTier === "GREEN") ?? cats[0]!).id;
}

const SECTION_GUIDANCE: Record<string, string> = {
  linkage:
    "Requirement IDs, phase/deliverable, related work, and the measurable success metric.",
  intent: "One or two sentences describing the outcome.",
  access_matrix: "", // table is generated below
  acceptance_criteria: "", // EARS examples generated below
  data_privacy:
    "Data touched and its classification. Flag any sensitive information so the platform can tier it. Use synthetic examples only.",
  surface_impact:
    "Which change categories this touches (from the configured taxonomy). Be honest — the platform re-derives the tier from this and from the diff.",
  integration_contracts:
    "External systems, request/response shapes, and failure/timeout behavior. Reference machine-readable contracts where applicable.",
  non_functionals: "Declared baselines: localization, accessibility, performance, etc.",
  verification_plan:
    "Which gates apply, the oracle for any migration, the UAT script, and a rollback reference.",
  risk_approvers: "The risk tier and the required approver roles for that tier.",
  out_of_scope: "What is explicitly out of scope, and any open questions.",
};

/** Build the persona/access-matrix table seeded with values valid for this config. */
function accessMatrixBlock(config: SpecGateConfig): string {
  const scope = config.dataScopes[0] ?? "own";
  const layer = config.enforcementLayers[0] ?? "application";
  return [
    "| role | resource | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback |",
    "|------|----------|---------|----------|------------|-------------------|------------------|------------|----------|",
    `| viewer | <resource> | true | false | ${scope} | ${layer} | <attribute> | none | read-only |`,
    "",
    `> One row per (role, resource). data_scope ∈ [${config.dataScopes.join(", ")}]; ` +
      `enforcement_layer ∈ [${config.enforcementLayers.join(", ")}].`,
  ].join("\n");
}

const EARS_EXAMPLES = [
  "- THE SYSTEM SHALL <state an observable, always-true behavior>.",
  "- WHEN <trigger> THE SYSTEM SHALL <state the observable response>.",
  "- WHILE <state> THE SYSTEM SHALL <state the observable behavior>.",
  "- IF <unwanted condition> THEN THE SYSTEM SHALL <state the guarding response>.",
  "- WHERE <feature is present> THE SYSTEM SHALL <state the optional behavior>.",
].join("\n");

/**
 * Generate the SpecGate spec authoring template (Markdown + frontmatter) from
 * the canonical schema and an org config. The output is itself a minimal,
 * gate-passing spec so authors start from green and edit in place.
 */
export function generateSpecTemplate(config: SpecGateConfig): string {
  const cat = defaultCategory(config);
  const fm = [
    "---",
    "id: SPEC-0000",
    "title: Replace with a one-line title",
    "owner: replace.with.owner",
    "team: replace-with-team",
    "version: 0.1.0",
    "status: draft",
    "risk_tier: GREEN",
    "change_categories:",
    `  - ${cat}`,
    "provides: []",
    "consumes: []",
    "depends_on: []",
    "linked_requirements:",
    "  - REQ-0000",
    'success_metric: "Replace with a measurable success metric."',
    "contracts: []",
    "---",
  ].join("\n");

  const body: string[] = [];
  SECTION_DEFS.forEach((def, i) => {
    body.push(`\n# ${i + 1}. ${def.title}${def.gate ? "  (gate)" : ""}`);
    if (def.id === "access_matrix") {
      body.push(accessMatrixBlock(config));
    } else if (def.id === "acceptance_criteria") {
      // This section is EARS-parsed line-by-line, so it must contain ONLY
      // criteria (no prose intro). Each line is one observable, testable claim.
      body.push(EARS_EXAMPLES);
    } else {
      body.push(SECTION_GUIDANCE[def.id] ?? "");
    }
  });

  return `${fm}\n${body.join("\n")}\n`;
}

/** Generate a constitution starter from the config's constitution rules. */
export function generateConstitutionTemplate(config: SpecGateConfig): string {
  const lines = [
    "# Constitution",
    "",
    "Governing principles enforced by the spec gate. Auto rules are checked by the",
    "platform on every change; manual rules are surfaced as a reviewer checklist.",
    "",
    "## Enforced rules",
  ];
  for (const r of config.constitution.rules) {
    lines.push(`- **${r.id}** (${r.severity}, ${r.check}) — ${r.description}`);
  }
  lines.push("", "## Notes", "Add organization-specific principles here.", "");
  return lines.join("\n");
}
