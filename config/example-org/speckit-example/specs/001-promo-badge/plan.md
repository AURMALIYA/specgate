# Implementation plan — Storefront promotion badge

Spec Kit `/speckit.plan` output (technical plan). Consumed by SpecGate as
prompt-context only.

- Render `<PromotionBadge>` on the standard product card component.
- Source `promotion_status` from the catalog read API; cache per render.
- Feature-flag `promo_badge` gates rollout and rollback.
- No new persistence; no identity or payment surfaces touched.
