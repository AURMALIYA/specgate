import type { Registry, TaggedContract } from "@specgate/registry";
import type { TierResult } from "@specgate/risk-tier";
import { detectAccessMatrixConflicts } from "./access.js";
import type { ConflictFinding } from "./types.js";

/** Two specs both `provides` the same capability. Blocking. */
export function detectCapabilityOwnership(registry: Registry): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  for (const [cap, specIds] of registry.capabilityProviders()) {
    const unique = [...new Set(specIds)];
    if (unique.length > 1) {
      findings.push({
        severity: "block",
        type: "capability-ownership",
        specIds: unique,
        subject: cap,
        explanation: `Capability "${cap}" is provided by more than one spec: ${unique.join(", ")}. Exactly one owner is allowed.`,
      });
    }
  }
  return findings;
}

/** Detect a cycle in the depends_on graph. Blocking. */
export function detectDependencyCycles(registry: Registry): ConflictFinding[] {
  const adjacency = new Map<string, string[]>();
  for (const [from, to] of registry.dependencyEdges()) {
    (adjacency.get(from) ?? adjacency.set(from, []).get(from)!).push(to);
  }

  const findings: ConflictFinding[] = [];
  const seenCycles = new Set<string>();
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const dfs = (node: string): void => {
    state.set(node, "visiting");
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (state.get(next) === "visiting") {
        const idx = stack.indexOf(next);
        const cycle = stack.slice(idx).concat(next);
        const key = [...cycle].sort().join("|");
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          findings.push({
            severity: "block",
            type: "dependency-cycle",
            specIds: cycle.slice(0, -1),
            explanation: `Dependency cycle detected: ${cycle.join(" -> ")}.`,
          });
        }
      } else if (state.get(next) !== "done") {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, "done");
  };

  for (const node of adjacency.keys()) {
    if (!state.has(node)) dfs(node);
  }
  return findings;
}

/**
 * Detect a breaking change in a declared contract relative to a lower version
 * of the same contract (either elsewhere in the batch or a registered
 * baseline). Removing a previously-required field is breaking. Blocking.
 */
export function detectContractBreaking(
  registry: Registry,
  baseline: TaggedContract[] = [],
): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  const byName = registry.contractsByName();

  for (const b of baseline) {
    (byName.get(b.contract.name) ?? byName.set(b.contract.name, []).get(b.contract.name)!).push(b);
  }

  for (const [name, decls] of byName) {
    if (decls.length < 2) continue;
    const sorted = [...decls].sort((x, y) => x.contract.version - y.contract.version);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const lower = sorted[i]!;
        const higher = sorted[j]!;
        if (higher.contract.version <= lower.contract.version) continue;
        const removed = lower.contract.required_fields.filter(
          (f) => !higher.contract.required_fields.includes(f),
        );
        if (removed.length > 0) {
          findings.push({
            severity: "block",
            type: "contract-breaking",
            specIds: [...new Set([higher.specId, lower.specId])],
            subject: `${name}@v${higher.contract.version}`,
            explanation:
              `Contract "${name}" v${higher.contract.version} (${higher.specId}) drops ` +
              `required field(s) [${removed.join(", ")}] present in v${lower.contract.version} (${lower.specId}). ` +
              `This is a breaking change.`,
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Detect `depends_on` references to specs that are not present in the registry.
 * Only meaningful with whole-repo context (a partial set will over-report), so
 * this is NOT part of runDeterministicConflicts — callers with the full repo
 * (e.g. the PR gate) invoke it explicitly. Blocking.
 */
export function detectDanglingDependencies(registry: Registry): ConflictFinding[] {
  const known = new Set(registry.allSpecs().map((s) => s.id));
  const findings: ConflictFinding[] = [];
  for (const rec of registry.allSpecs()) {
    for (const dep of rec.dependsOn) {
      if (!known.has(dep)) {
        findings.push({
          severity: "block",
          type: "dangling-dependency",
          specIds: [rec.id],
          subject: dep,
          explanation: `${rec.id} depends_on "${dep}", which is not present in the repository.`,
        });
      }
    }
  }
  return findings;
}

/** Convert a tier escalation into a hidden-RED / tier-mismatch conflict finding. */
export function hiddenRedFinding(specId: string, tier: TierResult): ConflictFinding | null {
  if (!tier.escalated) return null;
  const label = tier.finalTier === "RED" ? "hidden-RED" : "tier mismatch";
  return {
    severity: "block",
    type: "hidden-red",
    specIds: [specId],
    subject: tier.finalTier,
    explanation:
      `${specId} declared ${tier.declaredTier} but the platform re-derived ${tier.finalTier} (${label}). ` +
      tier.evidence.map((e) => `[${e.reason}] ${e.detail}`).join(" "),
  };
}

/** Run all cross-spec deterministic checks (excludes per-spec hidden-RED). */
export function runDeterministicConflicts(
  registry: Registry,
  baseline: TaggedContract[] = [],
): ConflictFinding[] {
  return [
    ...detectAccessMatrixConflicts(registry),
    ...detectCapabilityOwnership(registry),
    ...detectDependencyCycles(registry),
    ...detectContractBreaking(registry, baseline),
  ];
}
