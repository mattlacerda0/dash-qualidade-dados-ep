import {
  EP_UNFILLED_STATUS_OPTIONS,
} from "/lib/catalog.mjs";
import {
  buildCompareFillRows,
  intersectionCoreCatalog,
  intersectionQvCatalog,
  splitCompareCatalog,
  summarizeCompareFills,
} from "/lib/compare-catalog.mjs";
import {
  CORE_EP_UNFILLED_STATUS_OPTIONS,
} from "/lib/core-catalog.mjs";
import {
  coreEngineerSelectOptions,
  defaultCoreGlobalFilters,
  defaultCoreTableLocalFilters,
  filterCoreEpUnfilledClients,
  summarizeCoreFieldTable,
} from "/lib/core-filters.mjs";
import {
  defaultGlobalFilters,
  defaultTableLocalFilters,
  filterEpUnfilledClients,
  summarizeFieldTable,
} from "/lib/filters.mjs";
import { programSelectOptions, normalizeProgramFilter } from "/lib/program.mjs";

const fmt = new Intl.NumberFormat("pt-BR");
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const deltaFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const COMPARE = splitCompareCatalog();
const QV_INTERSECTION = intersectionQvCatalog(COMPARE);
const CORE_INTERSECTION = intersectionCoreCatalog(COMPARE);
const DATA_FETCH_TIMEOUT_MS = 45_000;
const CHART_LIMIT = 10;

const state = {
  qvPayload: null,
  corePayload: null,
  loading: false,
  qvError: null,
  coreError: null,
  qvGlobal: defaultGlobalFilters(),
  coreGlobal: defaultCoreGlobalFilters(),
  sortKey: "absDelta",
  sortDir: "desc",
  showAllChart: false,
};

let eventsBound = false;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pctLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${pctFmt.format(Number(value))}%`;
}

function deltaLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${deltaFmt.format(Number(value))} p.p.`;
}

function kpiCard(label, value, note, options = {}) {
  const classes = ["kpi-card"];
  if (options.highlight) classes.push("kpi-card-highlight");
  if (options.compact) classes.push("kpi-card-compact");
  if (options.featured) classes.push("kpi-card-featured");
  return `<article class="${classes.join(" ")}">
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value">${value}</div>
    ${note ? `<div class="kpi-note">${escapeHtml(note)}</div>` : ""}
  </article>`;
}

function sortRows(rows, key, dir) {
  const list = [...rows];
  const direction = dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    const av = key === "absDelta" ? Math.abs(Number(a.delta) || 0) : a[key];
    const bv = key === "absDelta" ? Math.abs(Number(b.delta) || 0) : b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
    return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR") * direction;
  });
  return list;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map((col) => csvEscape(col.header)).join(";");
  const body = rows
    .map((row) => columns.map((col) => csvEscape(row[col.key])).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exclusiveTable(rows, sourceLabel) {
  const sorted = [...rows].sort(
    (a, b) => a.domain.localeCompare(b.domain, "pt-BR") || a.label.localeCompare(b.label, "pt-BR"),
  );
  return `<div class="table-wrap">
    <table class="gd-table">
      <thead>
        <tr>
          <th>Domínio</th>
          <th>Campo</th>
          <th>Fonte</th>
        </tr>
      </thead>
      <tbody>
        ${
          sorted.length
            ? sorted
                .map(
                  (row) => `<tr>
          <td>${escapeHtml(row.domain)}</td>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(sourceLabel)}</td>
        </tr>`,
                )
                .join("")
            : `<tr><td colspan="3">Nenhum campo exclusivo neste catálogo.</td></tr>`
        }
      </tbody>
    </table>
  </div>`;
}

function renderExclusive() {
  const root = $("exclusiveContent");
  if (!root) return;
  root.innerHTML = `
    <section class="section-block" id="euSecOnlyQv">
      <h2>1. Campos só na Base QV</h2>
      <p class="note-muted">Lista nominal do catálogo QV sem par no App Pharus. Sem percentual, gráfico ou faixa.</p>
      <div class="kpi-row">
        ${kpiCard("Campos só na Base QV", fmt.format(COMPARE.onlyQv.length), "Presentes na tela Base QV e ausentes no catálogo Pharus", { featured: true })}
      </div>
      ${exclusiveTable(COMPARE.onlyQv, "Base QV")}
    </section>
    <section class="section-block" id="euSecOnlyPharus">
      <h2>2. Campos só no App Pharus</h2>
      <p class="note-muted">Lista nominal do catálogo Pharus sem par na Base QV. Sem percentual, gráfico ou faixa.</p>
      <div class="kpi-row">
        ${kpiCard("Campos só no App Pharus", fmt.format(COMPARE.onlyPharus.length), "Presentes na tela Pharus e ausentes no catálogo Base QV", { featured: true })}
      </div>
      ${exclusiveTable(COMPARE.onlyPharus, "App Pharus")}
    </section>
  `;
}

function pairBars(items) {
  if (!items.length) return `<p class="placeholder-note">Sem dados</p>`;
  return `<div class="hbars">${items
    .map(
      (item) => `<div class="hbar hbar-compare">
      <div class="hbar-label">${escapeHtml(item.label)}</div>
      <div class="hbar-pair">
        <div class="hbar-track"><div class="hbar-fill qv" style="width:${Number(item.qvFillPercent) || 0}%"></div></div>
        <div class="hbar-track"><div class="hbar-fill pharus" style="width:${Number(item.pharusFillPercent) || 0}%"></div></div>
      </div>
      <div class="hbar-pair-values">
        <span>QV ${pctLabel(item.qvFillPercent)}</span>
        <span>Pharus ${pctLabel(item.pharusFillPercent)}</span>
      </div>
    </div>`,
    )
    .join("")}</div>`;
}

function currentView() {
  const qvClients = filterEpUnfilledClients(state.qvPayload?.clients || [], state.qvGlobal);
  const coreClients = filterCoreEpUnfilledClients(state.corePayload?.clients || [], state.coreGlobal);
  const qvFields = summarizeFieldTable(qvClients, defaultTableLocalFilters(), QV_INTERSECTION);
  const coreFields = summarizeCoreFieldTable(coreClients, defaultCoreTableLocalFilters(), CORE_INTERSECTION);
  const rows = buildCompareFillRows(qvFields, coreFields, COMPARE).map((row) => ({
    ...row,
    absDelta: Math.abs(Number(row.delta) || 0),
  }));
  const summary = summarizeCompareFills(rows);
  return {
    qvClients,
    coreClients,
    rows: sortRows(rows, state.sortKey, state.sortDir),
    chartRows: sortRows(rows, "absDelta", "desc"),
    summary,
  };
}

function renderGlobalFilters() {
  const root = $("globalFilters");
  if (!root) return;
  const engineerOptions = coreEngineerSelectOptions(state.corePayload?.clients || []);
  root.innerHTML = `
    <section class="filters" aria-label="Filtros Base QV">
      <p class="filter-group-title">Base QV</p>
      <label>
        <span>Busca</span>
        <input type="search" id="qvSearch" placeholder="Nome, código ou ID" value="${escapeHtml(state.qvGlobal.search)}" />
      </label>
      <label>
        <span>Programa</span>
        <select id="qvProgram"></select>
      </label>
      <label>
        <span>Status</span>
        <select id="qvStatus"></select>
      </label>
    </section>
    <section class="filters" aria-label="Filtros App Pharus">
      <p class="filter-group-title">App Pharus</p>
      <label>
        <span>Busca</span>
        <input type="search" id="phSearch" placeholder="Nome ou ID" value="${escapeHtml(state.coreGlobal.search)}" />
      </label>
      <label>
        <span>EP</span>
        <select id="phEngineer"></select>
      </label>
      <label>
        <span>Status</span>
        <select id="phStatus"></select>
      </label>
    </section>
    <div class="filter-actions compare-filter-actions">
      <button type="button" class="btn secondary" id="btnResetGlobal">Limpar filtros</button>
      <button type="button" class="btn" id="btnRefresh">Atualizar</button>
    </div>
  `;
  $("qvProgram").innerHTML = [{ value: "all", label: "Todos" }, ...programSelectOptions().map((value) => ({ value, label: value }))]
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  $("qvProgram").value = state.qvGlobal.program;
  $("qvStatus").innerHTML = EP_UNFILLED_STATUS_OPTIONS
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  $("qvStatus").value = state.qvGlobal.status;
  $("phEngineer").innerHTML = [{ value: "all", label: "Todos" }, ...engineerOptions.map((value) => ({ value, label: value }))]
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  $("phEngineer").value = state.coreGlobal.engineer;
  $("phStatus").innerHTML = CORE_EP_UNFILLED_STATUS_OPTIONS
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  $("phStatus").value = state.coreGlobal.status;
  bindFilterControls();
}

function bindFilterControls() {
  const apply = () => {
    state.qvGlobal = {
      search: $("qvSearch")?.value || "",
      program: normalizeProgramFilter($("qvProgram")?.value || "all"),
      status: $("qvStatus")?.value || "active",
    };
    state.coreGlobal = {
      search: $("phSearch")?.value || "",
      engineer: $("phEngineer")?.value || "all",
      status: $("phStatus")?.value || "all",
    };
    renderDashboard();
  };
  ["qvSearch", "phSearch"].forEach((id) => $(id)?.addEventListener("input", apply));
  ["qvProgram", "qvStatus", "phEngineer", "phStatus"].forEach((id) => $(id)?.addEventListener("change", apply));
  $("btnResetGlobal")?.addEventListener("click", () => {
    state.qvGlobal = defaultGlobalFilters();
    state.coreGlobal = defaultCoreGlobalFilters();
    renderGlobalFilters();
    renderDashboard();
  });
  $("btnRefresh")?.addEventListener("click", () => {
    void loadData({ force: true });
  });
}

function renderDashboard() {
  const content = $("pageContent");
  const status = $("pageStatus");
  const error = $("pageError");
  if (!content) return;

  const errors = [state.qvError, state.coreError].filter(Boolean);
  if (errors.length) {
    error.hidden = false;
    error.classList.remove("hidden");
    error.textContent = errors.join(" ");
  } else {
    error.hidden = true;
    error.classList.add("hidden");
    error.textContent = "";
  }

  if (state.loading && (!state.qvPayload || !state.corePayload)) {
    status.hidden = false;
    status.classList.remove("hidden");
    status.innerHTML = `<strong>Carregando comparação</strong><span>Consultando Base QV e App Pharus…</span>`;
    content.innerHTML = "";
    $("metaLine").textContent = "Carregando…";
    return;
  }

  if (!state.qvPayload || !state.corePayload) {
    status.hidden = false;
    status.classList.remove("hidden");
    status.innerHTML = `<strong>Não foi possível carregar as duas fontes.</strong><span>${escapeHtml(errors.join(" ") || "Tente novamente.")}</span>`;
    content.innerHTML = "";
    $("metaLine").textContent = "Sem dados suficientes para comparar";
    return;
  }

  status.hidden = true;
  status.classList.add("hidden");

  const { rows, chartRows, summary, qvClients, coreClients } = currentView();
  const chartItems = state.showAllChart ? chartRows : chartRows.slice(0, CHART_LIMIT);
  const qvGenerated = state.qvPayload?.generatedAt;
  const phGenerated = state.corePayload?.generatedAt;
  $("metaLine").textContent = `${fmt.format(qvClients.length)} clientes Base QV · ${fmt.format(coreClients.length)} clientes Pharus · ${fmt.format(summary.fieldCount)} campos`;

  content.innerHTML = `
    <section class="section-block" id="euSecSummary">
      <h2>1. Resumo da comparação</h2>
      <p class="note-muted">Médias dos campos da interseção em cada carteira. A frente conta quantos campos têm preenchimento maior naquela fonte.</p>
      <div class="kpi-row">
        ${kpiCard("Completude média Base QV", pctLabel(summary.qvAverage), `${fmt.format(qvClients.length)} clientes no recorte QV${qvGenerated ? ` · ${new Date(qvGenerated).toLocaleString("pt-BR")}` : ""}`, { featured: true })}
        ${kpiCard("Completude média Pharus", pctLabel(summary.pharusAverage), `${fmt.format(coreClients.length)} clientes no recorte Pharus${phGenerated ? ` · ${new Date(phGenerated).toLocaleString("pt-BR")}` : ""}`, { featured: true })}
        ${kpiCard("Campos com Base QV à frente", fmt.format(summary.qvAhead), "Preenchimento QV maior que Pharus", { featured: true })}
        ${kpiCard("Campos com Pharus à frente", fmt.format(summary.pharusAhead), "Preenchimento Pharus maior que QV", { highlight: true, featured: true })}
      </div>
    </section>

    <section class="section-block" id="euSecChart">
      <h2>2. Maiores diferenças</h2>
      <p class="note-muted">Barras pareadas do percentual preenchido. Ordenado pela maior diferença absoluta entre as fontes.</p>
      <article class="chart-card">
        <h3>Preenchimento Base QV × Pharus</h3>
        <p>${state.showAllChart ? "Todos os campos da interseção." : `Top ${CHART_LIMIT} campos com maior diferença absoluta.`} Coral é Base QV. Preto é Pharus.</p>
        ${pairBars(chartItems)}
        ${
          chartRows.length > CHART_LIMIT
            ? `<button class="btn secondary" type="button" id="euExpandChart">${state.showAllChart ? "Mostrar menos" : "Mostrar todos"}</button>`
            : ""
        }
      </article>
    </section>

    <section class="section-block" id="euSecFieldTable">
      <h2>3. Detalhe por campo</h2>
      <p class="note-muted">Percentual preenchido em cada carteira. A diferença é Pharus menos Base QV, em pontos percentuais.</p>
      <div class="table-toolbar">
        <span class="muted">${fmt.format(rows.length)} campos</span>
        <button type="button" class="btn secondary" id="exportFields">Exportar CSV</button>
      </div>
      <div class="table-wrap">
        <table class="gd-table" id="euFieldTable">
          <thead>
            <tr>
              <th data-sort="domain">Domínio</th>
              <th data-sort="label">Campo</th>
              <th data-sort="qvFillPercent" class="num">Base QV</th>
              <th data-sort="pharusFillPercent" class="num">Pharus</th>
              <th data-sort="delta" class="num">Diferença</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row) => `<tr>
              <td>${escapeHtml(row.domain)}</td>
              <td>${escapeHtml(row.label)}</td>
              <td class="num">${pctLabel(row.qvFillPercent)}</td>
              <td class="num">${pctLabel(row.pharusFillPercent)}</td>
              <td class="num">${deltaLabel(row.delta)}</td>
            </tr>`,
                    )
                    .join("")
                : `<tr><td colspan="5">Nenhum campo da interseção para os recortes selecionados.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  $("euExpandChart")?.addEventListener("click", () => {
    state.showAllChart = !state.showAllChart;
    renderDashboard();
  });
  $("exportFields")?.addEventListener("click", () => {
    downloadCsv("comparacao-preenchimento-campos.csv", [
      { key: "domain", header: "Domínio" },
      { key: "label", header: "Campo" },
      { key: "qvFillPercent", header: "Base QV" },
      { key: "pharusFillPercent", header: "Pharus" },
      { key: "delta", header: "Diferença (p.p.)" },
    ], rows);
  });
  content.querySelectorAll("#euFieldTable th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortKey = key;
        state.sortDir = key === "domain" || key === "label" ? "asc" : "desc";
      }
      renderDashboard();
    });
  });
}

function bindGlobal() {
  if (eventsBound) return;
  eventsBound = true;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function loadData({ force = false } = {}) {
  state.loading = true;
  state.qvError = null;
  state.coreError = null;
  renderDashboard();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
  const suffix = force ? "?force=1" : "";
  const results = await Promise.allSettled([
    fetchJson(`/api/ep-unfilled${suffix}`, controller.signal),
    fetchJson(`/api/core-ep-unfilled${suffix}`, controller.signal),
  ]);
  window.clearTimeout(timeoutId);
  const fail = (error) => (
    error?.name === "AbortError"
      ? "A consulta demorou demais para responder. Tente atualizar novamente."
      : error instanceof Error
        ? error.message
        : "Falha ao carregar."
  );
  if (results[0].status === "fulfilled") state.qvPayload = results[0].value;
  else state.qvError = fail(results[0].reason);
  if (results[1].status === "fulfilled") state.corePayload = results[1].value;
  else state.coreError = fail(results[1].reason);
  state.loading = false;
  renderGlobalFilters();
  renderDashboard();
}

renderExclusive();
bindGlobal();
renderGlobalFilters();
void loadData();
