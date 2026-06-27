# SpecGate — agent working notes

SpecGate is a **platform-agnostic governance layer** between spec authoring (GitHub Spec Kit) and
code generation/development. It does **not** author specs and does **not** generate application
code — it governs the specs that drive both.

## The one rule that must never break

**Engine packages contain zero platform/vendor/product identifiers.** All knowledge of "what is
sensitive", "what the change categories are", "who approves what", and "what the constitution
forbids" lives in `config/`, never in engine code. This is enforced by
[`tests/neutrality.test.ts`](tests/neutrality.test.ts) against
[`scripts/neutrality-denylist.txt`](scripts/neutrality-denylist.txt).

- **Engine packages** (must stay neutral): `config`, `spec-schema`, `policy`, `risk-tier`,
  `registry`, `conflict-engine`, `gate`, `cli`.
- **Exempt by design** (vendor-specific): `packages/scm-adapter` and everything under `apps/`.

If you need platform-specific behavior, add it to a config schema field + the config files, not to
engine code.

## Layout

```
packages/
  config/        zod config schema + loader + tier helpers      (neutral)
  spec-schema/   frontmatter + section + EARS + access-matrix parsing & validation
  policy/        constitution-as-code: rules + auto evaluators
  risk-tier/     sensitive-surface scan + tier classifier + hidden-RED escalation
  registry/      ingest specs -> model + graph (access rows, capabilities, deps, contracts)
  conflict-engine/ deterministic cross-spec checks + (Phase 4) semantic advisory
  workflow/      delivery-loop state machine + tier-based approval + generator!=verifier
  verification/  pluggable harness: EARS->stubs, persona/access, parity, rollback, security
  provenance/    generation provenance store + drift detector
  gate/          orchestrates schema -> policy -> tier -> conflicts; runGate + runGateBatch
  cli/           `specgate validate | tier | conflicts | gate`
  scm-adapter/   neutral interface + GitHub implementation
apps/
  action/        GitHub Action entrypoint that runs the gate on changed specs
  api/           backend Service: ingest, state machine, verify, provenance, drift, metrics + HTTP
  dashboard/     (Phase 4) Next.js dashboard
config/
  default.config.yaml      documented neutral baseline
  example-org/             a fully worked fictional org ("northwind") + fixture specs
specs/           the platform's own behavioral requirements, dogfooded as EARS specs
```

## Conventions

- TypeScript ESM, NodeNext resolution. **Intra-repo imports use `.js` extensions** (e.g.
  `import { x } from "./y.js"`) even though the source is `.ts` — required by NodeNext.
- pnpm workspaces; packages depend on each other via `workspace:*`.
- `composite` TS project references; build with `pnpm build` (runs `tsc --build`).
- Tests are vitest; engine/conflict logic is unit-tested hard against fixtures in
  `config/example-org/`.
- Zod validates all external input (config + frontmatter). Never trust author-declared values
  (especially `risk_tier` — it is re-derived in Phase 2).

## Commands

```
pnpm install
pnpm build            # tsc --build across all project references
pnpm test             # vitest run (includes the neutrality test)
node packages/cli/dist/bin.js --help
node packages/cli/dist/bin.js gate config/example-org/specs --config config/example-org/config.yaml
```

## Phase status

- [x] Phase 0 — scaffold, config schema + default + example-org, CLI `--help`, neutrality test.
- [x] Phase 1 — standardization gate: `spec-schema` + `policy` + `gate`, CLI `validate`/`gate`,
      GitHub Action with annotations.
- [x] Phase 2 — `registry` + `risk-tier` (sensitive-surface scan → hidden-RED escalation) +
      deterministic `conflict-engine`; CLI `tier`/`conflicts`; batch `gate` with cross-spec
      conflicts; Action annotates conflicts and blocks on `block` severity.
- [x] Phase 3 — `workflow` delivery-loop state machine (tier-based approval gates;
      generator≠verifier enforced structurally at VERIFYING→READY_FOR_UAT), `verification`
      harness (EARS→stubs, persona/access, parity, rollback, security), `provenance` store +
      drift detector, all composed in `apps/api` (Service + minimal HTTP server).
- [ ] Phase 4 — semantic advisory layer + dashboard + metrics.

See [DECISIONS.md](DECISIONS.md) for recorded assumptions.
