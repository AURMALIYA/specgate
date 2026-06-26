---
id: NW-ROLES-001
title: Quick merchant role tweak
owner: pat.platform
team: platform
version: 1.0.0
status: draft
risk_tier: GREEN
change_categories:
  - storefront-ui
provides:
  - merchant-role-toggle
consumes: []
depends_on: []
linked_requirements:
  - REQ-4100
success_metric: "Role toggle ships without incident."
---

# 1. Linkage
Implements REQ-4100 (phase: merchant-admin). Success metric: role toggle ships
without incident.

# 2. Intent
Add a toggle in the merchant admin to grant a new merchant role.

# 3. Persona & access matrix

| role          | resource       | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback  |
|---------------|----------------|---------|----------|------------|-------------------|------------------|------------|-----------|
| merchant-admin | merchant-roles | true    | true     | merchant   | service           | admin_session    | none       | read-only |

# 4. Acceptance criteria
- WHEN a merchant admin enables the toggle THE SYSTEM SHALL grant the new merchant role.
- IF the admin lacks the permission scope THEN THE SYSTEM SHALL reject the sign-in.

# 5. Data & privacy classification
Touches merchant role assignments and permission scope. No cardholder data.
Sensitivity: internal.

# 6. Surface / impact
Author declared this as storefront-ui, but it changes merchant role and
permission scope and gates sign-in — an identity/access surface.

# 7. Integration contracts
Calls the IAM service: POST /iam/scopes to attach a scope to a session token.

# 8. Non-functionals
Auditability: role grants are logged.

# 9. Verification plan
Automated checks plus access assertions. Rollback reference: disable the toggle
and revoke the granted role.

# 10. Risk tier & approvers
Risk tier declared GREEN by the author. (The platform is expected to re-derive
this.)

# 11. Out of scope / open questions
Open question: should this require a second approver?
