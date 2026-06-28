// SpecGate dashboard — vanilla JS, talks to the @specgate/api JSON endpoints.

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function pct(n) {
  return `${Math.round((n || 0) * 100)}%`;
}

function renderMetrics(m) {
  const cards = document.getElementById("metric-cards");
  cards.innerHTML = "";
  const items = [
    ["Specs", m.total],
    ["Gate pass", `${m.gate.pass}/${m.gate.pass + m.gate.fail}`],
    ["Generations", m.generations],
    ["Regeneration rate", pct(m.regenerationRate)],
    ["Defect-escape rate", pct(m.defectEscapeRate)],
    ["Custom vs standard", pct(m.customVsStandardRatio)],
    ["Cost / generation", m.costPerGeneration.toFixed(2)],
    ["Overrides", m.overrides],
    ["Safety overrides", m.safetyInvariantOverrides],
  ];
  for (const [label, value] of items) {
    cards.append(el("div", { class: "card" }, el("div", { class: "value" }, String(value)), el("div", { class: "label" }, label)));
  }
}

function renderTiers(dist) {
  const wrap = document.getElementById("tier-bars");
  wrap.innerHTML = "";
  const max = Math.max(1, ...Object.values(dist));
  for (const tier of ["GREEN", "YELLOW", "RED"]) {
    const count = dist[tier] || 0;
    wrap.append(
      el("div", { class: "bar-row" },
        el("span", { class: "name" }, tier),
        el("div", { class: `bar ${tier}`, style: `width:${(count / max) * 320}px` }),
        el("span", {}, String(count)),
      ),
    );
  }
}

function renderConflicts(list) {
  const wrap = document.getElementById("conflict-list");
  wrap.innerHTML = "";
  if (!list.length) {
    wrap.append(el("p", { class: "empty" }, "No open conflicts."));
    return;
  }
  for (const c of list) {
    wrap.append(
      el("div", { class: `conflict ${c.severity === "warn" ? "warn" : ""}` },
        el("div", { class: "type" }, `${c.severity.toUpperCase()} · ${c.type}${c.subject ? ` · ${c.subject}` : ""}`),
        el("div", { class: "ids" }, c.specIds.join(", ")),
        el("div", {}, c.explanation),
      ),
    );
  }
}

function renderRegistry(specs) {
  const tbody = document.querySelector("#registry-table tbody");
  tbody.innerHTML = "";
  if (!specs.length) {
    tbody.append(el("tr", {}, el("td", { colspan: "5", class: "empty" }, "Registry is empty.")));
    return;
  }
  for (const s of specs) {
    const tier = s.frontmatter.risk_tier;
    const status = el("span", { class: "muted", id: `run-${s.id}` });
    const actions = el("td", {},
      el("button", { class: "run-btn", "data-spec": s.id }, "Run"),
      el("button", { class: "merge-btn", "data-spec": s.id }, "Merge"),
      el("button", { class: "override-btn", "data-spec": s.id }, "Override"),
      status,
    );
    tbody.append(
      el("tr", {},
        el("td", {}, s.id),
        el("td", {}, s.frontmatter.title),
        el("td", {}, el("span", { class: `pill ${tier}` }, tier)),
        el("td", {}, (s.provides || []).join(", ") || "—"),
        el("td", {}, (s.frontmatter.change_categories || []).join(", ")),
        actions,
      ),
    );
  }
}

async function mergeSpec(specId) {
  const status = document.getElementById(`run-${specId}`);
  status.textContent = " checking…";
  try {
    const can = await getJSON(`/instances/${encodeURIComponent(specId)}/can-merge`);
    if (!can.allowed) { status.textContent = ` cannot merge: ${can.reasons.join("; ")}`; return; }
    const res = await fetch(`/instances/${encodeURIComponent(specId)}/merge`, { method: "POST" });
    const body = await res.json();
    status.textContent = res.ok && body.merged ? ` ✓ merged${body.result?.dryRun ? " (dry-run)" : ""}` : ` ${body.error || body.reasons?.join("; ") || "merge failed"}`;
  } catch (err) { status.textContent = ` ${err.message}`; }
}

async function overrideSpec(specId) {
  const justification = window.prompt(`Override the gate for ${specId}? This is audited. Enter a justification:`);
  if (!justification) return;
  const status = document.getElementById(`run-${specId}`);
  try {
    const res = await fetch(`/instances/${encodeURIComponent(specId)}/override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ justification }),
    });
    const body = await res.json();
    if (!res.ok) { status.textContent = ` ${body.error || res.status}`; return; }
    status.innerHTML = ` ⚑ override recorded (${body.coveredCodes.length} finding(s))${body.safetyInvariant ? ' <b style="color:var(--red)">safety-invariant!</b>' : ""}`;
    refresh();
  } catch (err) { status.textContent = ` ${err.message}`; }
}

async function runSpec(specId) {
  const status = document.getElementById(`run-${specId}`);
  status.textContent = " checking…";
  try {
    const elig = await getJSON(`/instances/${encodeURIComponent(specId)}/run-eligibility`);
    if (!elig.eligible) {
      status.textContent = ` not eligible: ${elig.reasons.join("; ")}`;
      return;
    }
    const res = await fetch(`/instances/${encodeURIComponent(specId)}/run`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) { status.textContent = ` ${body.error || res.status}`; return; }
    const d = body.dispatch;
    status.innerHTML = ` ▶ dispatched to <b>${d.target}</b> (${d.handle})${d.url ? ` · <a href="${d.url}" target="_blank">open</a>` : ""}`;
  } catch (err) {
    status.textContent = ` ${err.message}`;
  }
}

async function refresh() {
  try {
    const [metrics, conflicts, registry] = await Promise.all([
      getJSON("/metrics"),
      getJSON("/conflicts"),
      getJSON("/registry"),
    ]);
    renderMetrics(metrics);
    renderTiers(metrics.tierDistribution);
    renderConflicts(conflicts);
    renderRegistry(registry);
  } catch (err) {
    document.getElementById("metric-cards").innerHTML = `<p class="empty">Could not load: ${err.message}</p>`;
  }
}

async function coauthor() {
  const input = document.getElementById("coauthor-input").value;
  const status = document.getElementById("coauthor-status");
  const out = document.getElementById("coauthor-output");
  if (!input.trim()) { status.textContent = "Paste a spec first."; return; }
  status.textContent = "Working…";
  out.hidden = true;
  try {
    const res = await fetch("/coauthor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: input }),
    });
    const body = await res.json();
    if (!res.ok) {
      status.textContent = body.error || `Error ${res.status}`;
      return;
    }
    const before = body.before.ok ? "PASS" : `FAIL (${body.before.blockCount} blocking)`;
    const after = body.passed ? "PASS" : `FAIL (${body.after.blockCount} blocking)`;
    status.innerHTML = `before: <b>${before}</b> → after: <b>${body.passed ? "PASS" : "FAIL"}</b> in ${body.rounds} round(s)`;
    out.hidden = false;
    out.textContent = body.passed
      ? body.finalSpec
      : `Could not reach a passing spec in ${body.rounds} round(s). Best draft:\n\n${body.finalSpec}`;
    if (body.passed) document.getElementById("coauthor-input").value = body.finalSpec;
  } catch (err) {
    status.textContent = `Request failed: ${err.message}`;
  }
}

document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("coauthor-run").addEventListener("click", coauthor);
document.addEventListener("click", (e) => {
  const run = e.target.closest?.(".run-btn");
  if (run) return runSpec(run.getAttribute("data-spec"));
  const merge = e.target.closest?.(".merge-btn");
  if (merge) return mergeSpec(merge.getAttribute("data-spec"));
  const ov = e.target.closest?.(".override-btn");
  if (ov) return overrideSpec(ov.getAttribute("data-spec"));
});
refresh();
