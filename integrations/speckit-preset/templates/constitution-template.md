# Constitution

Governing principles enforced by the spec gate. Auto rules are checked by the
platform on every change; manual rules are surfaced as a reviewer checklist.

## Enforced rules
- **no-regulated-data-in-context** (block, auto) — No regulated or personal data tokens may appear in any prompt-context file; use synthetic data only.
- **rollback-reference-present** (block, auto) — A rollback reference must be present in the Verification plan for any promotable change.
- **generator-verifier-differ** (block, auto) — The actor that generates a change may never certify it.
- **standard-first-justification** (warn, auto) — A written justification must exist when a custom/non-standard surface is used.
- **spec-owner-accountable** (warn, manual) — Every spec must name an accountable owner who is a real, identifiable person or role.

## Notes
Add organization-specific principles here.
