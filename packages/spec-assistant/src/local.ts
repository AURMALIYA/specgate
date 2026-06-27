import type { SpecGateConfig } from "@specgate/config";
import { GATE_SECTIONS, matchSection, parseCriterion } from "@specgate/spec-schema";
import type { SpecAssistantClient } from "./types.js";

const HEADING_RE = /^#{1,3}\s+(.*\S)\s*$/;
const EARS_START_RE = /^(THE\s+SYSTEM\s+SHALL|WHEN|WHILE|IF|WHERE)\b/i;

/** Rewrite a single acceptance-criterion line into valid EARS if it isn't already. */
function fixCriterionLine(line: string): string {
  const m = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)?(.*)$/);
  const marker = m?.[1] ?? "- ";
  let text = (m?.[2] ?? "").trim();
  if (!text) return line;
  if (parseCriterion(text, 1).valid) return line;
  if (!EARS_START_RE.test(text)) {
    text = text.replace(/^the\s+system\s+(should|must|will|shall|needs to|has to)\s+/i, "");
    text = `THE SYSTEM SHALL ${text}`;
  }
  return `${marker}${text}`;
}

/** A non-empty placeholder body for a gate section that was missing entirely. */
function placeholderFor(id: string, config: SpecGateConfig): string {
  if (id === "access_matrix") {
    const scope = config.dataScopes[0] ?? "own";
    const layer = config.enforcementLayers[0] ?? "application";
    return [
      "| role | resource | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback |",
      "|------|----------|---------|----------|------------|-------------------|------------------|------------|----------|",
      `| viewer | <resource> | true | false | ${scope} | ${layer} | <attribute> | none | read-only |`,
    ].join("\n");
  }
  if (id === "acceptance_criteria") return "- THE SYSTEM SHALL <state one observable, testable behavior>.";
  if (id === "verification_plan") return "Automated checks. Rollback reference: revert to the previous version.";
  return "TODO: fill in this section.";
}

/**
 * Deterministically repair the common gate failures: non-EARS acceptance
 * criteria, a missing rollback reference, and missing gate sections. It does
 * not invent intent — it makes a spec structurally conformant so an author can
 * then refine it. The coAuthor loop re-gates the result, so this can only make
 * a spec pass by actually satisfying the gate.
 */
export function repairSpec(spec: string, config: SpecGateConfig): string {
  const lines = spec.split(/\r?\n/);
  const out: string[] = [];
  const present = new Set<string>();
  let current: string | null = null;
  let inVerification = false;
  let verificationHasRollback = false;

  const flushVerification = () => {
    if (inVerification && !verificationHasRollback) {
      out.push("Rollback reference: revert to the previous version.");
    }
    inVerification = false;
  };

  for (const line of lines) {
    const h = line.match(HEADING_RE);
    if (h) {
      flushVerification();
      const def = matchSection(h[1] ?? "");
      if (def) {
        current = def.id;
        present.add(def.id);
        inVerification = def.id === "verification_plan";
        verificationHasRollback = false;
      }
      out.push(line);
      continue;
    }
    if (current === "acceptance_criteria" && line.trim() && !/^#{1,6}\s/.test(line)) {
      out.push(fixCriterionLine(line));
      continue;
    }
    if (inVerification && /\brollback\b/i.test(line)) verificationHasRollback = true;
    out.push(line);
  }
  flushVerification();

  for (const def of GATE_SECTIONS) {
    if (!present.has(def.id)) {
      out.push("", `# ${def.title} (gate)`, placeholderFor(def.id, config));
    }
  }

  return out.join("\n");
}

/**
 * Offline, rule-based SpecAssistantClient — no API key, no network. It repairs
 * the spec deterministically from the gate's own rules. Useful for local
 * testing and as a zero-dependency fallback. It is intentionally mechanical:
 * it makes specs conformant, not necessarily good.
 */
export class LocalSpecAssistantClient implements SpecAssistantClient {
  constructor(private readonly config: SpecGateConfig) {}

  async improve(req: { currentSpec: string }): Promise<{ revisedSpec: string }> {
    return { revisedSpec: repairSpec(req.currentSpec, this.config) };
  }
}
