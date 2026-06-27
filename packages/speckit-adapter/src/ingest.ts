import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SpecGateConfig } from "@specgate/config";
import { runGate, type GateReport } from "@specgate/gate";
import type { PromptContextRef } from "@specgate/policy";

export interface SpecKitArtifacts {
  /** Path to the feature's spec.md (the spec under test). */
  specPath: string;
  specRaw: string;
  constitutionPath?: string;
  planPath?: string;
  tasksPath?: string;
  contractPaths: string[];
  /** Constitution + plan + tasks + contracts, fed to the gate as prompt-context. */
  promptContext: PromptContextRef[];
}

export interface LoadOptions {
  /** Explicit constitution path; defaults to <featureDir>/../../.specify/memory/constitution.md. */
  constitutionPath?: string;
}

function maybeRead(path: string): string | undefined {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : undefined;
}

/**
 * Load a Spec Kit feature directory (`specs/<feature>/`) into the artifacts the
 * SpecGate gate consumes: the spec under test plus the constitution, plan,
 * tasks, and contracts as prompt-context.
 */
export function loadSpecKitFeature(featureDir: string, opts: LoadOptions = {}): SpecKitArtifacts {
  const dir = resolve(featureDir);
  const specPath = join(dir, "spec.md");
  const specRaw = maybeRead(specPath);
  if (specRaw === undefined) {
    throw new Error(`No spec.md found in Spec Kit feature directory: ${dir}`);
  }

  const constitutionPath =
    opts.constitutionPath ?? resolve(dir, "..", "..", ".specify", "memory", "constitution.md");
  const planPath = join(dir, "plan.md");
  const tasksPath = join(dir, "tasks.md");
  const contractsDir = join(dir, "contracts");

  const promptContext: PromptContextRef[] = [];
  const add = (ref: string, text?: string) => {
    if (text !== undefined) promptContext.push({ ref, text });
  };

  const constitution = maybeRead(constitutionPath);
  add(constitutionPath, constitution);
  const plan = maybeRead(planPath);
  add(planPath, plan);
  const tasks = maybeRead(tasksPath);
  add(tasksPath, tasks);

  const contractPaths: string[] = [];
  if (existsSync(contractsDir) && statSync(contractsDir).isDirectory()) {
    for (const name of readdirSync(contractsDir)) {
      const p = join(contractsDir, name);
      if (statSync(p).isFile()) {
        contractPaths.push(p);
        add(p, readFileSync(p, "utf8"));
      }
    }
  }

  return {
    specPath,
    specRaw,
    constitutionPath: constitution !== undefined ? constitutionPath : undefined,
    planPath: plan !== undefined ? planPath : undefined,
    tasksPath: tasks !== undefined ? tasksPath : undefined,
    contractPaths,
    promptContext,
  };
}

export interface SpecKitGateResult {
  artifacts: SpecKitArtifacts;
  report: GateReport;
}

/**
 * Gate a Spec Kit feature: run the full SpecGate gate over its spec.md, with the
 * constitution/plan/tasks/contracts supplied as prompt-context (so the
 * no-regulated-data constitution rule scans them too).
 */
export function gateSpecKitFeature(
  featureDir: string,
  config: SpecGateConfig,
  opts: LoadOptions = {},
): SpecKitGateResult {
  const artifacts = loadSpecKitFeature(featureDir, opts);
  const report = runGate({
    raw: artifacts.specRaw,
    config,
    path: artifacts.specPath,
    facts: { promptContext: artifacts.promptContext },
  });
  return { artifacts, report };
}
