// End-to-end smoke test of the whole SpecGate platform against compiled dist.
// Run: node scripts/e2e.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { loadConfig } = await import(resolve(ROOT, "packages/config/dist/index.js"));
const { SpecGateService } = await import(resolve(ROOT, "apps/api/dist/service.js"));

const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

let step = 0;
const ok = [];
const fail = [];
function check(label, cond, detail = "") {
  step++;
  const mark = cond ? "✓" : "✗";
  (cond ? ok : fail).push(label);
  console.log(`${mark} ${String(step).padStart(2)}. ${label}${detail ? `  — ${detail}` : ""}`);
}

// Fake semantic client so the advisory layer runs offline.
const semanticClient = {
  async analyze() {
    return {
      findings: [
        { kind: "overlapping-intent", specIds: ["NW-NOTES-SUPPORT", "NW-NOTES-READONLY"], requirementIds: ["REQ-3001"], explanation: "Both govern order-note editing." },
      ],
    };
  },
};

const svc = new SpecGateService(cfg, { now: () => "2026-06-27T00:00:00Z", semanticClient });

console.log("\n=== INGEST ===");
const good = svc.ingest(read("config/example-org/specs/storefront-promotion-badge.md"), "badge.md");
check("clean spec ingests and passes the gate", good.gate.ok && good.tier.finalTier === "GREEN", `tier=${good.tier.finalTier}`);
const id = good.specId;

const sA = svc.ingest(read("config/example-org/specs-conflict/order-notes-support.md"));
const sB = svc.ingest(read("config/example-org/specs-conflict/order-notes-readonly.md"));
const red = svc.ingest(read("config/example-org/specs-conflict/hidden-red-merchant-roles.md"));
check("hidden-RED spec re-derived from GREEN to RED", red.tier.declaredTier === "GREEN" && red.tier.finalTier === "RED");
check("hidden-RED spec is blocked by the gate", red.gate.ok === false);

console.log("\n=== CONFLICT DETECTION ===");
const conflicts = svc.conflicts();
const access = conflicts.find((c) => c.type === "access-matrix");
check("contradictory access rows produce a blocking conflict naming both", !!access && access.specIds.includes(sA.specId) && access.specIds.includes(sB.specId), access?.subject);

console.log("\n=== SEMANTIC (advisory) ===");
const sem = await svc.semantic(sA.specId);
check("semantic layer returns warn-only advisory findings", sem.length > 0 && sem.every((f) => f.severity === "warn"));

console.log("\n=== DELIVERY LOOP (GREEN spec to DONE) ===");
check("starts in DRAFT", svc.getInstance(id).state === "DRAFT");
check("submit -> IN_REVIEW", svc.transition(id, { type: "submit", at: "t" }).instance.state === "IN_REVIEW");
check("approve (frontend-peer) -> APPROVED", svc.transition(id, { type: "approve", role: "frontend-peer", identity: "peer-1", at: "t" }).instance.state === "APPROVED");
check("startGeneration (generator=agent-7) -> GENERATING", svc.transition(id, { type: "startGeneration", generatorId: "agent-7", at: "t" }).instance.state === "GENERATING");
check("completeGeneration -> VERIFYING", svc.transition(id, { type: "completeGeneration", at: "t" }).instance.state === "VERIFYING");

console.log("\n=== VERIFICATION HARNESS ===");
const harness = svc.verify(id);
check("harness passes for the clean spec", harness.passed === true);
check("EARS criteria compiled into stubs", harness.results.find((r) => r.runnerId === "ears-stub").artifacts.length > 0);
check("persona/access assertions derived", harness.results.find((r) => r.runnerId === "persona-access").status === "pass");

console.log("\n=== INDEPENDENT VERIFICATION (generator != verifier) ===");
const selfSign = svc.transition(id, { type: "signOffVerification", verifierId: "agent-7", passed: true, at: "t" });
check("generator signing off own work is REJECTED", selfSign.ok === false && /independent-verification/.test(selfSign.error));
check("instance stays in VERIFYING after rejection", svc.getInstance(id).state === "VERIFYING");
const sign = svc.transition(id, { type: "signOffVerification", verifierId: "human-9", passed: harness.passed, at: "t" });
check("independent verifier signs off -> READY_FOR_UAT", sign.ok && sign.instance.state === "READY_FOR_UAT");

console.log("\n=== PROVENANCE + DRIFT ===");
const rec = svc.recordGeneration({ specId: id, promptContextRef: "ctx://run/1", artifacts: [{ ref: "badge.tsx", content: "ORIGINAL" }], cost: 0.5, at: "2026-06-27T00:00:00Z" });
check("generation snapshot stored (hash + pinned model)", /^[0-9a-f]{64}$/.test(rec.specContentHash) && rec.pinnedModel === cfg.semantic.model);
const cleanDrift = svc.drift([{ artifactRef: "badge.tsx", hash: rec ? hashOf("ORIGINAL") : "" }]);
check("no drift when deployed artifact matches snapshot", cleanDrift.filter((d) => d.kind === "modified").length === 0);
const drift = svc.drift([{ artifactRef: "badge.tsx", hash: hashOf("EDITED BY HAND") }]);
check("drift detected when artifact edited out-of-band", drift.some((d) => d.kind === "modified" && d.specId === id));

console.log("\n=== UAT -> DONE ===");
check("completeUAT -> DONE", svc.transition(id, { type: "completeUAT", at: "t" }).instance.state === "DONE");
svc.recordDefect({ specId: id, phase: "production", description: "late regression", at: "t" });

console.log("\n=== APPROVAL GATE (RED needs 3 approvers) ===");
const rid = red.specId;
svc.transition(rid, { type: "submit", at: "t" });
svc.transition(rid, { type: "approve", role: "commerce-domain-owner", identity: "a", at: "t" });
check("one RED approval is not enough", svc.getInstance(rid).state === "IN_REVIEW");
svc.transition(rid, { type: "approve", role: "security-reviewer", identity: "b", at: "t" });
svc.transition(rid, { type: "approve", role: "pci-compliance-officer", identity: "c", at: "t" });
check("all three RED approvers -> APPROVED", svc.getInstance(rid).state === "APPROVED");

console.log("\n=== OBSERVABILITY METRICS ===");
const m = svc.metrics();
check("metrics: gate pass/fail tallied", m.gate.pass === 3 && m.gate.fail === 1, JSON.stringify(m.gate));
check("metrics: tier distribution", m.tierDistribution.GREEN === 3 && m.tierDistribution.RED === 1, JSON.stringify(m.tierDistribution));
check("metrics: conflict counts by type", m.conflictCountsByType["access-matrix"] >= 1);
check("metrics: 1 DONE instance", m.byState.DONE === 1);
check("metrics: cost per generation", m.costPerGeneration === 0.5, `$${m.costPerGeneration}`);
check("metrics: defect-escape rate > 0", m.defectEscapeRate > 0, `${Math.round(m.defectEscapeRate * 100)}%`);

console.log(`\n=== RESULT: ${ok.length} passed, ${fail.length} failed ===`);
if (fail.length) {
  console.log("FAILED:", fail.join("; "));
  process.exit(1);
}

import { createHash } from "node:crypto";
function hashOf(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
