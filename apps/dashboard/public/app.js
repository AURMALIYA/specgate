// SpecGate dashboard — surfaces the engine: gate, tier, conflicts, verification,
// the delivery loop, provenance, overrides, audit, and projects/roles.

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}
async function api(path, method = "POST", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}
const pct = (n) => `${Math.round((n || 0) * 100)}%`;
const nowISO = () => new Date().toISOString();
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ---------- navigation ----------
function showView(name) {
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== `view-${name}`;
  for (const b of document.querySelectorAll(".nav-btn")) b.classList.toggle("active", b.dataset.view === name);
  if (name === "audit") loadAudit();
  if (name === "projects") loadProjects();
}

// ---------- overview ----------
async function refresh() {
  try {
    const [metrics, conflicts, registry, instances] = await Promise.all([
      getJSON("/metrics"), getJSON("/conflicts"), getJSON("/registry"), getJSON("/instances"),
    ]);
    renderMetrics(metrics);
    renderTiers(metrics.tierDistribution);
    renderConflicts(conflicts);
    renderRegistry(registry, instances);
  } catch (err) {
    document.getElementById("metric-cards").innerHTML = `<p class="empty">Could not load: ${esc(err.message)}</p>`;
  }
}

function renderMetrics(m) {
  const cards = document.getElementById("metric-cards");
  cards.innerHTML = "";
  const items = [
    ["Specs", m.total], ["Gate pass", `${m.gate.pass}/${m.gate.pass + m.gate.fail}`],
    ["Generations", m.generations], ["Regeneration rate", pct(m.regenerationRate)],
    ["Defect-escape", pct(m.defectEscapeRate)], ["Custom vs standard", pct(m.customVsStandardRatio)],
    ["Cost / generation", (m.costPerGeneration ?? 0).toFixed(2)],
    ["Overrides", m.overrides], ["Safety overrides", m.safetyInvariantOverrides],
  ];
  for (const [label, value] of items)
    cards.append(el("div", { class: "card" }, el("div", { class: "value" }, String(value)), el("div", { class: "label" }, label)));
}
function renderTiers(dist) {
  const wrap = document.getElementById("tier-bars"); wrap.innerHTML = "";
  const max = Math.max(1, ...Object.values(dist || {}));
  for (const tier of ["GREEN", "YELLOW", "RED"]) {
    const count = (dist || {})[tier] || 0;
    wrap.append(el("div", { class: "bar-row" },
      el("span", { class: "name" }, tier),
      el("div", { class: `bar ${tier}`, style: `width:${(count / max) * 320}px` }),
      el("span", {}, String(count))));
  }
}
function renderConflicts(list) {
  const wrap = document.getElementById("conflict-list"); wrap.innerHTML = "";
  if (!list.length) return wrap.append(el("p", { class: "empty" }, "No open conflicts."));
  for (const c of list)
    wrap.append(el("div", { class: `conflict ${c.severity === "warn" ? "warn" : ""}` },
      el("div", { class: "type" }, `${c.severity.toUpperCase()} · ${c.type}${c.subject ? ` · ${c.subject}` : ""}`),
      el("div", { class: "ids" }, c.specIds.join(", ")),
      el("div", {}, c.explanation)));
}
function renderRegistry(specs, instances) {
  const byId = new Map(instances.map((i) => [i.specId, i]));
  const tbody = document.querySelector("#registry-table tbody"); tbody.innerHTML = "";
  if (!specs.length) return tbody.append(el("tr", {}, el("td", { colspan: "5", class: "empty" }, "Registry is empty — ingest a spec above.")));
  for (const s of specs) {
    const inst = byId.get(s.id);
    const declared = s.frontmatter.risk_tier;
    const enforced = inst?.finalTier ?? declared;
    const escalated = inst && inst.finalTier !== declared;
    const row = el("tr", { "data-spec": s.id },
      el("td", {}, s.id),
      el("td", {}, s.frontmatter.title),
      el("td", {}, el("span", { class: `pill ${declared}` }, declared)),
      el("td", {}, el("span", { class: `pill ${enforced}` }, enforced), escalated ? el("span", { class: "badge esc", style: "margin-left:6px" }, "esc") : null),
      el("td", {}, inst?.state ?? "—"));
    tbody.append(row);
  }
}

// ---------- spec detail drawer ----------
const ACTIONS_BY_STATE = {
  DRAFT: [{ label: "Submit", ev: () => ({ type: "submit", at: nowISO() }) }],
  IN_REVIEW: [{ label: "Approve…", approve: true }, { label: "Request changes", ev: () => ({ type: "requestChanges", at: nowISO() }) }],
  APPROVED: [{ label: "Run ▶", run: true }, { label: "Start generation", ev: () => ({ type: "startGeneration", generatorId: "manual", at: nowISO() }) }],
  GENERATING: [{ label: "Complete generation", ev: () => ({ type: "completeGeneration", at: nowISO() }) }],
  VERIFYING: [{ label: "Sign off…", signoff: true }],
  READY_FOR_UAT: [{ label: "Complete UAT", ev: () => ({ type: "completeUAT", at: nowISO() }) }],
  DONE: [],
  BLOCKED: [{ label: "Unblock", ev: () => ({ type: "unblock", at: nowISO() }) }],
};
const LOOP = ["DRAFT", "IN_REVIEW", "APPROVED", "GENERATING", "VERIFYING", "READY_FOR_UAT", "DONE"];

async function openDrawer(specId) {
  document.getElementById("drawer").hidden = false;
  document.getElementById("drawer-title").textContent = specId;
  const body = document.getElementById("drawer-body");
  body.innerHTML = "<p class='muted'>Loading…</p>";
  try {
    renderDetail(await getJSON(`/instances/${encodeURIComponent(specId)}/detail`));
  } catch (err) {
    body.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}
function closeDrawer() { document.getElementById("drawer").hidden = true; }

function panel(title, ...children) {
  return el("div", { class: "dpanel" }, el("h3", {}, title), ...children);
}
function kv(pairs) {
  const g = el("div", { class: "kv" });
  for (const [k, v] of pairs) { g.append(el("div", { class: "k" }, k)); g.append(el("div", {}, v)); }
  return g;
}

function renderDetail(d) {
  const body = document.getElementById("drawer-body");
  document.getElementById("drawer-title").textContent = `${d.id} — ${d.frontmatter.title}`;
  body.innerHTML = "";

  // Tier
  const t = d.tier;
  const tierPanel = panel("Risk tier",
    kv([
      ["declared → enforced", el("span", { html: `<span class="pill ${t.declaredTier}">${t.declaredTier}</span> → <span class="pill ${t.finalTier}">${t.finalTier}</span> ${t.escalated ? '<span class="badge esc">escalated</span>' : ""}` })],
      ["category floor", t.categoryFloor], ["surface", t.surfaceTier],
      ["hidden-RED", t.hiddenRed ? "⚑ yes" : "no"],
      ["required approvers", `${(t.requiredApproverRoles || []).join(", ") || "(none)"} (min ${t.minApprovals})`],
    ]));
  if (t.evidence?.length) tierPanel.append(el("div", { class: "muted", style: "margin-top:6px;font-size:12px" }, "Evidence:"),
    ...t.evidence.map((e) => el("div", { class: "finding" }, `[${e.reason}] ${e.detail}`)));
  body.append(tierPanel);

  // Workflow + actions
  const wf = panel("Delivery loop");
  const strip = el("div", { class: "loop" });
  const curIdx = LOOP.indexOf(d.instance.state);
  LOOP.forEach((s, i) => {
    strip.append(el("span", { class: `step ${d.instance.state === s ? "current" : i < curIdx ? "done" : ""}` }, s));
    if (i < LOOP.length - 1) strip.append(el("span", { class: "arrow" }, "›"));
  });
  if (d.instance.state === "BLOCKED") strip.append(el("span", { class: "step current" }, "BLOCKED"));
  wf.append(strip);
  wf.append(kv([
    ["state", d.instance.state],
    ["approvals", (d.instance.approvals || []).map((a) => `${a.identity}(${a.role})`).join(", ") || "(none)"],
    ["generator / verifier", `${d.instance.generatorId ?? "—"} / ${d.instance.verifierId ?? "—"}`],
    ["eligible to run", d.eligibility.eligible ? "yes" : `no — ${d.eligibility.reasons.join("; ")}`],
    ["can merge", d.canMerge.allowed ? "yes" : `no — ${d.canMerge.reasons.join("; ")}`],
  ]));
  const actions = el("div", { class: "actions" });
  for (const a of ACTIONS_BY_STATE[d.instance.state] || []) actions.append(el("button", { class: "act", "data-spec": d.id, "data-action": a.label }, a.label));
  actions.append(el("button", { class: "act secondary", "data-spec": d.id, "data-action": "Verify" }, "Verify"));
  actions.append(el("button", { class: "act", "data-spec": d.id, "data-action": "Merge" }, "Merge"));
  actions.append(el("button", { class: "act override-btn", "data-spec": d.id, "data-action": "Override" }, "Override…"));
  actions.append(el("button", { class: "act override-btn", "data-spec": d.id, "data-action": "Block" }, "Block"));
  wf.append(actions);
  body.append(wf);

  // Gate findings
  const gate = panel(`Gate — ${d.gate.ok ? "✅ pass" : `❌ ${d.gate.blockCount} blocking`}`);
  if (!d.gate.findings.length) gate.append(el("p", { class: "muted" }, "No findings."));
  for (const f of d.gate.findings) gate.append(el("div", { class: `finding ${f.severity}` }, `${f.severity.toUpperCase()} · ${f.source}:${f.code}${f.location ? ` (${f.location})` : ""} — ${f.message}`));
  for (const m of d.gate.manualChecklist || []) gate.append(el("div", { class: "finding" }, `☐ ${m.ruleId}: ${m.description}`));
  body.append(gate);

  // Verification harness
  const v = panel(`Verification — ${d.verification.passed ? "✅ passed" : "❌ failed"}`);
  for (const r of d.verification.results) {
    const todos = r.checks.filter((c) => c.status === "todo").length;
    v.append(el("div", { class: "finding" }, el("span", { class: `chk ${r.status}` }, r.status),
      `${r.runnerId}${r.artifacts?.length ? ` · ${r.artifacts.length} artifact(s)` : ""}${todos ? ` · ${todos} todo` : ""}`,
      ...r.checks.filter((c) => c.status === "fail").map((c) => el("div", { class: "finding block", style: "padding-left:18px" }, `↳ ${c.detail}`))));
  }
  body.append(v);

  // EARS criteria
  if (d.criteria?.length) {
    const c = panel("Acceptance criteria (EARS)");
    for (const cr of d.criteria) c.append(el("div", { class: `finding ${cr.valid ? "" : "block"}` },
      el("span", { class: `chk ${cr.valid ? "pass" : "fail"}` }, cr.valid ? cr.kind : "invalid"), `${esc(cr.raw)}${cr.problems?.length ? ` — ${cr.problems.join(" ")}` : ""}`));
    body.append(c);
  }

  // Access matrix
  if (d.accessMatrix?.length) {
    const tbl = el("table", { class: "small-table" },
      el("thead", {}, el("tr", { html: "<th>role</th><th>resource</th><th>vis</th><th>edit</th><th>scope</th><th>layer</th><th>deny_cases</th>" })),
      el("tbody", {}, ...d.accessMatrix.map((r) => el("tr", { html: `<td>${esc(r.role)}</td><td>${esc(r.resource)}</td><td>${r.visible}</td><td>${r.editable}</td><td>${esc(r.data_scope)}</td><td>${esc(r.enforcement_layer)}</td><td>${esc((r.deny_cases || []).join(", "))}</td>` }))));
    body.append(panel("Persona & access matrix", tbl));
  }

  // Conflicts
  if (d.conflicts?.length) {
    const c = panel("Conflicts involving this spec");
    for (const cf of d.conflicts) c.append(el("div", { class: `finding ${cf.severity}` }, `${cf.type} [${cf.specIds.join(", ")}] — ${cf.explanation}`));
    body.append(c);
  }

  // Provenance
  if (d.provenance?.length) {
    const p = panel("Generation provenance");
    for (const r of d.provenance) p.append(el("div", { class: "finding" }, `${r.timestamp} · ${r.dispatchTarget ?? "—"} ${r.dispatchHandle ?? ""} · model ${r.pinnedModel} · hash ${r.specContentHash.slice(0, 12)}`));
    body.append(p);
  }

  // Overrides
  if (d.overrides?.length) {
    const o = panel("Override audit");
    for (const ov of d.overrides) o.append(el("div", { class: "finding" }, `${ov.at} · ${ov.actor}${ov.safetyInvariant ? ' ⚑ safety-invariant' : ""} · "${esc(ov.justification)}" · covers ${ov.coveredCodes.join(", ")}`));
    body.append(o);
  }
}

async function doSpecAction(specId, label) {
  const reload = () => openDrawer(specId);
  try {
    if (label === "Run ▶" || label === "Run") {
      const elig = await getJSON(`/instances/${encodeURIComponent(specId)}/run-eligibility`);
      if (!elig.eligible) return alert(`Not eligible:\n${elig.reasons.join("\n")}`);
      await api(`/instances/${encodeURIComponent(specId)}/run`); return reload();
    }
    if (label === "Verify") { await api(`/instances/${encodeURIComponent(specId)}/verify`); return reload(); }
    if (label === "Merge") {
      const can = await getJSON(`/instances/${encodeURIComponent(specId)}/can-merge`);
      if (!can.allowed) return alert(`Cannot merge:\n${can.reasons.join("\n")}`);
      const r = await api(`/instances/${encodeURIComponent(specId)}/merge`);
      alert(r.json.merged ? "Merged" + (r.json.result?.dryRun ? " (dry-run)" : "") : "Merge failed"); return reload();
    }
    if (label === "Override…") {
      const j = prompt("Override the gate (audited). Justification:");
      if (!j) return;
      const r = await api(`/instances/${encodeURIComponent(specId)}/override`, "POST", { justification: j });
      if (!r.ok) alert(r.json.error || "override failed");
      return reload();
    }
    if (label === "Approve…") {
      const role = prompt("Approver role (e.g. domain-owner):"); if (!role) return;
      const identity = prompt("Approver identity:"); if (!identity) return;
      await api(`/instances/${encodeURIComponent(specId)}/events`, "POST", { type: "approve", role, identity, at: nowISO() });
      return reload();
    }
    if (label === "Sign off…") {
      const verifierId = prompt("Verifier identity (must differ from generator):"); if (!verifierId) return;
      const r = await api(`/instances/${encodeURIComponent(specId)}/events`, "POST", { type: "signOffVerification", verifierId, passed: true, at: nowISO() });
      if (!r.ok || (r.json && r.json.ok === false)) alert(r.json.error || "sign-off rejected (generator≠verifier?)");
      return reload();
    }
    if (label === "Block") {
      const reason = prompt("Block reason:") || "blocked"; await api(`/instances/${encodeURIComponent(specId)}/events`, "POST", { type: "block", reason, at: nowISO() }); return reload();
    }
    // generic event actions from ACTIONS_BY_STATE
    const inst = await getJSON(`/instances/${encodeURIComponent(specId)}`);
    const def = (ACTIONS_BY_STATE[inst.state] || []).find((a) => a.label === label);
    if (def?.ev) { await api(`/instances/${encodeURIComponent(specId)}/events`, "POST", def.ev()); return reload(); }
  } catch (err) { alert(err.message); }
}

// ---------- co-author ----------
async function coauthor() {
  const input = document.getElementById("coauthor-input").value;
  const status = document.getElementById("coauthor-status");
  const out = document.getElementById("coauthor-output");
  if (!input.trim()) { status.textContent = "Paste a spec first."; return; }
  status.textContent = "Working…"; out.hidden = true;
  const r = await api("/coauthor", "POST", { raw: input });
  if (!r.ok) { status.textContent = r.json.error || `Error ${r.status}`; return; }
  status.innerHTML = `before <b>${r.json.before.ok ? "PASS" : "FAIL"}</b> → after <b>${r.json.passed ? "PASS" : "FAIL"}</b> in ${r.json.rounds} round(s)`;
  out.hidden = false; out.textContent = r.json.finalSpec;
  if (r.json.passed) document.getElementById("coauthor-input").value = r.json.finalSpec;
}
async function ingestCurrent() {
  const raw = document.getElementById("coauthor-input").value;
  const status = document.getElementById("coauthor-status");
  if (!raw.trim()) { status.textContent = "Paste a spec first."; return; }
  const r = await api("/ingest", "POST", { raw, path: "dashboard.md" });
  status.textContent = r.ok ? `ingested ${r.json.specId} (tier ${r.json.tier.finalTier})` : (r.json.error || "ingest failed");
  refresh();
}

// ---------- audit ----------
async function loadAudit() {
  const wrap = document.getElementById("audit-list"); wrap.innerHTML = "Loading…";
  const events = await getJSON("/audit");
  wrap.innerHTML = "";
  if (!events.length) return wrap.append(el("p", { class: "empty" }, "No overrides recorded."));
  const tbl = el("table", { class: "small-table" },
    el("thead", {}, el("tr", { html: "<th>when</th><th>spec</th><th>actor</th><th>covers</th><th>justification</th><th></th>" })),
    el("tbody", {}, ...events.map((e) => el("tr", { html: `<td>${esc(e.at)}</td><td>${esc(e.specId)}</td><td>${esc(e.actor)}</td><td>${esc(e.coveredCodes.join(", "))}</td><td>${esc(e.justification)}</td><td>${e.safetyInvariant ? '<span class="badge esc">safety</span>' : ""}</td>` }))));
  wrap.append(tbl);
}

// ---------- projects ----------
async function loadProjects() {
  const wrap = document.getElementById("project-list"); wrap.innerHTML = "Loading…";
  try {
    const projects = await getJSON("/projects");
    wrap.innerHTML = "";
    if (!projects.length) return wrap.append(el("p", { class: "empty" }, "No projects yet."));
    for (const p of projects) {
      const card = el("div", { class: "dpanel" }, el("h3", {}, `${p.name} (${p.id})${p.repo ? ` · ${p.repo}` : ""}`));
      const tbl = el("table", { class: "small-table" },
        el("thead", {}, el("tr", { html: "<th>member</th><th>role</th>" })),
        el("tbody", {}, ...(p.members || []).map((m) => el("tr", { html: `<td>${esc(m.userId)}</td><td>${esc(m.role)}</td>` }))));
      card.append(tbl);
      card.append(el("button", { class: "secondary add-member", "data-proj": p.id, style: "margin-top:8px" }, "Add member"));
      wrap.append(card);
    }
  } catch (err) { wrap.innerHTML = `<p class="empty">${esc(err.message)}</p>`; }
}

// ---------- wiring ----------
document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("coauthor-run").addEventListener("click", coauthor);
document.getElementById("coauthor-ingest").addEventListener("click", ingestCurrent);
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
document.querySelector(".drawer-bg").addEventListener("click", closeDrawer);
for (const b of document.querySelectorAll(".nav-btn")) b.addEventListener("click", () => showView(b.dataset.view));

document.getElementById("proj-create").addEventListener("click", async () => {
  const id = document.getElementById("proj-id").value.trim();
  const name = document.getElementById("proj-name").value.trim() || id;
  const repo = document.getElementById("proj-repo").value.trim() || undefined;
  const status = document.getElementById("proj-status");
  if (!id) { status.textContent = "id required"; return; }
  const r = await api("/projects", "POST", { id, name, repo });
  status.textContent = r.ok ? "created" : (r.json.error || "failed");
  loadProjects();
});

document.addEventListener("click", async (e) => {
  const row = e.target.closest?.("#registry-table tbody tr");
  if (row && row.dataset.spec) return openDrawer(row.dataset.spec);
  const act = e.target.closest?.("button.act");
  if (act) return doSpecAction(act.dataset.spec, act.dataset.action);
  const am = e.target.closest?.(".add-member");
  if (am) {
    const userId = prompt("GitHub username / user id:"); if (!userId) return;
    const role = prompt("Role (admin|contributor|developer|viewer):", "developer"); if (!role) return;
    const r = await api(`/projects/${encodeURIComponent(am.dataset.proj)}/members`, "POST", { userId, role });
    if (!r.ok) alert(r.json.error || "failed");
    loadProjects();
  }
});

refresh();
