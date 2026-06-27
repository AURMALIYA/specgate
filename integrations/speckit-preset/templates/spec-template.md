---
id: SPEC-0000
title: Replace with a one-line title
owner: replace.with.owner
team: replace-with-team
version: 0.1.0
status: draft
risk_tier: GREEN
change_categories:
  - presentation
provides: []
consumes: []
depends_on: []
linked_requirements:
  - REQ-0000
success_metric: "Replace with a measurable success metric."
contracts: []
---

# 1. Linkage  (gate)
Requirement IDs, phase/deliverable, related work, and the measurable success metric.

# 2. Intent
One or two sentences describing the outcome.

# 3. Persona & access matrix  (gate)
| role | resource | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback |
|------|----------|---------|----------|------------|-------------------|------------------|------------|----------|
| viewer | <resource> | true | false | own | presentation | <attribute> | none | read-only |

> One row per (role, resource). data_scope ∈ [own, entity, all]; enforcement_layer ∈ [presentation, application, data].

# 4. Acceptance criteria  (gate)
- THE SYSTEM SHALL <state an observable, always-true behavior>.
- WHEN <trigger> THE SYSTEM SHALL <state the observable response>.
- WHILE <state> THE SYSTEM SHALL <state the observable behavior>.
- IF <unwanted condition> THEN THE SYSTEM SHALL <state the guarding response>.
- WHERE <feature is present> THE SYSTEM SHALL <state the optional behavior>.

# 5. Data & privacy classification  (gate)
Data touched and its classification. Flag any sensitive information so the platform can tier it. Use synthetic examples only.

# 6. Surface / impact  (gate)
Which change categories this touches (from the configured taxonomy). Be honest — the platform re-derives the tier from this and from the diff.

# 7. Integration contracts
External systems, request/response shapes, and failure/timeout behavior. Reference machine-readable contracts where applicable.

# 8. Non-functionals
Declared baselines: localization, accessibility, performance, etc.

# 9. Verification plan  (gate)
Which gates apply, the oracle for any migration, the UAT script, and a rollback reference.

# 10. Risk tier & approvers  (gate)
The risk tier and the required approver roles for that tier.

# 11. Out of scope / open questions
What is explicitly out of scope, and any open questions.
