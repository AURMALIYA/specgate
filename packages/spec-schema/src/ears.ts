import type { EarsCriterion, EarsKind } from "./types.js";

/**
 * EARS (Easy Approach to Requirements Syntax) parsing.
 *
 * Patterns (case-insensitive on keywords; "THE SYSTEM SHALL" is the response):
 *   ubiquitous: THE SYSTEM SHALL <response>
 *   event:      WHEN <trigger> THE SYSTEM SHALL <response>
 *   state:      WHILE <state> THE SYSTEM SHALL <response>
 *   unwanted:   IF <condition> THEN THE SYSTEM SHALL <response>
 *   optional:   WHERE <feature> THE SYSTEM SHALL <response>
 */

const RESPONSE = "THE\\s+SYSTEM\\s+SHALL\\s+\\S.*";

const PATTERNS: { kind: EarsKind; re: RegExp }[] = [
  { kind: "unwanted", re: new RegExp(`^IF\\s+.+\\s+THEN\\s+${RESPONSE}$`, "i") },
  { kind: "event", re: new RegExp(`^WHEN\\s+.+\\s+${RESPONSE}$`, "i") },
  { kind: "state", re: new RegExp(`^WHILE\\s+.+\\s+${RESPONSE}$`, "i") },
  { kind: "optional", re: new RegExp(`^WHERE\\s+.+\\s+${RESPONSE}$`, "i") },
  { kind: "ubiquitous", re: new RegExp(`^${RESPONSE}$`, "i") },
];

/** Strip list markers and surrounding markdown emphasis from a line. */
function normalizeCriterion(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

/** Extract candidate criterion lines from an Acceptance-criteria section body. */
export function extractCriteriaLines(sectionBody: string): string[] {
  return sectionBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l));
}

/** Heuristics that detect a criterion bundling more than one observable claim. */
function detectBundling(text: string): string[] {
  const problems: string[] = [];
  const shallCount = (text.match(/\bSHALL\b/gi) ?? []).length;
  if (shallCount > 1) {
    problems.push("Contains more than one SHALL clause; split into one claim each.");
  }
  if (/\band then\b/i.test(text)) {
    problems.push('Sequencing language ("and then") bundles multiple steps.');
  }
  if (/;/.test(text)) {
    problems.push("Semicolon suggests multiple independent claims; split them.");
  }
  if (/\b(and|or)\b\s+(?:also\s+)?(?:shall|must)\b/i.test(text)) {
    problems.push("Conjoined obligation; each obligation must be its own criterion.");
  }
  return problems;
}

export function parseCriterion(raw: string, index: number): EarsCriterion {
  const text = normalizeCriterion(raw);
  const problems: string[] = [];

  let kind: EarsKind | null = null;
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      kind = p.kind;
      break;
    }
  }

  if (kind === null) {
    problems.push(
      'Does not match any EARS pattern (ubiquitous / WHEN / WHILE / IF…THEN / WHERE, with "THE SYSTEM SHALL").',
    );
  } else {
    problems.push(...detectBundling(text));
  }

  return {
    index,
    raw: text,
    kind,
    valid: kind !== null && problems.length === 0,
    problems,
  };
}

export function parseCriteria(sectionBody: string): EarsCriterion[] {
  return extractCriteriaLines(sectionBody).map((line, i) => parseCriterion(line, i + 1));
}
