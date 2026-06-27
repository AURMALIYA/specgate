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
  `registry`, `conflict-engine`, `spec-assistant`, `workflow`, `verification`, `provenance`,
  `gate`, `cli`.
- **Exempt by design** (vendor/product-specific adapters): `packages/scm-adapter`,
  `packages/llm-adapter`, `packages/speckit-adapter`, and everything under `apps/`. The semantic
  *and* co-author *logic* live neutral (`conflict-engine` / `spec-assistant`) behind client
  interfaces; the Anthropic SDK calls live in `llm-adapter`. All Spec Kit / `.specify` knowledge
  lives in `speckit-adapter`.

## Note on authoring (deliberate constraint relaxation)

The original brief said the platform "does not author specs." That was relaxed by product decision
to add an **LLM spec co-author** (`spec-assistant`). The relaxation is scoped to stay safe:
- The co-author *logic* is engine-neutral; the model call is in `llm-adapter`.
- **The deterministic gate remains the source of truth** — every co-authored revision is re-gated,
  and a revision is adopted only if it strictly reduces blocking findings. The assistant cannot
  make a spec "pass" except by actually satisfying the gate.

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
  conflict-engine/ deterministic cross-spec checks + neutral advisory-semantic layer
  spec-assistant/ neutral LLM co-author loop (gate findings -> revise -> re-gate); client iface
  workflow/      delivery-loop state machine + tier-based approval + generator!=verifier
  verification/  pluggable harness: EARS->stubs, persona/access, parity, rollback, security
  provenance/    generation provenance store + drift detector
  llm-adapter/   ADAPTER (vendor-specific, exempt): Anthropic-backed SemanticClient
  speckit-adapter/ ADAPTER (exempt): generate Spec Kit preset from schema; ingest specs/<feature>/
  gate/          orchestrates schema -> policy -> tier -> conflicts; runGate + runGateBatch
  cli/           `specgate validate | tier | conflicts | gate`
  scm-adapter/   neutral interface + GitHub implementation
apps/
  action/        GitHub Action entrypoint that runs the gate on changed specs
  api/           backend Service + HTTP: ingest, state machine, verify, provenance, drift, semantic, metrics
  dashboard/     static SPA (served by api) — registry, conflicts, tier distribution, metrics
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
- [x] Phase 4 — advisory semantic layer (neutral logic in `conflict-engine` + `llm-adapter`
      Anthropic client, always `warn`, fails open), observability metrics in `apps/api`, and the
      static `apps/dashboard` SPA (registry, conflicts, tier distribution, metrics).
- [x] Spec co-author (authoring vision, phase 1) — `spec-assistant` runs an LLM
      revise→re-gate loop (gate is source of truth); `llm-adapter` client; `apps/api` `/coauthor`
      endpoint; dashboard "Co-author a spec" panel. Replit dispatch / git-handoff are the next phase.
      - **Offline mode:** `LocalSpecAssistantClient` (rule-based, no API key) repairs common gate
        failures (non-EARS criteria, missing rollback ref, missing gate sections). `apps/api` uses
        it automatically when `ANTHROPIC_API_KEY` is unset, so the co-author works fully offline.
- [x] Spec Kit integration — `speckit-adapter` generates a `specify`-installable preset
      (`integrations/speckit-preset/`, manifest matches Spec Kit's `preset.yml` schema) *from* the
      live schema+config, and ingests a Spec Kit `specs/<feature>/` dir (spec.md + constitution +
      plan + tasks + contracts) into the gate. `specgate-speckit emit-preset | gate`.

See [DECISIONS.md](DECISIONS.md) for recorded assumptions.
