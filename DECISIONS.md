# Decisions & assumptions

Chronological log of non-obvious choices. Reversible unless noted.

## Phase 0–1

- **Stack = the recommended default.** TypeScript + pnpm workspaces + vitest + zod, as the brief
  recommends. No deviation, so no justification needed.
- **Config format is YAML** (`default.config.yaml`, `example-org/config.yaml`). The brief writes
  `default.config.*`; YAML is the most author-friendly data format and is parsed + zod-validated by
  `@specgate/config`. JSON also parses through the same loader.
- **Config schema lives in its own engine package (`@specgate/config`).** The *schema* (structure)
  is platform-neutral; only the *values* are platform-specific and live in `config/`. This keeps the
  neutrality boundary clean.
- **`@specgate/config` is treated as an engine package** and is covered by the neutrality test.
- **Worked example org = "Northwind Commerce Cloud"** (fictional). The token `northwind` is
  deliberately on the denylist to prove engine code never references the example.
- **Neutrality scope.** The denylist test scans `packages/{config,spec-schema,policy,risk-tier,
  registry,conflict-engine,gate,cli}/src`. `scm-adapter` and `apps/*` are exempt because adapters
  and app entrypoints are vendor-specific by design (the brief keeps the SCM adapter behind an
  interface precisely so the vendor code is isolated).
- **EARS "response" is `THE SYSTEM SHALL …`.** Kept literal/generic rather than a configurable
  system noun, to stay neutral and match the brief's patterns exactly. Bundling heuristics: >1
  `SHALL`, `and then`, semicolons, conjoined obligations.
- **Section matching is heading-based and tolerant** of numeric prefixes (`3. Persona…`) and
  ordering. Gate sections are matched by canonical id; unknown sections are advisory warnings.
- **Constitution evaluators are a built-in registry keyed by id**; config references an evaluator
  id, keeping rule *content* in config and rule *logic* in `@specgate/policy`. Unknown evaluator id
  → blocking finding.
- **`generator-verifier-differ` at gate time** only fires when both identities are present and
  equal. The *structural* enforcement (a state-machine transition that rejects generator==verifier)
  is Phase 3; the auto-rule is a second line of defense.
- **`rollback-reference-present` applies to "promotable" changes**, defined neutrally as any spec
  touching a change category whose `sensitivity` is not `low`.
- **CLI `tier`/`conflicts` are present but stubbed** (exit 2 with a "Phase 2" message) so the
  command surface is stable from Phase 1.
- **GitHub Action core (`runAction`) is decoupled from env/process** and takes an injected
  `ScmAdapter`, so it is unit-tested with a fake adapter. Inline PR comments are downgraded to
  annotations until the REST path lands in Phase 2 (logged, never silently dropped).

## Phase 2

- **Tier re-derivation = max(declared, category-floor, surface-tier).** The author's tier is never
  trusted: the final tier is the most sensitive of the declared tier, the highest `minTier` across
  touched change categories, and the highest `forcesTier` across matched sensitive surfaces. Any
  result above the declared tier is an escalation; a restricted-surface match that pushes a
  sub-RED spec to RED is flagged as `hiddenRed`.
- **Escalation is fail-safe (over-escalates).** Keyword matching is intentionally simple
  (word-boundary, case-insensitive) and does not understand negation — a spec that says "no
  regulated data" can still trip the `regulated data` keyword. Over-escalation to RED is the safe
  direction. Dogfood specs are therefore worded to avoid trigger phrases; orgs should expect the
  same and tune keywords. (Changed keyword matching from substring to word-boundary so short tokens
  like `pan` no longer match inside `expand`.)
- **Surface scanning inputs.** Path globs match the spec path + any `changedPaths` from a diff;
  metadata patterns match frontmatter values; keywords match body text; contract signals match the
  Integration-contracts section + declared contract names/refs. A diff is optional — the scan works
  on spec content alone and tightens when a diff is supplied.
- **Hidden-RED is a per-spec finding, not cross-spec**, so it is computed in the gate's per-spec
  tier step (via `risk-tier`) and rendered through `conflict-engine`'s `hiddenRedFinding` helper to
  keep one finding shape. The other deterministic checks (access, capability, cycle, contract) are
  genuinely cross-spec and run over the `registry`.
- **Contracts are structured in frontmatter** (`contracts[]` with `name`, `version`,
  `required_fields`). A breaking change = a higher version of the same contract name dropping a
  field that a lower version required. Works within a batch and against an optional registered
  baseline.
- **`validate` stays standardization-only** (`skipTier: true`); `tier`, `conflicts`, and `gate` use
  the full batch engine. `tier` exits 1 on any escalation; `conflicts` exits 1 on any blocking
  conflict.
- **Conflicts are attached to every involved spec's report** (so the Action annotates the right
  files) and also returned at the batch level. The GitHub adapter still downgrades inline review
  comments to file-level annotations until the REST review path lands.

## Phase 3

- **State machine is a pure reducer.** `applyEvent(instance, event)` returns a new instance or a
  rejection; the engine never mutates in place and never calls `Date.now()` — every event carries an
  ISO `at` timestamp from the caller, keeping transitions deterministic and replayable.
- **Approval auto-advances to APPROVED only when the tier-required set is satisfied** — every
  required role covered by an approval AND distinct-approver count ≥ `minApprovals` (both from the
  reviewer matrix). This is how "cannot reach APPROVED without tier-required approvers" is enforced.
- **generator≠verifier is structural, not advisory.** The `VERIFYING→READY_FOR_UAT` transition is
  rejected outright when `verifierId === generatorId`, independent of the constitution rule (which
  is a second line of defense at gate time). Sign-off also requires `passed === true`.
- **Verification harness runs as a separate stage** and never mutates the spec. Runners are
  pluggable via the `Runner` interface; `applies()` keeps them config/tier-driven (parity-oracle
  fires on `high`-sensitivity categories, rollback on non-GREEN, security gate on RED). EARS stubs
  and persona/access assertions are *generated* (there is no app code at the governance layer), so
  they are `todo`/`pass`; the harness only fails on real contradictions (e.g. editable-without-
  visible) or a missing rollback reference on a promotable change.
- **Provenance is caller-supplied + hash-derived.** The store records
  `{specId, specContentHash, pinnedModel, promptContextRef, timestamp, generatedArtifactRefs}`;
  artifact snapshots hash the generated content so the drift detector can later flag out-of-band
  edits (`modified`), plus `untracked` and `missing` artifacts.
- **`apps/api` is a composition layer.** A `SpecGateService` holds in-memory state (pluggable) and
  is the unit-tested surface; the `node:http` server is a thin JSON wrapper with no framework
  dependency. Metrics are basic counts here and expand into the observability API in Phase 4.
- **Removed `oracle` from the neutrality denylist.** "Parity oracle" is core domain vocabulary in
  the brief; the denylist must only contain unambiguous vendor/product names.

## Phase 4

- **Semantic layer is split: neutral logic + vendor adapter.** The brief says call the Anthropic
  SDK from the conflict engine, but engine packages must contain zero vendor identifiers. Resolved
  by keeping retrieval, prompt-building, the strict-JSON schema, and result parsing neutral in
  `conflict-engine` behind a `SemanticClient` interface, and putting the actual `@anthropic-ai/sdk`
  call in a new `llm-adapter` package (exempt from the denylist, like `scm-adapter`). The
  neutrality test caught "Anthropic" even in a code comment — kept the engine clean.
- **Semantic findings always `warn`, deterministic checks always run first, and the layer fails
  open.** Any client error or invalid output yields `[]` — the advisory layer can never block a PR.
  It only runs when `config.semantic.enabled` and a model client is wired (config + `ANTHROPIC_API_KEY`).
- **Anthropic client uses strict JSON** via `output_config.format` with a `json_schema` and the
  config-pinned model (`config.semantic.model`); model id is never hard-coded. Cast through
  `unknown` so it compiles across SDK minor versions that may not yet type `output_config`.
- **Dashboard is a static SPA served by `apps/api`, not Next.js** (stated deviation). Reason: a Next
  app is a separate toolchain that doesn't integrate with the repo's `tsc --build` project-reference
  build or vitest, adds heavy deps, and would need its own build/runtime. A dependency-free
  HTML/CSS/vanilla-JS SPA served from `apps/dashboard/public` by the API delivers the required views
  (registry, open conflicts, tier distribution, metrics), stays offline-buildable, and keeps `main`
  green. Swap in Next.js later behind the same JSON endpoints if desired.
- **Metrics definitions** (`apps/api` Service): regeneration rate = fraction of generated specs with
  >1 generation record; defect-escape rate = defects in `uat`/`production` phases over specs that
  reached READY_FOR_UAT/DONE; gate pass/fail from ingest-time gate result; custom-vs-standard ratio
  = specs tripping the standard-first rule over total; conflict counts by type from the deterministic
  engine over the registry; cost per generation = mean of caller-supplied generation costs.

## Spec Kit integration

- **All Spec Kit knowledge lives in `speckit-adapter`** (exempt from the neutrality denylist, like
  `scm-adapter`/`llm-adapter`). The engine never references `.specify`, `spec-kit`, or `speckit`.
- **The preset is generated from the live schema + config, not hand-written.** `buildPreset(config)`
  emits the gate sections (from `SECTION_DEFS`), the access-matrix columns + config enums, and EARS
  examples. A test asserts the generated `spec-template.md` itself **passes `runGate`** under both
  the default and example configs — so the locally-authored template can never drift from the
  server-enforced gate. Regenerate with `specgate-speckit emit-preset` when the org config changes.
- **Manifest matches Spec Kit's real format.** Confirmed against `github/spec-kit`'s
  `presets/scaffold/preset.yml`: `schema_version: "1.0"`, `preset{id,name,version,description,
  author,repository,license}`, `requires.speckit_version`, `provides.templates[]` with
  `type/name/file/description/replaces`, and `tags`. Bundle layout is `preset.yml` + `README.md` +
  `LICENSE` + `templates/`. Install path: `specify preset add --dev ./specgate-preset`. The
  published artifact is committed at `integrations/speckit-preset/` (generated from default config).
- **Ingestion treats the Spec Kit spec.md as the spec under test** and feeds the constitution,
  plan, tasks, and contracts as **prompt-context** — so the `no-regulated-data` constitution rule
  scans all of them, not just the spec body. The constitution path defaults to
  `<feature>/../../.specify/memory/constitution.md` (Spec Kit's location), overridable.
- **The acceptance-criteria section in the generated template contains ONLY EARS lines** (no prose
  intro) because that section is parsed line-by-line as criteria — an intro sentence would be
  flagged non-testable.

## Spec co-author (authoring vision — phase 1)

- **Deliberate relaxation of "does not author specs."** Product decision to add an LLM co-author.
  Scoped to stay safe: the co-author *logic* (`spec-assistant`) is engine-neutral behind a
  `SpecAssistantClient` interface; the Anthropic call is in `llm-adapter`. The **deterministic gate
  stays the source of truth** — `coAuthorSpec` gates the draft, asks the assistant to fix the
  blocking findings, **re-gates**, and adopts a revision only if it *strictly* reduces the blocking
  count (prevents oscillation / accepting an equal-but-regressed draft). Loop stops on pass, no
  progress, maxRounds, or a client error (fails safe with the best spec so far).
- **Model is config-pinned** (`config.semantic.model`); the engine never hard-codes one. The
  co-author runs only when a client is wired (`apps/api` injects `AnthropicSpecAssistantClient`
  when `ANTHROPIC_API_KEY` is set); otherwise `/coauthor` returns a graceful 501 and the dashboard
  panel shows "not configured."
- **Vision roadmap (not yet built):** dispatch spine (`GenerationTarget` interface on the
  `APPROVED → GENERATING` transition) → git-handoff target (seed a branch/PR with spec + brief +
  provenance via `scm-adapter`) → Replit kicker (`replit-adapter`, API + dry-run fallback). Git
  plays three roles: PR-as-gate, handoff transport, and provenance/drift anchor.

## Open questions (non-blocking)

- Version derivation: currently `declared || sha256:<first12>`. May switch to full content-hash
  provenance in Phase 3.
- Capability namespace for `provides`/`consumes` is free-form strings for now; Phase 2 registry will
  formalize ownership and uniqueness.
