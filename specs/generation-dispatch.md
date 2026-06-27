---
id: SG-DISPATCH-001
title: Generation dispatch to external targets
owner: specgate-maintainers
team: platform
version: 1.0.0
status: draft
risk_tier: YELLOW
change_categories:
  - business-logic
provides:
  - generation-dispatch
consumes:
  - approval-state-machine
  - provenance-store
depends_on:
  - SG-STANDARDIZATION-001
linked_requirements:
  - PILLAR-3
  - VISION-PUSH
success_metric: "100% of dispatched specs are APPROVED first and have a provenance record with a tracking handle."
---

# 1. Linkage
Implements the "push a spec once it meets the standard" vision on top of Pillar 3
(enforce the workflow). Phase: authoring-and-handoff. Deliverable: the dispatch
spine plus a git-handoff target. Success metric: every dispatched spec was
APPROVED first and produced a provenance record carrying a tracking handle.

# 2. Intent
Once a spec reaches the quality bar (gate passing and APPROVED), hand it off to an
external code-generation target so implementation can begin from a governed spec.

# 3. Persona & access matrix

| role         | resource         | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases                  | fallback   |
|--------------|------------------|---------|----------|------------|-------------------|------------------|-----------------------------|------------|
| maintainer   | dispatch-config  | true    | true     | all        | application       | maintainer_id    | unapproved specs            | read-only  |
| ci-pipeline  | dispatch-trigger | true    | false    | all        | application       | pipeline_token   | specs not in APPROVED state | fail-closed |

# 4. Acceptance criteria
- WHEN a spec reaches APPROVED and a generation target is configured THE SYSTEM SHALL dispatch the spec to that target.
- THE SYSTEM SHALL refuse to dispatch any spec that has not reached the APPROVED state.
- THE SYSTEM SHALL record the dispatch target and a tracking handle in the provenance store.
- WHERE a git-handoff target is selected THE SYSTEM SHALL open a branch seeded with the spec, a generation brief, and the provenance record.
- IF dispatch to a target fails THEN THE SYSTEM SHALL leave the spec in APPROVED and report the failure.

# 5. Data & privacy classification
Operates on spec documents, generation briefs, and provenance metadata. Target
credentials are supplied at runtime and are never written into a spec. No
customer or sensitive information is processed. Sensitivity: internal.

# 6. Surface / impact
Touches the business-logic change category. The dispatch engine is target-neutral;
each external target (git-handoff, and later platform-specific kickers) is an
adapter behind a single interface. No identity, data-governance, or money-movement
surfaces are involved.

# 7. Integration contracts
Exposes a `GenerationTarget` interface: `dispatch(spec, brief, provenance)` returns
a tracking handle and URL. Failure and timeout behavior: a target error is caught,
the spec stays APPROVED, and the failure is surfaced; no partial provenance is
recorded for a failed dispatch.

# 8. Non-functionals
Portability: the git-handoff target requires no proprietary API and is the common
substrate every external target builds on. Determinism: an identical (spec,
target) pair produces an identical generation brief.

# 9. Verification plan
Automated checks: unit tests for the dispatch guard (APPROVED-only), the
provenance recording, and the git-handoff payload. The state machine asserts that
dispatch is reachable only from APPROVED. Rollback reference: dispatch is additive
and gated by config; disabling the target reverts to no handoff with no spec-state
change.

# 10. Risk tier & approvers
Risk tier: YELLOW. Required approver roles: peer-reviewer, domain-owner.

# 11. Out of scope / open questions
Out of scope: the downstream platform's own generation behavior. Open question:
should a failed dispatch auto-retry, or require a manual re-trigger?
