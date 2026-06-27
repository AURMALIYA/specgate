---
description: Run the SpecGate governance gate on this feature's spec and report findings.
---

Run the SpecGate gate over the current feature and surface every finding **before** generation.

1. Identify the active feature directory under `specs/` (the one whose `spec.md` you are working on).
2. Run: `specgate-speckit gate specs/<feature> --config <org-config>` (org: default).
3. Report each finding as: severity (BLOCK/WARN) · source (schema|policy|tier|conflict) · message.
4. If any **BLOCK** finding remains, do not proceed to `/speckit.implement` — fix the spec first.
5. If the tier was escalated (e.g. hidden-RED), state the re-derived tier and the required approver
   roles. For **RED**, stop: identity / access / data-governance / money-movement changes are
   human-designed only — the platform provides routing, scaffolding, and verification, not design.

The gate is also enforced server-side on the pull request; this command just shifts it left.
