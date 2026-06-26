import { readFileSync } from "node:fs";
import type { SpecGateConfig } from "@specgate/config";
import { runGate, runGateBatch, type BatchGateReport, type GateReport } from "@specgate/gate";
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
