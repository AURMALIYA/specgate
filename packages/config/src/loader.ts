import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { SpecGateConfig } from "./schema.js";

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Parse + validate a config object that is already in memory. */
export function parseConfig(raw: unknown): SpecGateConfig {
  const result = SpecGateConfig.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join(".") || "<root>"}: ${i.message}`,
    );
    throw new ConfigError("Invalid SpecGate configuration", issues);
  }
  return result.data;
}

/** Load a config from a YAML or JSON file path. */
export function loadConfig(path: string): SpecGateConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(`Could not read config file at ${path}: ${(err as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new ConfigError(`Could not parse config file at ${path}: ${(err as Error).message}`);
  }
  return parseConfig(raw);
}
