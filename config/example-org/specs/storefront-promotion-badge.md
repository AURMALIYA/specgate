---
id: NW-STOREFRONT-001
title: Storefront promotion badge
owner: jane.merchant-lead
team: storefront
version: 1.0.0
status: draft
risk_tier: GREEN
change_categories:
  - storefront-ui
provides:
  - product-badge-display
consumes:
  - catalog-read
depends_on: []
linked_requirements:
  - REQ-1024
success_metric: "Promotion badge visible on >=99% of eligible product cards within one render."
---

# 1. Linkage
Implements requirement REQ-1024 (phase: storefront-q3, deliverable: promo-visibility).
Related work: NW-STOREFRONT base catalog rendering. Success metric: promotion badge
visible on at least 99% of eligible product cards within one render.

# 2. Intent
Show shoppers a clear promotion badge on product cards so active promotions are
discoverable without opening the product page.

# 3. Persona & access matrix

| role     | resource        | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases            | fallback        |
|----------|-----------------|---------|----------|------------|-------------------|------------------|-----------------------|-----------------|
| shopper  | promotion-badge | true    | false    | all        | storefront        | promotion_status | expired promotions    | hide badge      |
| merchant | promotion-badge | true    | false    | merchant   | storefront        | promotion_status | other merchant promos | hide badge      |

# 4. Acceptance criteria
- WHEN a product has an active promotion THE SYSTEM SHALL display a promotion badge on the product card.
- THE SYSTEM SHALL render the promotion badge using the standard storefront badge element.
- WHERE a storefront locale is configured THE SYSTEM SHALL localize the promotion badge label.
- IF a promotion has expired THEN THE SYSTEM SHALL hide the promotion badge.

# 5. Data & privacy classification
Reads only public promotion metadata (promotion_status, label). No personal,
cardholder, or regulated data is touched. Sensitivity: public.

# 6. Surface / impact
Touches the storefront-ui change category only. No identity, payments, or
regulated-data surfaces are involved.

# 7. Integration contracts
Consumes the catalog read API `GET /catalog/products` (read-only). On timeout or
error the badge is omitted and the product card renders normally.

# 8. Non-functionals
Localization: badge label honors storefront locale. Accessibility: badge exposes
an accessible label. Performance: no additional network round-trip on the card.

# 9. Verification plan
Automated checks only (GREEN). EARS criteria compiled to UI assertion stubs.
Persona/access assertions derived from the access matrix. Rollback reference:
feature-flag `promo_badge` disables the badge and reverts to prior rendering.

# 10. Risk tier & approvers
Risk tier: GREEN. Required approver role: frontend-peer.

# 11. Out of scope / open questions
Out of scope: promotion eligibility logic (owned by cart-checkout-logic specs).
