---
id: NW-NOTES-READONLY
title: Order notes are read-only for agents
owner: dana.compliance
team: support
version: 1.0.0
status: draft
risk_tier: GREEN
change_categories:
  - storefront-ui
provides:
  - order-notes-readonly-policy
consumes: []
depends_on: []
linked_requirements:
  - REQ-3002
success_metric: "Zero agent edits to immutable order notes."
---

# 1. Linkage
Implements REQ-3002 (phase: support-tools). Success metric: zero agent edits to
immutable order notes.

# 2. Intent
Keep order notes immutable for agents to preserve an audit trail.

# 3. Persona & access matrix

| role          | resource    | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases          | fallback  |
|---------------|-------------|---------|----------|------------|-------------------|------------------|---------------------|-----------|
| support-agent | order-notes | true    | false    | all        | service           | agent_team       | edit after creation | read-only |

# 4. Acceptance criteria
- WHEN a support agent opens an order THE SYSTEM SHALL display the order notes.
- IF a support agent attempts to edit an order note THEN THE SYSTEM SHALL reject the edit.

# 5. Data & privacy classification
Order notes are internal operational text. No cardholder or regulated data.
Sensitivity: internal.

# 6. Surface / impact
Touches the storefront-ui change category (an internal support view).

# 7. Integration contracts
Reads order notes via the orders service notes endpoint; no write path.

# 8. Non-functionals
Accessibility: the notes view is screen-reader friendly.

# 9. Verification plan
Automated checks; persona/access assertions derived from the access matrix.
Rollback reference: revert to the prior notes policy configuration.

# 10. Risk tier & approvers
Risk tier: GREEN. Required approver role: frontend-peer.

# 11. Out of scope / open questions
Out of scope: retention period for order notes.
