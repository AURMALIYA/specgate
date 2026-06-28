# GitHub setup checklist — bringing the live paths online

SpecGate runs fully offline with no credentials. This checklist turns on the **live GitHub paths**:
the PR gate posting real comments + blocking merges, and the hosted API/dashboard acting on GitHub
(comments, merge, dispatch, role-from-permission).

There are two independent tracks. **Do Track A first** — it's the highest value, needs no app, and
takes ~10 minutes. Track B is for the hosted service.

---

## Track A — PR gate in CI (no GitHub App needed)

Goal: every PR that touches specs is gated against the whole repo, gets a sticky "what to fix /
improve" comment, and **cannot merge** until it passes. Uses the built-in `secrets.GITHUB_TOKEN`.

- [ ] **1. Add the workflow to your repo.** Copy [`.github/workflows/spec-gate.yml`](../.github/workflows/spec-gate.yml)
      (the `pr-gate-repo-mode` job) into the repo whose specs you want governed. It already:
      - checks out with `fetch-depth: 0` (needed to diff changed specs against the base),
      - computes changed `specs/**/*.md`,
      - runs the Action in `mode: repo` with `pr_number` + `github_token`.
- [ ] **2. Grant the job the right token permissions.** In that job:
      ```yaml
      permissions:
        contents: read
        pull-requests: write   # post the sticky review comment
      ```
- [ ] **3. Point `config` at your org config.** Replace `config/default.config.yaml` with your
      org's governance config (copy the default and fill in sensitive surfaces, reviewer matrix,
      constitution).
- [ ] **4. Make the gate a required status check.** Repo **Settings → Branches → Branch protection
      rules** → protect `main` → **Require status checks to pass before merging** → select the
      SpecGate job. *This is what makes a non-conforming PR un-mergeable.*
- [ ] **5. (Optional) Auto-merge after pass.** Enable repo "Allow auto-merge"; authors can set
      auto-merge and the green SpecGate check releases it.

**Verify:** open a PR adding a malformed spec → the check fails and a comment lists the fixes;
fix it → the check goes green and merge unlocks.

> For merging *from CI* (squash/rebase via the Action), the job also needs `contents: write`. Most
> teams instead let humans click Merge once the check is green — no extra permission required.

---

## Track B — Hosted API + dashboard (GitHub App)

Goal: run the dashboard with sign-in, roles mirrored from repo permissions, and the admin
**Run / Merge / Override** actions hitting GitHub. This needs a **GitHub App** (preferred over a PAT:
fine-grained, installable per-org, rotates tokens automatically).

### Create the app
- [ ] **1.** Org (or user) **Settings → Developer settings → GitHub Apps → New GitHub App**.
- [ ] **2. Identity:** name (e.g. `specgate-<org>`), Homepage URL = your dashboard URL.
- [ ] **3. Callback URL** (for sign-in): `https://<your-host>/auth/github/callback`.
      Enable **"Request user authorization (OAuth) during installation"**.
- [ ] **4. Webhook:** uncheck **Active** (SpecGate doesn't need webhooks yet).
- [ ] **5. Repository permissions:**
      | Permission | Level | Why |
      |---|---|---|
      | **Pull requests** | Read & write | post the review comment, merge |
      | **Contents** | Read & write | create handoff branches, merge |
      | **Metadata** | Read (auto) | required baseline |
      | **Administration** *or* repo write | Read | read a member's permission level for role mapping |
- [ ] **6. Account permissions:** **Email/Profile → Read** (so login can resolve the user).
- [ ] **7. Where can it be installed:** "Only this account" (your org).
- [ ] **8. Create**, then **generate a private key** and note the **App ID** + **Client ID/secret**.
- [ ] **9. Install the app** on the org and select the repos to govern.

### Wire it into the service
Provide a token the service can use. Simplest to start: a **fine-grained PAT** (or an installation
token minted from the App) with the permissions above. Then set env (see [`.env.example`](../.env.example)):

- [ ] `SPECGATE_AUTH=on` — enforce roles.
- [ ] `SPECGATE_IDENTITY=github` — derive roles from repo permission
      (admin/maintain→admin, write→contributor, triage→developer, read→viewer).
- [ ] `GITHUB_TOKEN=<token>` — used for PR comments, merge, and the git-handoff branch.
- [ ] `SPECGATE_REPO=owner/name`, `SPECGATE_TARGET=git` (or `replit`) — enable the **Run** dispatch.
- [ ] `SPECGATE_DATA_DIR=/data` — persist the audit log + project/role config.
- [ ] Store the token in your platform's secret manager (not in the image/repo). Rotate on exposure.

### Branch protection (same as Track A)
- [ ] Make the SpecGate check required on protected branches so override/merge from the UX is the
      only sanctioned bypass — and overrides are audited (`GET /audit`).

---

## Honest status of the login UI

The identity *provider* and role mapping are built and the token-based paths (comments, merge,
dispatch, capability checks) work today. The **interactive "Sign in with GitHub" web flow + callback
handler** for the dashboard is the one remaining build item (the Phase 9 follow-up): today a caller
authenticates by presenting a user token to the API (`Authorization: Bearer <token>` /
`x-specgate-token`), and the dashboard has no login screen yet. Track A (CI gate) is unaffected and
fully live. When you want the dashboard login wired end-to-end, that's a small, well-scoped addition
on top of the existing `GitHubIdentityProvider`.

---

## Quick reference — what each credential unlocks

| You provide | Unlocks |
|---|---|
| `secrets.GITHUB_TOKEN` + workflow permissions | Track A: PR comments + required-check blocking |
| GitHub App / PAT token in `GITHUB_TOKEN` | Hosted service: real PR comments, merge, git-handoff dispatch |
| `SPECGATE_IDENTITY=github` + token | Roles mirrored from repo permissions |
| `REPLIT_API_TOKEN` / `REPLIT_API_URL` | Live Replit "Run" (dry-run returns the import URL otherwise) |
| `ANTHROPIC_API_KEY` | Model-backed co-author + advisory semantic layer |
