# Northwind Commerce Cloud — Constitution

Governing principles for spec-driven development. The SpecGate gate enforces the
machine-checkable rules; the rest guide author and reviewer judgment.

## Principles
- Standard-first: prefer platform-standard components over custom ones.
- Identity, payments, and cardholder data are human-designed only (RED).
- Every promotable change ships with a rollback path.
- Generated changes are certified by someone other than their generator.
- Synthetic data only in any prompt context — never real customer data.
