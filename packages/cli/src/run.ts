import { readFileSync } from "node:fs";
import type { SpecGateConfig } from "@specgate/config";
import {
  runGate,
  runGateBatch,
  scopeBatchToChanged,
  type BatchGateReport,
  type GateReport,
  type ScopedReview,
} from "@specgate/gate";
import { resolveSpecFiles } from "./files.js";

export interface RunFilesResult {
  reports: GateReport[];
  missing: string[];
}

function readAll(inputs: string[]): { files: string[]; missing: string[] } {
  return resolveSpecFiles(inputs);
}

/** Standardization-only run (schema + constitution), per spec. Used by `validate`. */
export function runValidateOverFiles(inputs: string[], config: SpecGateConfig): RunFilesResult {
  const { files, missing } = readAll(inputs);
  const reports = files.map((path) =>
    runGate({ raw: readFileSync(path, "utf8"), config, path, skipTier: true }),
  );
  return { reports, missing };
}

export interface RunBatchResult {
  batch: BatchGateReport;
  missing: string[];
}

/** Full batch run (schema + policy + tier + cross-spec conflicts). */
export function runBatchOverFiles(inputs: string[], config: SpecGateConfig): RunBatchResult {
  const { files, missing } = readAll(inputs);
  const batch = runGateBatch(
    files.map((path) => ({ raw: readFileSync(path, "utf8"), path })),
    config,
  );
  return { batch, missing };
}

export interface RunRepoPrResult {
  /** The whole-repo batch. */
  batch: BatchGateReport;
  /** Findings scoped to the PR's changed specs (+ conflicts that involve them). */
  scoped: ScopedReview;
  missing: string[];
}

/**
 * Whole-repo PR gate: gate EVERY spec in the repo (so cross-spec conflicts and
 * dependencies resolve against the full set), then scope the reported findings
 * to the PR's changed specs. `repoInputs` are paths/dirs covering all specs;
 * `changedInputs` are the PR's changed spec files.
 */
export function runRepoPrGate(
  repoInputs: string[],
  changedInputs: string[],
  config: SpecGateConfig,
): RunRepoPrResult {
  const { files, missing } = readAll(repoInputs);
  const batch = runGateBatch(
    files.map((path) => ({ raw: readFileSync(path, "utf8"), path })),
    config,
    { includeDanglingDeps: true },
  );
  const changedFiles = readAll(changedInputs).files;
  const scoped = scopeBatchToChanged(batch, changedFiles);
  return { batch, scoped, missing };
}
