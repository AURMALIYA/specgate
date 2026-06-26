/** Canonical section definitions for the SpecGate spec schema. */
export interface SectionDef {
  id: string;
  /** Human title used in generated templates and messages. */
  title: string;
  /** True when the section is a mandatory "gate" section. */
  gate: boolean;
  /** Regex (case-insensitive) matched against a normalized heading line. */
  headingPattern: RegExp;
}

export const SECTION_DEFS: SectionDef[] = [
  { id: "linkage", title: "Linkage", gate: true, headingPattern: /\blinkage\b/i },
  { id: "intent", title: "Intent", gate: false, headingPattern: /\bintent\b/i },
  {
    id: "access_matrix",
    title: "Persona & access matrix",
    gate: true,
    headingPattern: /\b(persona|access)\b.*\b(access|matrix)\b|\baccess matrix\b/i,
  },
  {
    id: "acceptance_criteria",
    title: "Acceptance criteria",
    gate: true,
    headingPattern: /\bacceptance criteria\b/i,
  },
  {
    id: "data_privacy",
    title: "Data & privacy classification",
    gate: true,
    headingPattern: /\bdata\b.*\b(privacy|classification)\b/i,
  },
  {
    id: "surface_impact",
    title: "Surface / impact",
    gate: true,
    headingPattern: /\bsurface\b|\bimpact\b/i,
  },
  {
    id: "integration_contracts",
    title: "Integration contracts",
    gate: false,
    headingPattern: /\bintegration\b.*\bcontracts?\b|\bcontracts?\b/i,
  },
  {
    id: "non_functionals",
    title: "Non-functionals",
    gate: false,
    headingPattern: /\bnon[- ]?functionals?\b/i,
  },
  {
    id: "verification_plan",
    title: "Verification plan",
    gate: true,
    headingPattern: /\bverification plan\b/i,
  },
  {
    id: "risk_approvers",
    title: "Risk tier & approvers",
    gate: true,
    headingPattern: /\brisk\b.*\bapprovers?\b|\bapprovers?\b/i,
  },
  {
    id: "out_of_scope",
    title: "Out of scope / open questions",
    gate: false,
    headingPattern: /\bout of scope\b|\bopen questions\b/i,
  },
];

export const GATE_SECTIONS = SECTION_DEFS.filter((s) => s.gate);

/**
 * Match a heading line to a canonical section id. Returns the first section
 * whose pattern matches. Earlier, more-specific patterns take precedence, so
 * the order in SECTION_DEFS matters.
 */
export function matchSection(headingText: string): SectionDef | undefined {
  const normalized = headingText.replace(/[#*_`]/g, " ").trim();
  return SECTION_DEFS.find((s) => s.headingPattern.test(normalized));
}
