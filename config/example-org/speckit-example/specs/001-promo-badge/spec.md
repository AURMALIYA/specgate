---
id: NW-SK-PROMO-001
title: Storefront promotion badge (Spec Kit feature)
owner: jane.merchant-lead
team: storefront
version: 1.0.0
status: draft
risk_tier: GREEN
change_categories:
  - storefront-ui
provides:
  - sk-promotion-badge-display
consumes:
  - catalog-read
depends_on: []
linked_requirements:
  - REQ-1024
success_metric: "Promotion badge visible on >=99% of eligible product cards within one render."
---

# 1. Linkage
Implements requirement REQ-1024 (phase: storefront-q3, deliverable: promo-visibility).
Success metric: promotion badge visible on at least 99% of eligible product cards.

# 2. Intent
Show shoppers a clear promotion badge on product cards so active promotions are
discoverable without opening the product page.

# 3. Persona & access matrix

| role     | resource        | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases         | fallback   |
|----------|-----------------|---------|----------|------------|-------------------|------------------|--------------------|------------|
| shopper  | promotion-badge | true    | false    | all        | storefront        | promotion_status | expired promotions | hide badge |

# 4. Acceptance criteria
- WHEN a product has an active promotion THE SYSTEM SHALL display a promotion badge on the product card.
- THE SYSTEM SHALL render the promotion badge using the standard storefront badge element.
- IF a promotion has expired THEN THE SYSTEM SHALL hide the promotion badge.

# 5. Data & privacy classification
Reads only public promotion metadata. No personal, cardholder, or regulated
information is touched. Sensitivity: public.

# 6. Surface / impact
Touches the storefront-ui change category only. No identity, payments, or
regulated-data surfaces are involved.

# 7. Integration contracts
Consumes the catalog read API (read-only). On timeout the badge is omitted.

# 8. Non-functionals
Localization: badge label honors storefront locale. Accessibility: badge exposes
an accessible label.

# 9. Verification plan
Automated checks only (GREEN). EARS criteria compiled to UI assertion stubs.
Rollback reference: feature-flag `promo_badge` reverts to prior rendering.

# 10. Risk tier & approvers
Risk tier: GREEN. Required approver role: frontend-peer.

# 11. Out of scope / open questions
Out of scope: promotion eligibility logic.
