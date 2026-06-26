import { readFileSync } from "node:fs";
import type { SpecGateConfig } from "@specgate/config";
import { runGate, type GateReport } from "@specgate/gate";
import { resolveSpecFiles } from "./files.js";

export interface RunGateFilesResult {
  reports: GateReport[];
  missing: string[];
}

/** Run the standardization gate over a set of path inputs. */
export function runGateOverFiles(inputs: string[], config: SpecGateConfig): RunGateFilesResult {
  const { files, missing } = resolveSpecFiles(inputs);
  const reports = files.map((path) => {
    const raw = readFileSync(path, "utf8");
    return runGate({ raw, config, path });
  });
  return { reports, missing };
}
