import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@specgate/config";
import { describe, expect, it } from "vitest";
import { applyEvent, approvalSatisfied, createInstance, missingRoles } from "../src/index.js";
import type { WorkflowInstance } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cfg = loadConfig(resolve(ROOT, "config/example-org/config.yaml"));

function redInstance(): WorkflowInstance {
  return createInstance("NW-PAY-1", "RED", cfg);
}

function approveAll(instance: WorkflowInstance, roles: string[]): WorkflowInstance {
  let i = instance;
  roles.forEach((role, n) => {
    i = applyEvent(i, { type: "approve", role, identity: `person-${n}`, at: `2026-06-26T0${n}:00:00Z` }).instance;
  });
  return i;
}

describe("delivery-loop state machine", () => {
  it("cannot reach APPROVED without the tier-required approver set (done-criterion)", () => {
    let i = redInstance();
    i = applyEvent(i, { type: "submit", at: "2026-06-26T00:00:00Z" }).instance;
    expect(i.state).toBe("IN_REVIEW");

    // RED requires 3 roles. One approval is not enough.
    i = applyEvent(i, { type: "approve", role: "commerce-domain-owner", identity: "a", at: "t1" }).instance;
    expect(i.state).toBe("IN_REVIEW");
    expect(approvalSatisfied(i)).toBe(false);
    expect(missingRoles(i)).toEqual(["security-reviewer", "pci-compliance-officer"]);

    // Complete the required set with distinct identities.
    i = applyEvent(i, { type: "approve", role: "security-reviewer", identity: "b", at: "t2" }).instance;
    expect(i.state).toBe("IN_REVIEW");
    i = applyEvent(i, { type: "approve", role: "pci-compliance-officer", identity: "c", at: "t3" }).instance;
    expect(i.state).toBe("APPROVED");
  });

  it("enforces generator != verifier at VERIFYING -> READY_FOR_UAT (done-criterion)", () => {
    let i = redInstance();
    i = applyEvent(i, { type: "submit", at: "t" }).instance;
    i = approveAll(i, ["commerce-domain-owner", "security-reviewer", "pci-compliance-officer"]);
    expect(i.state).toBe("APPROVED");
    i = applyEvent(i, { type: "startGeneration", generatorId: "agent-7", at: "t" }).instance;
    i = applyEvent(i, { type: "completeGeneration", at: "t" }).instance;
    expect(i.state).toBe("VERIFYING");

    // Same identity as generator is rejected.
    const sameVerifier = applyEvent(i, { type: "signOffVerification", verifierId: "agent-7", passed: true, at: "t" });
    expect(sameVerifier.ok).toBe(false);
    expect(sameVerifier.error).toMatch(/independent-verification/);
    expect(sameVerifier.instance.state).toBe("VERIFYING");

    // A different verifier succeeds.
    const ok = applyEvent(i, { type: "signOffVerification", verifierId: "human-2", passed: true, at: "t" });
    expect(ok.ok).toBe(true);
    expect(ok.instance.state).toBe("READY_FOR_UAT");
    expect(ok.instance.verifierId).toBe("human-2");
  });

  it("rejects verification sign-off when verification did not pass", () => {
    let i = redInstance();
    i = applyEvent(i, { type: "submit", at: "t" }).instance;
    i = approveAll(i, ["commerce-domain-owner", "security-reviewer", "pci-compliance-officer"]);
    i = applyEvent(i, { type: "startGeneration", generatorId: "g", at: "t" }).instance;
    i = applyEvent(i, { type: "completeGeneration", at: "t" }).instance;
    const r = applyEvent(i, { type: "signOffVerification", verifierId: "v", passed: false, at: "t" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/did not pass/);
  });

  it("rejects out-of-order transitions and supports block/unblock", () => {
    let i = createInstance("S", "GREEN", cfg);
    expect(applyEvent(i, { type: "startGeneration", generatorId: "g", at: "t" }).ok).toBe(false);
    const blocked = applyEvent(i, { type: "block", reason: "audit hold", at: "t" });
    expect(blocked.instance.state).toBe("BLOCKED");
    i = applyEvent(blocked.instance, { type: "unblock", at: "t" }).instance;
    expect(i.state).toBe("DRAFT");
  });

  it("GREEN reaches APPROVED with a single peer approval", () => {
    let i = createInstance("S", "GREEN", cfg);
    i = applyEvent(i, { type: "submit", at: "t" }).instance;
    i = applyEvent(i, { type: "approve", role: "frontend-peer", identity: "p", at: "t" }).instance;
    expect(i.state).toBe("APPROVED");
  });
});
