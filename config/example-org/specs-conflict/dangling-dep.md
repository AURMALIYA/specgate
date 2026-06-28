---
id: NW-DANGLING-001
title: Feature with an unresolved dependency
owner: chris.platform
team: platform
version: 1.0.0
status: draft
risk_tier: GREEN
change_categories:
  - storefront-ui
provides:
  - dangling-example
consumes: []
depends_on:
  - NW-DOES-NOT-EXIST
linked_requirements:
  - REQ-9000
success_metric: "Ships once its dependency exists."
---

# 1. Linkage
Implements REQ-9000. Depends on a spec that is not in the repository yet.

# 2. Intent
Demonstrate a dangling dependency that the whole-repo PR gate should catch.

# 3. Persona & access matrix

| role   | resource | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback  |
|--------|----------|---------|----------|------------|-------------------|------------------|------------|-----------|
| viewer | widget   | true    | false    | all        | storefront        | session          | none       | read-only |

# 4. Acceptance criteria
- THE SYSTEM SHALL render the widget once its dependency is available.

# 5. Data & privacy classification
No sensitive data. Sensitivity: internal.

# 6. Surface / impact
Touches storefront-ui only.

# 9. Verification plan
Automated checks. Rollback reference: feature-flag disables the widget.

# 10. Risk tier & approvers
Risk tier: GREEN. Required approver role: frontend-peer.
