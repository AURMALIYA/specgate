---
id: SG-STANDARDIZATION-001
title: Standardization gate
owner: specgate-maintainers
team: platform
version: 1.0.0
status: active
risk_tier: YELLOW
change_categories:
  - business-logic
provides:
  - spec-standardization-gate
consumes: []
depends_on: []
linked_requirements:
  - PILLAR-1
success_metric: "100% of malformed specs are blocked before merge; zero false-negatives in the fixture suite."
---

# 1. Linkage
Implements Pillar 1 (standardize specs before merge) and the baseline of Pillar 3
(enforce the workflow). Deliverable: the schema + constitution gate. Success
metric: every malformed fixture is blocked and every well-formed fixture passes.

# 2. Intent
Block any spec from merging unless it conforms to the canonical schema, has all
gate sections, valid EARS criteria, and a parseable access matrix.

# 3. Persona & access matrix

| role          | resource     | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases            | fallback     |
|---------------|--------------|---------|----------|------------|-------------------|------------------|-----------------------|--------------|
| spec-author   | spec-content | true    | true     | own        | application       | author_identity  | merged specs          | read-only    |
| ci-pipeline   | gate-report  | true    | false    | all        | application       | pipeline_token   | none                  | fail-closed  |

# 4. Acceptance criteria
- WHEN a spec is missing a gate-marked section THE SYSTEM SHALL fail validation and name the section.
- WHEN an acceptance criterion does not match an EARS pattern THE SYSTEM SHALL flag it as non-testable.
- THE SYSTEM SHALL parse the access matrix into one typed row per role and resource.
- IF a required frontmatter field is absent THEN THE SYSTEM SHALL block validation.

# 5. Data & privacy classification
Operates on spec documents only. No customer or sensitive information is
processed. Sensitivity: internal.

# 6. Surface / impact
Touches the business-logic change category. Does not touch identity, data
governance, or money movement.

# 7. Integration contracts
Exposes a CLI (`specgate validate|gate`) and a CI entrypoint. Inputs are spec
file paths and a config; output is a structured gate report. On read error the
gate fails closed.

# 8. Non-functionals
Determinism: identical inputs produce identical reports. Performance: validates a
spec in under 50ms on a typical document.

# 9. Verification plan
Automated checks: unit tests over good and malformed fixtures. EARS criteria are
compiled into test stubs. Rollback reference: revert to the prior gate package
version; the gate is additive and can be disabled per-repo via config.

# 10. Risk tier & approvers
Risk tier: YELLOW. Required approver roles: peer-reviewer, domain-owner.

# 11. Out of scope / open questions
Out of scope: cross-spec conflict detection (see SG-CONFLICT specs) and tier
re-derivation (see SG-TIER specs).
