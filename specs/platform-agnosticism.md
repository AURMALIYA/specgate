---
id: SG-NEUTRALITY-001
title: Platform agnosticism of the engine
owner: specgate-maintainers
team: platform
version: 1.0.0
status: active
risk_tier: YELLOW
change_categories:
  - business-logic
provides:
  - engine-neutrality-guarantee
consumes: []
depends_on:
  - SG-STANDARDIZATION-001
linked_requirements:
  - CONSTRAINT-NEUTRALITY
success_metric: "Zero platform/vendor/product identifiers in engine packages, enforced by a failing-on-violation test."
---

# 1. Linkage
Implements the hard platform-agnosticism constraint. Deliverable: the denylist
test. Success metric: zero platform identifiers in engine packages.

# 2. Intent
Guarantee that all platform, vendor, and product knowledge lives in config, never
in engine code.

# 3. Persona & access matrix

| role          | resource         | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases | fallback    |
|---------------|------------------|---------|----------|------------|-------------------|------------------|------------|-------------|
| engine-author | engine-packages  | true    | true     | all        | application       | author_identity  | none       | read-only   |
| org-admin     | org-config       | true    | true     | all        | application       | admin_identity   | none       | read-only   |

# 4. Acceptance criteria
- THE SYSTEM SHALL contain no platform-, vendor-, or product-specific identifiers in engine packages.
- WHEN a denylisted identifier appears in an engine package THE SYSTEM SHALL fail the neutrality test.
- THE SYSTEM SHALL load all platform-specific knowledge from configuration files.

# 5. Data & privacy classification
Operates on source code and configuration only. No customer or sensitive
information is processed. Sensitivity: internal.

# 6. Surface / impact
Touches the business-logic change category (a test and a constraint). No
identity, data-governance, or money-movement surfaces.

# 7. Integration contracts
None external. The denylist is sourced from a repo file consumed by the test.

# 8. Non-functionals
Maintainability: the denylist is data, not code, and can be extended without
changing the test.

# 9. Verification plan
Automated check: a test greps engine package sources for the denylist and fails
on any hit. Rollback reference: the test is additive; disabling it reverts to no
neutrality enforcement.

# 10. Risk tier & approvers
Risk tier: YELLOW. Required approver roles: peer-reviewer, domain-owner.

# 11. Out of scope / open questions
Out of scope: neutrality of adapter packages, which are vendor-specific by design.
