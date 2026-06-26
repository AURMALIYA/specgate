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

## Open questions (non-blocking)

- Version derivation: currently `declared || sha256:<first12>`. May switch to full content-hash
  provenance in Phase 3.
- Capability namespace for `provides`/`consumes` is free-form strings for now; Phase 2 registry will
  formalize ownership and uniqueness.
