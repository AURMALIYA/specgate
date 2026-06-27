import type { SpecGateConfig } from "@specgate/config";
import type { ParsedSpec } from "@specgate/spec-schema";
import type { Registry } from "@specgate/registry";
import { accessKey } from "@specgate/registry";
import type { ConflictFinding } from "./types.js";

/**
 * The advisory semantic layer. It is deliberately neutral: this module knows
 * how to choose related specs, build a prompt, and parse a strict-JSON result —
 * but the actual model call is delegated to a SemanticClient implemented in an
 * adapter package. The engine never names a vendor or hard-codes a model.
 *
 * Semantic findings are ALWAYS advisory (severity "warn") and never block.
 */

export type SemanticKind = "contradictory-nonfunctional" | "overlapping-intent";

/** One raw finding the model is asked to return. */
export interface SemanticRawFinding {
  kind: SemanticKind;
  specIds: string[];
  /** Requirement / criterion identifiers cited as evidence. */
  requirementIds: string[];
  explanation: string;
}

export interface SemanticResult {
  findings: SemanticRawFinding[];
}

export interface SemanticAnalyzeOptions {
  model: string;
  maxOutputTokens?: number;
}

/** A pluggable model client. Implemented by an adapter package, never here. */
export interface SemanticClient {
  analyze(prompt: string, options: SemanticAnalyzeOptions): Promise<SemanticResult>;
}

/** JSON Schema the client should constrain output to (strict JSON). */
export const SEMANTIC_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["contradictory-nonfunctional", "overlapping-intent"] },
          specIds: { type: "array", items: { type: "string" } },
          requirementIds: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
        },
        required: ["kind", "specIds", "requirementIds", "explanation"],
      },
    },
  },
  required: ["findings"],
} as const;

/**
 * Choose the handful of registry specs most related to the target, using the
 * deterministic graph: shared capabilities, shared access resources, shared
 * linked requirements, and direct dependency edges.
 */
export function selectRelatedSpecIds(
  registry: Registry,
  targetSpecId: string,
  max: number,
): string[] {
  const target = registry.getSpec(targetSpecId);
  if (!target) return [];

  const targetCaps = new Set([...target.provides, ...target.consumes]);
  const targetResources = new Set(target.accessMatrix.map((r) => accessKey(r.role, r.resource)));
  const targetReqs = new Set(target.frontmatter.linked_requirements);
  const targetDeps = new Set(target.dependsOn);

  const scored: { id: string; score: number }[] = [];
  for (const rec of registry.allSpecs()) {
    if (rec.id === targetSpecId) continue;
    let score = 0;
    for (const cap of [...rec.provides, ...rec.consumes]) if (targetCaps.has(cap)) score += 3;
    for (const row of rec.accessMatrix) if (targetResources.has(accessKey(row.role, row.resource))) score += 2;
    for (const req of rec.frontmatter.linked_requirements) if (targetReqs.has(req)) score += 1;
    if (targetDeps.has(rec.id) || rec.dependsOn.includes(targetSpecId)) score += 2;
    if (score > 0) scored.push({ id: rec.id, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, max).map((s) => s.id);
}

function specDigest(spec: ParsedSpec): string {
  const fm = spec.frontmatter;
  const lines = [
    `## SPEC ${fm.id} — ${fm.title}`,
    `linked_requirements: ${fm.linked_requirements.join(", ") || "(none)"}`,
    `intent: ${spec.sections["intent"] ?? "(none)"}`,
    `non_functionals: ${spec.sections["non_functionals"] ?? "(none)"}`,
    `acceptance_criteria:`,
    ...spec.criteria.map((c) => `  - [${fm.id}#${c.index}] ${c.raw}`),
  ];
  return lines.join("\n");
}

export function buildSemanticPrompt(target: ParsedSpec, related: ParsedSpec[]): string {
  return [
    "You are a spec reviewer. Compare the TARGET spec against the RELATED specs and report only:",
    " - contradictory-nonfunctional: a non-functional baseline that conflicts across specs",
    " - overlapping-intent: two specs that duplicate or overlap in intent/scope",
    "Cite specific requirement or criterion identifiers (e.g. SPEC-ID#3 or REQ-123) as evidence.",
    "If you are unsure, do NOT report it. Report nothing rather than guess.",
    "Return ONLY JSON matching the provided schema.",
    "",
    "=== TARGET ===",
    specDigest(target),
    "",
    "=== RELATED ===",
    ...related.map(specDigest),
  ].join("\n");
}

export interface RunSemanticInput {
  target: ParsedSpec;
  related: ParsedSpec[];
  config: SpecGateConfig;
  client: SemanticClient;
}

/**
 * Run the advisory semantic analysis. Returns warn-only ConflictFindings.
 * Fails open: any client/parse error yields an empty result (never blocks).
 */
export async function runSemanticConflicts(input: RunSemanticInput): Promise<ConflictFinding[]> {
  const { target, related, config, client } = input;
  if (!config.semantic?.enabled || related.length === 0) return [];

  let result: SemanticResult;
  try {
    const prompt = buildSemanticPrompt(target, related);
    result = await client.analyze(prompt, { model: config.semantic.model });
  } catch {
    return []; // advisory layer never blocks the gate on an error
  }

  const findings = Array.isArray(result?.findings) ? result.findings : [];
  return findings.map((f) => ({
    severity: "warn" as const,
    type: "semantic" as const,
    specIds: f.specIds?.length ? f.specIds : [target.frontmatter.id],
    subject: f.kind,
    explanation: `${f.explanation}${f.requirementIds?.length ? ` (evidence: ${f.requirementIds.join(", ")})` : ""}`,
  }));
}
