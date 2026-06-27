# SpecGate preset for Spec Kit

Installs the SpecGate authoring template so specs are written, locally and in your
agent, in the exact shape the SpecGate server-side gate enforces: mandatory gate
sections, EARS acceptance criteria, and a structured persona/access matrix.

## Install

```bash
specify preset add --dev ./specgate-preset
```

Then `/speckit.specify` produces a SpecGate-conformant `spec.md`. Push it; the
SpecGate gate (CLI / GitHub Action) validates and tiers it server-side and blocks
on any blocking finding — the same template, now non-bypassable.

This preset was generated from the **default** config; regenerate it whenever
the org config changes so the local template never drifts from the enforced gate:

```bash
specgate-speckit emit-preset ./specgate-preset --config <org-config.yaml>
```
