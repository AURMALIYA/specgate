# Deploying SpecGate

SpecGate has two deployables: the **GitHub Action** (PR gate, no hosting) and the **API + dashboard**
service. This covers the service; the engine stays neutral, so all platform specifics are env/config.

## Run locally

```bash
pnpm install && pnpm build
SPECGATE_CONFIG=config/example-org/config.yaml node apps/api/dist/main.js
# open http://localhost:8787
```

## Run with Docker

```bash
docker build -t specgate .
docker run -p 8787:8787 -v specgate-data:/data \
  -e SPECGATE_CONFIG=config/default.config.yaml \
  -e SPECGATE_AUTH=on -e SPECGATE_IDENTITY=github \
  -e SPECGATE_RATE_LIMIT=120 \
  specgate
```

The audit log + RBAC config persist to the `/data` volume (`SPECGATE_DATA_DIR`).

## Configuration

See [`.env.example`](.env.example) for the full list. Highlights:

| Concern | Env | Notes |
|---|---|---|
| Governance config | `SPECGATE_CONFIG` | Your org's YAML (taxonomy, surfaces, reviewer matrix, constitution) |
| Persistence | `SPECGATE_DATA_DIR` | Audit log + projects to JSON files; unset = in-memory |
| RBAC | `SPECGATE_AUTH=on`, `SPECGATE_IDENTITY=github` | Enforce roles; derive them from repo permissions |
| Rate limit | `SPECGATE_RATE_LIMIT` | requests/min per credential or address |
| Co-author / semantic | `ANTHROPIC_API_KEY` | Optional; offline fallbacks exist |
| Dispatch | `SPECGATE_TARGET`, `SPECGATE_REPO`, `GITHUB_TOKEN`, `REPLIT_*` | "Run" handoff to git/Replit |

## What's durable vs derived

- **Durable** (survives restart, in `SPECGATE_DATA_DIR`): the **override audit log** and **project/role config**.
- **Derived** (rebuilt on boot by re-ingesting specs from git, the source of truth): the spec registry.
- **Follow-up:** in-flight workflow-instance state (approvals mid-loop) is currently in-memory; route it
  through a durable store for full restart-survival of the delivery loop.

## Live integrations (need credentials)

- **GitHub App / OAuth** — login, repo-permission→role mapping, PR comments, and merge. Register an app,
  set `SPECGATE_IDENTITY=github` + `GITHUB_TOKEN`, and make the SpecGate PR check a **required status check**
  in branch protection so a failing gate blocks merge.
- **Replit** — set `SPECGATE_TARGET=replit` + `SPECGATE_REPO` (+ `REPLIT_API_TOKEN`/`REPLIT_API_URL` for the
  live kicker; without them the dispatch still seeds the git branch and returns the Replit import URL).

## Health & observability

- `GET /health` — liveness.
- `GET /metrics` — gate pass/fail, tiers, conflicts, regeneration/defect-escape, overrides (+ safety-invariant overrides), cost.
- `GET /audit` — the immutable override audit log.
