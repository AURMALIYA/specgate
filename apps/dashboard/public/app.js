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
    tbody.append(
      el("tr", {},
        el("td", {}, s.id),
        el("td", {}, s.frontmatter.title),
        el("td", {}, el("span", { class: `pill ${tier}` }, tier)),
        el("td", {}, (s.provides || []).join(", ") || "—"),
        el("td", {}, (s.frontmatter.change_categories || []).join(", ")),
      ),
    );
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

document.getElementById("refresh").addEventListener("click", refresh);
refresh();
