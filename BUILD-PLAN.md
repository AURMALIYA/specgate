# SpecGate — Build Plan

Consolidated from every requirement gathered so far. The neutral engine never changes its
contract: all platform/vendor knowledge stays in config + adapters (enforced by the neutrality
test). Each phase: keep `main` green, commit at the end, write tests as you go.

## Decisions on record
- **Authoring:** LLM spec co-author (shipped) + offline rule-based fallback (shipped).
- **First dispatch target:** Replit, on top of a portable git-handoff substrate.
- **Git roles:** (a) PR-as-gate, (b) handoff transport, (c) provenance/drift anchor.
- **Override policy:** full override of any finding, **audited** (justification + immutable log +
  PR + metrics).
- **Identity:** GitHub OAuth; roles mirror repo permissions (admin/maintain→admin,
  write→contributor/developer, read→viewer).

## Credentials/setup required from the user (for live, not offline, paths)
- A **GitHub OAuth App / GitHub App** (login, read collaborator permission, post PR comments, merge).
- **Replit API token** + a target repo (for live dispatch; git-handoff + dry-run work without it).
- `ANTHROPIC_API_KEY` (optional — enables the model-backed co-author + semantic layer; offline
  fallbacks exist).

---

## Shipped (phases 0–7)
- **0–1 Standardize:** monorepo + config schema; `spec-schema` (frontmatter, gate sections, EARS,
  access matrix), `policy` (constitution), `gate`, CLI, GitHub Action, neutrality test.
- **2 Detect conflicts:** `registry`, `risk-tier` (sensitive-surface scan + hidden-RED escalation),
  deterministic `conflict-engine`; CLI `tier`/`conflicts`; batch gate.
- **3 Enforce workflow:** `workflow` state machine (tier approval gates; generator≠verifier),
  `verification` harness, `provenance` + drift, `apps/api`.
- **4 Observe:** advisory semantic layer (`conflict-engine` + `llm-adapter`), metrics, dashboard.
- **Spec Kit:** `speckit-adapter` (schema→preset, feature ingestion, `/speckit.gate` command),
  Action speckit mode.
- **Co-author (authoring phase 1):** `spec-assistant` revise→re-gate loop; `llm-adapter` client;
  `/coauthor` + dashboard panel; offline `LocalSpecAssistantClient` (no API key).

---

## Requirement → phase traceability
| Req (source) | Phase |
|---|---|
| Collaborate on GitHub + PR | 8 (+ native GitHub) |
| Reject non-conforming PR with "what to fix/improve" | 8 |
| Use all repo specs per PR; resolve conflicts/deps | 8 |
| Admin runs the code via UX when review complete + deps resolved | 10 |
| Roles (admin/contributor/developer) per project | 9 |
| Admin merge PR / run code / override recommendations | 9 (roles) + 10 (run) + 11 (merge/override) |
| Push approved spec to Replit / generation target | 10 |

---

## Phase 8 — Whole-repo PR governance (the collaboration loop) — ✅ SHIPPED
**Goal:** a PR that doesn't meet governance is blocked with a precise "what to fix/improve"
comment, computed against **all** specs in the repo.

**Shipped:** `conflict-engine` dangling-dependency check; `gate` `runGateBatch({includeDanglingDeps})`
+ `scopeBatchToChanged`; `cli` `runRepoPrGate` (whole-repo gate, scoped to changed); `apps/action`
`repo` mode + the "what to fix/improve" comment renderer; `scm-adapter` `GitHubApiAdapter` (sticky PR
comment via REST); CI `pr-gate-repo-mode` job + changed-file diff step. Verified: a PR changing one
spec is blocked and names its conflict with an *unchanged* spec.


- Action: ingest **all** `specs/**/*.md` into the registry; detect the PR's **changed** specs
  (git diff vs base); run `runGateBatch` over the full set; **scope reported findings** to changed
  specs + any cross-spec conflict whose `specIds` include a changed spec (names the unchanged spec
  it collides with).
- `conflict-engine`: add a **dangling-dependency** check (`depends_on` target missing / not APPROVED).
- `scm-adapter`: real **GitHub REST** implementation — upsert a sticky **"⛔ What to fix / improve"**
  PR comment (blocking vs advisory groups) + inline comments; set the required check conclusion.
- **Fix suggestions:** attach per-finding suggested corrections via the co-author (offline or model).
- Docs: mark the SpecGate check **required** in branch protection (this is what "rejects" a PR).

**Offline-testable:** whole-repo ingest, changed-file scoping, dangling-dep check, comment rendering
(against a fixture repo). **Needs setup:** a live PR + token to post the actual comment.
**Done when:** a PR editing one spec is blocked with a comment that names a conflict with an
*unchanged* spec and lists the fixes.

## Phase 9 — Identity, projects & RBAC (the foundation for admin actions) — ✅ SHIPPED
**Goal:** per-project roles with GitHub-derived identity.

**Shipped:** neutral `@specgate/rbac` (roles viewer/developer/contributor/admin, capability matrix,
`can`/`authorize`, `Project`/`Membership`, `ProjectStore`, `StaticIdentityProvider`); `scm-adapter`
`GitHubIdentityProvider` (token→user via `/user`, role from repo permission); `apps/api`
`AccessController` + project/member endpoints + `GET /projects/:id/can/:capability`; opt-in
enforcement via `SPECGATE_AUTH=on`. Verified live: creator→admin, developer can author but not
approve/run/override, non-admin member-management → 403, unauthenticated → denied.
**Follow-up (not yet):** per-project scoping of the spec registry/instances + live GitHub OAuth
login UI (needs the GitHub App); enforcement currently covers project/membership + capability
checks, ready for Phase 10/11 to gate run/merge/override.


- **Project model:** `Project { repo, config, members:[{user, role}] }`; durable persistent
  `StorageAdapter`; scope registry/instances/provenance per project.
- **Identity:** `IdentityProvider` interface — GitHub OAuth impl (login + `GET /repos/{o}/{r}/
  collaborators/{u}/permission` → role) **and** a test/mock impl.
- **RBAC:** admin/contributor/developer capability matrix; server-side enforcement on every
  privileged endpoint.
- **Dashboard:** sign-in, project switcher, role-aware UI (hide/disable actions by role).

**Offline-testable:** project model, persistence, capability matrix, enforcement (mock identity).
**Needs setup:** the GitHub App for live OAuth + permission reads.
**Done when:** a non-admin is refused run/merge/override; an admin is allowed; roles resolve from
(mock) identity.

## Phase 10 — Dispatch spine + git-handoff + "Run" (admin runs the code) — ✅ SHIPPED
**Goal:** an admin runs the code from the UX once a spec is APPROVED and conflict-free.

**Shipped:** neutral `@specgate/dispatch` (`GenerationBrief`, `GenerationTarget`, `runEligibility`,
`DryRunTarget`); `scm-adapter` `GitHubHandoffTarget` (seeds a branch + brief file + PR); new
`@specgate/replit-adapter` `ReplitTarget` (composes the handoff, returns the Replit import URL,
dry-run by default, live API behind a token); `apps/api` `Service.run`/`runEligibility` +
`POST /instances/:id/run` (gated on the `run` capability) + `GET …/run-eligibility`; provenance
extended with `{dispatchTarget, dispatchHandle, gitRef}`; dashboard **Run** button (eligibility-aware).
Verified: DRAFT → not eligible; APPROVED → dispatched (dry-run), state → GENERATING, provenance
recorded. **Needs setup:** `GITHUB_TOKEN` + `SPECGATE_REPO` for real git-handoff; `REPLIT_API_*`
for the live Replit kicker.


- **Eligibility predicate:** gate has 0 blocks **and** no open cross-spec conflicts/dangling deps
  **and** state == APPROVED.
- **`GenerationTarget` interface** (neutral) + dispatch step on `APPROVED → GENERATING`; provenance
  records `{target, handle, git_ref}`.
- **git-handoff target:** open a branch/PR seeded with spec + generation brief + provenance (via
  `scm-adapter`) — the portable substrate every target builds on.
- **`replit-adapter`:** Replit kicker (import the branch, start its agent) — built to the API with a
  **dry-run** mode; the git-handoff is the fallback.
- **Dashboard "Run" button:** admin-only, enabled only when eligible → `POST …/run`.

**Offline-testable:** dispatch spine, git-handoff payload, eligibility, Run endpoint (dry-run/mock
target). **Needs setup:** Replit token + target repo for live dispatch.
**Done when:** an admin can dispatch an eligible spec from the UX; non-eligible/non-admin can't;
provenance records the dispatch.

## Phase 11 — Admin actions: merge + override-with-audit
**Goal:** admin can merge PRs and override any finding, with a strong audit trail.

- **Override (full, audited):** `POST …/override` requires a typed **justification**; writes an
  **immutable provenance audit event** (who/when/finding/why); posts it on the PR; surfaces it on
  the dashboard + in metrics (override count; **safety-invariant overrides flagged** loudly).
- **Merge PR:** UX action calling GitHub's merge API (admin-only; allowed when the check passed or
  an override is recorded).
- **Dashboard:** Override + Merge buttons (admin-only), each capturing/justifying the action.

**Offline-testable:** override flow, audit events, metrics (mock identity). **Needs setup:** GitHub
token/PR for live merge.
**Done when:** an admin overrides a block with a logged, visible justification; merge works against
GitHub.

## Phase 12 — Hardening (cross-cutting, optional)
Durable persistence backend, secrets management, deploy docs, rate limits, observability for the
audit log.

---

## Build order & rationale
1. **Phase 8** first — biggest correctness win, dogfoggable offline against a spec folder, and it
   completes the collaboration story independent of auth.
2. **Phase 9** next — RBAC is the foundation every admin action depends on.
3. **Phase 10** — run-the-code, needs eligibility + (9) roles.
4. **Phase 11** — merge + override, needs (9) roles + (3/10) provenance + GitHub adapter from (8).
5. **Phase 12** — productionize when the above are proven.

Phases 8–10 are largely buildable and verifiable **offline** (mock identity, dry-run targets,
fixture repos); the live GitHub-OAuth/merge and Replit-dispatch paths light up once the GitHub App
and Replit token are provided.
