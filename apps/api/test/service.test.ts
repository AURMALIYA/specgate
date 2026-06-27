import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import type { SpecAssistantClient } from "@specgate/spec-assistant";
import { describe, expect, it } from "vitest";
import { SpecGateService } from "../src/service.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function freshService() {
  return new SpecGateService(cfg, { now: () => "2026-06-26T00:00:00Z" });
}

describe("SpecGateService — full delivery loop", () => {
  it("ingests a spec, drives it to DONE with independent verification and provenance", () => {
    const svc = freshService();
    const { specId, tier } = svc.ingest(read("config/example-org/specs/storefront-promotion-badge.md"), "badge.md");
    expect(tier.finalTier).toBe("GREEN");

    expect(svc.transition(specId, { type: "submit", at: "t" }).ok).toBe(true);
    expect(svc.transition(specId, { type: "approve", role: "frontend-peer", identity: "peer-1", at: "t" }).instance.state).toBe("APPROVED");
    expect(svc.transition(specId, { type: "startGeneration", generatorId: "agent-7", at: "t" }).ok).toBe(true);
    expect(svc.transition(specId, { type: "completeGeneration", at: "t" }).ok).toBe(true);

    const harness = svc.verify(specId);
    expect(harness.passed).toBe(true);

    // Generator may not verify their own work.
    const self = svc.transition(specId, { type: "signOffVerification", verifierId: "agent-7", passed: harness.passed, at: "t" });
    expect(self.ok).toBe(false);

    const signed = svc.transition(specId, { type: "signOffVerification", verifierId: "human-9", passed: harness.passed, at: "t" });
    expect(signed.ok).toBe(true);
    expect(svc.transition(specId, { type: "completeUAT", at: "t" }).instance.state).toBe("DONE");
  });

  it("records generation provenance with the pinned model and content hash", () => {
    const svc = freshService();
    const { specId } = svc.ingest(read("config/example-org/specs/storefront-promotion-badge.md"), "badge.md");
    const rec = svc.recordGeneration({
      specId,
      promptContextRef: "ctx://run/1",
      artifacts: [{ ref: "badge.tsx", content: "export const Badge = () => null;" }],
      at: "2026-06-26T00:00:00Z",
    });
    expect(rec.pinnedModel).toBe(cfg.semantic?.model);
    expect(rec.specContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.generatedArtifactRefs).toEqual(["badge.tsx"]);
    expect(svc.metrics().generations).toBe(1);
  });

  it("detects drift when a deployed artifact is edited out-of-band", () => {
    const svc = freshService();
    const { specId } = svc.ingest(read("config/example-org/specs/storefront-promotion-badge.md"), "badge.md");
    svc.recordGeneration({ specId, promptContextRef: "ctx", artifacts: [{ ref: "badge.tsx", content: "ORIGINAL" }], at: "t" });
    const clean = svc.drift([{ artifactRef: "badge.tsx", hash: hashOf("ORIGINAL") }]);
    expect(clean.filter((f) => f.kind === "modified")).toHaveLength(0);
    const drifted = svc.drift([{ artifactRef: "badge.tsx", hash: hashOf("EDITED BY HAND") }]);
    expect(drifted.some((f) => f.kind === "modified" && f.specId === specId)).toBe(true);
  });

  it("co-authors a failing draft to a passing spec through an injected assistant", async () => {
    const good = read("config/example-org/specs/storefront-promotion-badge.md");
    const broken = good.replace(
      "- WHEN a product has an active promotion THE SYSTEM SHALL display a promotion badge on the product card.",
      "- The badge should look nice.",
    );
    const assistant: SpecAssistantClient = { async improve() { return { revisedSpec: good }; } };
    const svc = new SpecGateService(cfg, { now: () => "t", assistantClient: assistant });
    expect(svc.assistantAvailable).toBe(true);
    const result = await svc.coAuthor(broken);
    expect(result.before.ok).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("a RED spec cannot reach APPROVED without all three RED approvers", () => {
    const svc = freshService();
    const { specId, tier } = svc.ingest(read("config/example-org/specs-conflict/hidden-red-merchant-roles.md"), "roles.md");
    expect(tier.finalTier).toBe("RED");
    svc.transition(specId, { type: "submit", at: "t" });
    svc.transition(specId, { type: "approve", role: "commerce-domain-owner", identity: "a", at: "t" });
    expect(svc.getInstance(specId)?.state).toBe("IN_REVIEW");
    svc.transition(specId, { type: "approve", role: "security-reviewer", identity: "b", at: "t" });
    svc.transition(specId, { type: "approve", role: "pci-compliance-officer", identity: "c", at: "t" });
    expect(svc.getInstance(specId)?.state).toBe("APPROVED");
  });
});

import { createHash } from "node:crypto";
function hashOf(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
