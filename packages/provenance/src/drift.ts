import type { ArtifactSnapshot, DriftFinding } from "./types.js";

export interface DeployedArtifact {
  artifactRef: string;
  hash: string;
}

export interface DetectDriftOptions {
  /** Report deployed artifacts that have no spec-linked snapshot. Default true. */
  reportUntracked?: boolean;
  /** Report snapshots with no corresponding deployed artifact. Default true. */
  reportMissing?: boolean;
}

/**
 * Detect drift between the spec-linked snapshots (captured at generation time)
 * and the artifacts currently deployed. A hash divergence means an artifact was
 * edited out-of-band and must be reconciled back to its spec.
 */
export function detectDrift(
  snapshots: ArtifactSnapshot[],
  deployed: DeployedArtifact[],
  options: DetectDriftOptions = {},
): DriftFinding[] {
  const reportUntracked = options.reportUntracked ?? true;
  const reportMissing = options.reportMissing ?? true;

  const snapByRef = new Map(snapshots.map((s) => [s.artifactRef, s]));
  const deployedByRef = new Map(deployed.map((d) => [d.artifactRef, d]));
  const findings: DriftFinding[] = [];

  for (const d of deployed) {
    const snap = snapByRef.get(d.artifactRef);
    if (!snap) {
      if (reportUntracked) {
        findings.push({
          kind: "untracked",
          artifactRef: d.artifactRef,
          actualHash: d.hash,
          detail: `Deployed artifact "${d.artifactRef}" has no spec-linked snapshot.`,
        });
      }
      continue;
    }
    if (snap.hash !== d.hash) {
      findings.push({
        kind: "modified",
        artifactRef: d.artifactRef,
        specId: snap.specId,
        expectedHash: snap.hash,
        actualHash: d.hash,
        detail: `Deployed artifact "${d.artifactRef}" diverges from spec ${snap.specId}'s snapshot; reconcile with the spec.`,
      });
    }
  }

  if (reportMissing) {
    for (const s of snapshots) {
      if (!deployedByRef.has(s.artifactRef)) {
        findings.push({
          kind: "missing",
          artifactRef: s.artifactRef,
          specId: s.specId,
          expectedHash: s.hash,
          detail: `Snapshot for "${s.artifactRef}" (spec ${s.specId}) has no deployed artifact.`,
        });
      }
    }
  }

  return findings;
}
