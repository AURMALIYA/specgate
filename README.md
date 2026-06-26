# SpecGate

A **platform-agnostic governance layer** that sits between spec authoring (GitHub Spec Kit) and
code generation/development. SpecGate doesn't author specs and doesn't generate application code —
it **governs the specs that drive both**, adding the server-side, enforced layer that local spec
tooling lacks.

## Three pillars

1. **Standardize** specs before they merge — a machine-readable schema with mandatory *gate*
   sections, EARS acceptance criteria, and a structured persona/access matrix.
2. **Detect conflicts** across all specs — especially contradictory access/identity decisions —
   before they reach code.
3. **Enforce the workflow** — constitution-as-code, risk-tier routing with automatic hidden-RED
   escalation, tier-based approval gates, and independent verification (the actor that generates a
   change may never certify it).

## Hard constraint: platform-agnosticism

The engine contains **zero** platform/vendor/product identifiers. All such knowledge lives in
`config/`. A test ([`tests/neutrality.test.ts`](tests/neutrality.test.ts)) greps the engine
packages against a denylist and fails on any hit.

## Quick start

```bash
pnpm install
pnpm build
pnpm test

# Gate the worked example org's specs
node packages/cli/dist/bin.js gate config/example-org/specs --config config/example-org/config.yaml

# Gate SpecGate's own specs against the default config
node packages/cli/dist/bin.js gate specs --config config/default.config.yaml
```

## Status

Phase 0 (scaffold) and Phase 1 (standardization gate) are complete. See [CLAUDE.md](CLAUDE.md) for
the layout and phase roadmap, and [DECISIONS.md](DECISIONS.md) for recorded assumptions.

## Configuration

- [`config/default.config.yaml`](config/default.config.yaml) — documented, neutral baseline.
- [`config/example-org/`](config/example-org/) — a fully worked fictional org plus fixture specs.

Copy the default config, fill in your organization's change taxonomy, sensitive surfaces, reviewer
matrix, and constitution, and point the CLI / Action at it.
