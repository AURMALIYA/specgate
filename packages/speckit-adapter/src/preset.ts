import type { SpecGateConfig } from "@specgate/config";
import { generateConstitutionTemplate, generateSpecTemplate } from "./template.js";

export interface PresetBundle {
  /** Relative path -> file content. Write these under a preset directory. */
  files: Record<string, string>;
}

function presetManifest(config: SpecGateConfig): string {
  return [
    'schema_version: "1.0"',
    "",
    "preset:",
    '  id: "specgate"',
    '  name: "SpecGate governance template"',
    '  version: "0.1.0"',
    `  description: "SpecGate gate sections, EARS criteria, and access-matrix template (org: ${config.org})."`,
    '  author: "SpecGate"',
    '  repository: "https://github.com/your-org/spec-kit-preset-specgate"',
    '  license: "MIT"',
    "",
    "requires:",
    '  speckit_version: ">=0.1.0"',
    "",
    "provides:",
    "  templates:",
    '    - type: "template"',
    '      name: "spec-template"',
    '      file: "templates/spec-template.md"',
    '      description: "SpecGate-conformant feature spec (gate sections + EARS + access matrix)."',
    '      replaces: "spec-template"',
    '    - type: "template"',
    '      name: "constitution-template"',
    '      file: "templates/constitution-template.md"',
    '      description: "Constitution seeded from the SpecGate constitution rules."',
    '      replaces: "constitution-template"',
    "",
    "tags:",
    '  - "governance"',
    '  - "ears"',
    '  - "specgate"',
    "",
  ].join("\n");
}

function readme(config: SpecGateConfig): string {
  return [
    "# SpecGate preset for Spec Kit",
    "",
    "Installs the SpecGate authoring template so specs are written, locally and in your",
    "agent, in the exact shape the SpecGate server-side gate enforces: mandatory gate",
    "sections, EARS acceptance criteria, and a structured persona/access matrix.",
    "",
    "## Install",
    "",
    "```bash",
    "specify preset add --dev ./specgate-preset",
    "```",
    "",
    "Then `/speckit.specify` produces a SpecGate-conformant `spec.md`. Push it; the",
    "SpecGate gate (CLI / GitHub Action) validates and tiers it server-side and blocks",
    "on any blocking finding — the same template, now non-bypassable.",
    "",
    `This preset was generated from the **${config.org}** config; regenerate it whenever`,
    "the org config changes so the local template never drifts from the enforced gate:",
    "",
    "```bash",
    "specgate-speckit emit-preset ./specgate-preset --config <org-config.yaml>",
    "```",
    "",
  ].join("\n");
}

const MIT_LICENSE = [
  "MIT License",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  'of this software and associated documentation files (the "Software"), to deal',
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so.",
  "",
].join("\n");

/** Build a Spec Kit preset bundle (preset.yml + README + LICENSE + templates). */
export function buildPreset(config: SpecGateConfig): PresetBundle {
  return {
    files: {
      "preset.yml": presetManifest(config),
      "README.md": readme(config),
      "LICENSE": MIT_LICENSE,
      "templates/spec-template.md": generateSpecTemplate(config),
      "templates/constitution-template.md": generateConstitutionTemplate(config),
    },
  };
}
