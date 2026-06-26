---
id: NW-NOTES-SUPPORT
title: Support edits order notes
owner: lee.support-lead
team: support
version: 1.0.0
status: draft
risk_tier: GREEN
change_categories:
  - storefront-ui
provides:
  - order-notes-support-editing
consumes: []
depends_on: []
linked_requirements:
  - REQ-3001
success_metric: "Support agents can edit order notes on >=95% of orders."
---

# 1. Linkage
Implements REQ-3001 (phase: support-tools). Success metric: support agents can
edit order notes on at least 95% of orders.

# 2. Intent
Let support agents edit order notes to resolve customer issues quickly.

# 3. Persona & access matrix

| role          | resource    | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback  |
|---------------|-------------|---------|----------|------------|-------------------|------------------|------------|-----------|
| support-agent | order-notes | true    | true     | all        | service           | agent_team       | none       | read-only |

# 4. Acceptance criteria
- WHEN a support agent opens an order THE SYSTEM SHALL display the order notes.
- WHERE the agent has the support role THE SYSTEM SHALL allow editing the order notes.

# 5. Data & privacy classification
Order notes are internal operational text. No cardholder or regulated data.
Sensitivity: internal.

# 6. Surface / impact
Touches the storefront-ui change category (an internal support view).

# 7. Integration contracts
Reads and writes order notes via the orders service notes endpoint.

# 8. Non-functionals
Accessibility: the notes editor is keyboard operable.

# 9. Verification plan
Automated checks; persona/access assertions derived from the access matrix.
Rollback reference: feature-flag `support_notes_edit` reverts to read-only notes.

# 10. Risk tier & approvers
Risk tier: GREEN. Required approver role: frontend-peer.

# 11. Out of scope / open questions
Out of scope: who may delete an order.
