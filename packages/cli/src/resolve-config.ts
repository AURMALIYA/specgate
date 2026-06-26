import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type SpecGateConfig } from "@specgate/config";

const DEFAULT_CANDIDATES = [
  "specgate.config.yaml",
  "specgate.config.yml",
  ".specgate/config.yaml",
];

export class CliConfigError extends Error {}

/** Resolve and load the config: explicit `--config`, else conventional locations. */
export function resolveConfig(explicit: string | undefined, cwd = process.cwd()): SpecGateConfig {
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new CliConfigError(`Config file not found: ${explicit}`);
    }
    return loadConfig(explicit);
  }
  for (const candidate of DEFAULT_CANDIDATES) {
    const full = join(cwd, candidate);
    if (existsSync(full)) return loadConfig(full);
  }
  throw new CliConfigError(
    `No config provided. Pass --config <path> or add one of: ${DEFAULT_CANDIDATES.join(", ")}`,
  );
}
