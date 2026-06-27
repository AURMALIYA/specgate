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

All phases (0–4) are complete: scaffold, the standardization gate, the registry + risk-tier engine
(with hidden-RED escalation) + deterministic conflict engine, the delivery-loop state machine +
verification harness + provenance/drift, and the advisory semantic layer + observability metrics +
dashboard. See [CLAUDE.md](CLAUDE.md) for the layout, and [DECISIONS.md](DECISIONS.md) for assumptions.

```bash
# Run the backend API + dashboard, then open http://localhost:8787
SPECGATE_CONFIG=config/example-org/config.yaml node apps/api/dist/main.js
# POST specs to /ingest; browse the registry, conflicts, tier distribution, and metrics in the UI.
```

The advisory **semantic layer** (contradictory non-functionals / overlapping intent) runs only when
`semantic.enabled` is set in config and `ANTHROPIC_API_KEY` is present; it always emits warnings,
never blocks, runs after the deterministic checks, and fails open on any error.

The delivery loop (`DRAFT → IN_REVIEW → APPROVED → GENERATING → VERIFYING → READY_FOR_UAT → DONE`,
plus `BLOCKED`) maps onto Spec Kit's specify → clarify → plan/tasks → generate → verify, with the
spec-review and tier-routing gates inserted before generate and the independent-verify stage after.
Approval gates use the per-tier reviewer matrix, and the generator can never be the verifier.

```bash
# Run the backend API (in-memory)
SPECGATE_CONFIG=config/example-org/config.yaml node apps/api/dist/main.js
```

```bash
# Re-derive tiers and surface hidden-RED escalation
node packages/cli/dist/bin.js tier config/example-org/specs-conflict --config config/example-org/config.yaml

# Detect cross-spec conflicts (contradictory access, duplicate capability, cycles, contract breaks)
node packages/cli/dist/bin.js conflicts config/example-org/specs-conflict --config config/example-org/config.yaml
```

## Configuration

- [`config/default.config.yaml`](config/default.config.yaml) — documented, neutral baseline.
- [`config/example-org/`](config/example-org/) — a fully worked fictional org plus fixture specs.

Copy the default config, fill in your organization's change taxonomy, sensitive surfaces, reviewer
matrix, and constitution, and point the CLI / Action at it.
