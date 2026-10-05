import {
  CORE_EP_UNFILLED_DOMAINS,
  CORE_EP_UNFILLED_MIN_PORTFOLIO,
  CORE_EP_UNFILLED_PRIORITY_FIELD_IDS,
  CORE_EP_UNFILLED_PRIORITY_CHART_LIMIT,
  CORE_EP_UNFILLED_SEVERITY_OPTIONS,
  CORE_EP_UNFILLED_STATUS_OPTIONS,
} from "/lib/core-catalog.mjs";
import {
  defaultCoreGlobalFilters,
  defaultCoreClientTableFilters,
  coreEngineerSelectOptions,
  coreFieldSelectOptions,
  filterCoreEpUnfilledClients,
  summarizeCoreEmptyClients,
  summarizeCoreEpTable,
  summarizeCoreEpUnfilled,
  summarizeCoreFieldTable,
  summarizeCorePriorityFields,
} from "/lib/core-filters.mjs";

const fmt = new Intl.NumberFormat("pt-BR");
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const state = {
  payload: null,
  loading: false,
  error: null,
  global: defaultCoreGlobalFilters(),
  fieldTable: defaultCoreClientTableFilters(),
  epTable: defaultCoreClientTableFilters(),
  clientTable: defaultCoreClientTableFilters(),
  sortKey: "missingPercent",
  sortDir: "desc",
  epSortKey: "completeness",
  epSortDir: "asc",
  clientSortKey: "emptyCount",
  clientSortDir: "desc",
  page: 1,
  clientPage: 1,
  pageSize: 25,
  showAllEngineers: false,
  showAllPriorityFields: false,
};

let eventsBound = false;
const DATA_FETCH_TIMEOUT_MS = 45_000;

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

function fillSelect(select, options, current, allLabel = "Todos") {
  if (!select) return;
  const items = [{ value: "all", label: allLabel }, ...options];
  select.innerHTML = items
    .map((item) => {
      const value = typeof item === "string" ? item : item.value;
      const label = typeof item === "string" ? item : item.label;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  select.value = current && items.some((item) => (typeof item === "string" ? item : item.value) === current)
    ? current
    : "all";
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

function severityBadge(row) {
  const badgeClass =
    row.severity === "high" ? "badge-active" : row.severity === "medium" ? "badge-frozen" : "badge-cancelled";
  return `<span class="badge ${badgeClass}">${escapeHtml(row.severityLabel || "")}</span>`;
}

function sortRows(rows, key, dir) {
  const list = [...rows];
  const direction = dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
    return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR") * direction;
  });
  return list;
}

function hBars(items) {
  if (!items.length) return `<p class="placeholder-note">Sem dados</p>`;
  const max = Math.max(...items.map((item) => Number(item.percent) || 0), 1);
  return `<div class="hbars">${items
    .map(
      (item) => `<div class="hbar">
      <div class="hbar-label">${escapeHtml(item.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${((Number(item.percent) || 0) / max) * 100}%"></div></div>
      <div class="hbar-value">${pctLabel(item.percent)}</div>
    </div>`,
    )
    .join("")}</div>`;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[\s\uFEFF]*[=+@\-]/.test(text) && typeof value === "string" ? `'${text}` : text;
  if (/["\r\n;]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
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
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1_000);
}

function tableFilterBar(prefix, filters, engineers, options = {}) {
  const showSeverity = options.showSeverity !== false;
  const domains = options.showScope && filters.scope === "indicators"
    ? CORE_EP_UNFILLED_DOMAINS.filter((domain) => coreFieldSelectOptions(domain).some((field) => CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.includes(field.value)))
    : CORE_EP_UNFILLED_DOMAINS;
  const domainOptions = [{ value: "all", label: "Todos" }, ...domains.map((domain) => ({ value: domain, label: domain }))];
  const fields = coreFieldSelectOptions(filters.domain).filter(
    (field) => !options.showScope || filters.scope !== "indicators" || CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.includes(field.value),
  );
  return `<div class="filter-bar" data-table="${prefix}">
    ${options.showScope ? `<label><span>Campos</span><select id="${prefix}Scope">
      <option value="indicators"${filters.scope === "indicators" ? " selected" : ""}>Campos utilizados em indicadores</option>
      <option value="all"${filters.scope === "all" ? " selected" : ""}>Todos os campos</option>
    </select></label>` : ""}
    <label><span>EP</span>
      <select id="${prefix}Engineer">${[{ value: "all", label: "Todos" }, ...engineers.map((name) => ({ value: name, label: name }))]
        .map((item) => `<option value="${escapeHtml(item.value)}"${item.value === filters.engineer ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
        .join("")}</select>
    </label>
    <label><span>Domínio</span>
      <select id="${prefix}Domain">${domainOptions
        .map((item) => `<option value="${escapeHtml(item.value)}"${item.value === filters.domain ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
        .join("")}</select>
    </label>
    <label><span>Campo</span>
      <select id="${prefix}Field">${[{ value: "all", label: "Todos" }, ...fields]
        .map((item) => `<option value="${escapeHtml(item.value)}"${item.value === filters.field ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
        .join("")}</select>
    </label>
    ${
      showSeverity
        ? `<label><span>Faixa</span>
      <select id="${prefix}Severity">${CORE_EP_UNFILLED_SEVERITY_OPTIONS
        .map((item) => `<option value="${escapeHtml(item.value)}"${item.value === filters.severity ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
        .join("")}</select>
    </label>`
        : ""
    }
    <div class="filter-actions">
      <button type="button" class="btn secondary" data-clear="${prefix}">Limpar desta tabela</button>
    </div>
  </div>`;
}

function bindTableFilters(prefix, key) {
  const read = () => ({
    engineer: $(`${prefix}Engineer`)?.value || "all",
    domain: $(`${prefix}Domain`)?.value || "all",
    field: $(`${prefix}Field`)?.value || "all",
    severity: $(`${prefix}Severity`)?.value || "all",
    ...($(`${prefix}Scope`) ? { scope: $(`${prefix}Scope`).value } : {}),
  });
  const apply = () => {
    const next = read();
    const prevDomain = state[key].domain;
    if (next.scope === "indicators" && next.domain !== "all"
      && !coreFieldSelectOptions(next.domain).some((field) => CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.includes(field.value))) next.domain = "all";
    state[key] = next;
    if (next.domain !== prevDomain || (next.scope === "indicators" && !CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.includes(next.field))) state[key].field = "all";
    if (key === "epTable") state.page = 1;
    if (key === "clientTable") state.clientPage = 1;
    renderDashboard();
  };
  ["Scope", "Engineer", "Domain", "Field", "Severity"].forEach((suffix) => {
    $(`${prefix}${suffix}`)?.addEventListener("change", apply);
  });
  document.querySelector(`[data-clear="${prefix}"]`)?.addEventListener("click", () => {
    state[key] = defaultCoreClientTableFilters();
    if (key === "epTable") state.page = 1;
    if (key === "clientTable") state.clientPage = 1;
    renderDashboard();
  });
}

function currentView() {
  const clients = filterCoreEpUnfilledClients(state.payload?.clients || [], state.global);
  const summary = summarizeCoreEpUnfilled(clients);
  const fields = sortRows(summarizeCoreFieldTable(clients, state.fieldTable), state.sortKey, state.sortDir);
  const engineers = sortRows(summarizeCoreEpTable(clients, state.epTable), state.epSortKey, state.epSortDir);
  const emptyClients = sortRows(summarizeCoreEmptyClients(clients, state.clientTable), state.clientSortKey, state.clientSortDir);
  const priorityFields = summarizeCorePriorityFields(clients);
  const rankedEngineers = summarizeCoreEpTable(clients, { scope: "indicators" }).filter((row) => row.rankEligible);
  return { clients, summary, fields, engineers, emptyClients, priorityFields, rankedEngineers };
}

function renderDashboard() {
  const content = $("pageContent");
  const status = $("pageStatus");
  const error = $("pageError");
  if (!content) return;

  if (state.error) {
    error.hidden = false;
    error.classList.remove("hidden");
    error.textContent = state.error;
  } else {
    error.hidden = true;
    error.classList.add("hidden");
    error.textContent = "";
  }

  if (state.loading && !state.payload) {
    status.hidden = false;
    status.classList.remove("hidden");
    status.innerHTML = `<strong>Carregando preenchimento por EP</strong><span>Consultando a App Pharus/Core…</span>`;
    content.innerHTML = "";
    return;
  }

  if (!state.payload) {
    status.hidden = false;
    status.classList.remove("hidden");
    status.innerHTML = `<strong>Não foi possível carregar os dados.</strong><span>${escapeHtml(state.error || "Tente novamente.")}</span>`;
    content.innerHTML = "";
    return;
  }

  status.hidden = true;
  status.classList.add("hidden");

  const { summary, fields, engineers, clients, emptyClients, priorityFields, rankedEngineers } = currentView();
  const topFields = priorityFields.slice(0, 3);
  const worstEps = rankedEngineers.slice(0, 3);
  const engineerOptions = coreEngineerSelectOptions(clients);
  const allEngineerOptions = coreEngineerSelectOptions(state.payload?.clients || []);
  fillSelect($("fEngineer"), allEngineerOptions.map((value) => ({ value, label: value })), state.global.engineer);
  const rankedBars = state.showAllEngineers ? rankedEngineers : rankedEngineers.slice(0, 8);
  const priorityBars = state.showAllPriorityFields
    ? priorityFields
    : priorityFields.slice(0, CORE_EP_UNFILLED_PRIORITY_CHART_LIMIT);
  const pages = Math.max(1, Math.ceil(engineers.length / state.pageSize));
  if (state.page > pages) state.page = pages;
  const pageRows = engineers.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  const clientPages = Math.max(1, Math.ceil(emptyClients.length / state.pageSize));
  if (state.clientPage > clientPages) state.clientPage = clientPages;
  const clientPageRows = emptyClients.slice(
    (state.clientPage - 1) * state.pageSize,
    state.clientPage * state.pageSize,
  );
  $("metaLine").textContent = `${fmt.format(summary.totalClients)} clientes · projeto qvtqufdivpbmubooawdm · gerado em ${new Date(state.payload.generatedAt).toLocaleString("pt-BR")}`;

  content.innerHTML = `
    <section class="section-block" id="euSecSummary">
      <div class="table-toolbar">
        <h2>1. Resumo</h2>
        <button type="button" class="btn secondary" id="exportSummary">Exportar CSV</button>
      </div>
      <p class="note-muted">Leitura da completude dos campos correlacionados no recorte filtrado.</p>
      <div class="kpi-row">
        ${kpiCard("Completude média", pctLabel(summary.averageFill), "Média dos campos do recorte", { featured: true })}
        ${kpiCard("Clientes no recorte", fmt.format(summary.totalClients), "Carteira após os filtros globais", { featured: true })}
        ${kpiCard("Campos com preenchimento baixo", fmt.format(summary.lowFillFieldCount), "Abaixo de 60%", { highlight: true, featured: true })}
        ${kpiCard("EPs abaixo da mediana", fmt.format(summary.engineersBelowMedian), summary.medianCompleteness == null ? "Sem carteiras elegíveis" : `Mediana ${pctLabel(summary.medianCompleteness)} · mín. ${CORE_EP_UNFILLED_MIN_PORTFOLIO} clientes`, { featured: true })}
      </div>
    </section>

    <section class="section-block" id="euSecFields">
      <div class="table-toolbar">
        <h2>2. Campos menos preenchidos</h2>
        <button type="button" class="btn secondary" id="exportGaps">Exportar CSV</button>
      </div>
      <p class="note-muted">Os cartões mostram as três maiores lacunas entre os ${priorityFields.length} campos utilizados em indicadores.</p>
      <div class="kpi-row">
        ${
          topFields.length
            ? topFields
                .map((row) =>
                  kpiCard(row.label, pctLabel(row.missingPercent), `${fmt.format(row.missing)} de ${fmt.format(row.totalRows)} clientes sem o campo`, {
                    compact: true,
                    highlight: true,
                  }),
                )
                .join("")
            : `<p class="placeholder-note">Nenhum campo no recorte selecionado.</p>`
        }
      </div>
      <div class="chart-grid">
        <article class="chart-card">
          <h3>Lacunas nos campos principais</h3>
          <p>${state.showAllPriorityFields ? `Todos os ${priorityFields.length} campos principais, por percentual vazio.` : `Os ${CORE_EP_UNFILLED_PRIORITY_CHART_LIMIT} maiores percentuais vazios entre os ${priorityFields.length} campos principais.`}</p>
          ${hBars(priorityBars.map((row) => ({ label: row.label, percent: row.missingPercent })))}
          ${
            priorityFields.length > CORE_EP_UNFILLED_PRIORITY_CHART_LIMIT
              ? `<button class="btn secondary" type="button" id="euExpandPriority">${state.showAllPriorityFields ? "Mostrar menos" : "Mostrar todos"}</button>`
              : ""
          }
        </article>
        <article class="chart-card">
          <h3>Lacunas em todos os campos</h3>
          <p>Os dez maiores percentuais vazios entre todos os ${summary.fieldCount} campos da tela.</p>
          ${hBars(summary.topMissingFields.map((row) => ({ label: row.label, percent: row.missingPercent })))}
        </article>
      </div>
    </section>

    <section class="section-block" id="euSecEngineers">
      <div class="table-toolbar">
        <h2>3. EPs com menor preenchimento</h2>
        <button type="button" class="btn secondary" id="exportRanking">Exportar CSV</button>
      </div>
      <p class="note-muted">A comparação usa a média dos ${priorityFields.length} campos utilizados em indicadores. Carteiras com menos de ${CORE_EP_UNFILLED_MIN_PORTFOLIO} clientes ficam fora do ranking e permanecem na tabela.</p>
      <div class="kpi-row">
        ${
          worstEps.length
            ? worstEps
                .map((row) =>
                  kpiCard(row.engineer, pctLabel(row.completeness), `${fmt.format(row.totalClients)} clientes · campo mais vazio: ${row.worstField}`, {
                    compact: true,
                  }),
                )
                .join("")
            : `<p class="placeholder-note">Nenhum EP com carteira suficiente para o ranking neste recorte.</p>`
        }
      </div>
      <article class="chart-card">
        <h3>Menor completude por EP</h3>
        <p>Barras representam o percentual não preenchido nos ${priorityFields.length} campos principais das carteiras elegíveis.</p>
        ${hBars(rankedBars.map((row) => ({ label: row.engineer, percent: row.missingPercent })))}
        ${
          rankedEngineers.length > 8
            ? `<button class="btn secondary" type="button" id="euExpandEngineers">${state.showAllEngineers ? "Mostrar menos" : "Mostrar todos"}</button>`
            : ""
        }
      </article>
    </section>

    <section class="section-block" id="euSecFieldTable">
      <h2>4. Detalhe por campo</h2>
      <p class="note-muted">Percentual preenchido sobre os clientes do recorte global. A origem mostra o campo correlacionado da BaseQV.</p>
      ${tableFilterBar("tf", state.fieldTable, engineerOptions, { showScope: true })}
      <div class="table-toolbar">
        <span class="muted">${fmt.format(fields.length)} campos</span>
        <button type="button" class="btn secondary" id="exportFields">Exportar CSV</button>
      </div>
      <div class="table-wrap">
        <table class="gd-table" id="euFieldTable">
          <thead>
            <tr>
              <th data-sort="label">Campo</th>
              <th data-sort="coreField">Campo core</th>
              <th data-sort="baseqvField">Campo BaseQV</th>
              <th data-sort="correlationType">Correlação</th>
              <th data-sort="filled" class="num">Preenchidos</th>
              <th data-sort="missing" class="num">Vazios</th>
              <th data-sort="fillPercent" class="num">Preenchido</th>
              <th data-sort="severityLabel">Faixa</th>
            </tr>
          </thead>
          <tbody>
            ${
              fields.length
                ? fields
                    .map(
                      (row) => `<tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${escapeHtml(row.coreField)}</td>
              <td>${escapeHtml(row.baseqvField)}</td>
              <td>${escapeHtml(row.correlationType)}</td>
              <td class="num">${fmt.format(row.filled)}</td>
              <td class="num">${fmt.format(row.missing)}</td>
              <td class="num">${pctLabel(row.fillPercent)}</td>
              <td>${severityBadge(row)}</td>
            </tr>`,
                    )
                    .join("")
                : `<tr><td colspan="8">Nenhum campo encontrado para os filtros selecionados.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="section-block" id="euSecEpTable">
      <h2>5. Detalhe por EP</h2>
      <p class="note-muted">Completude média da carteira nos campos selecionados. Os filtros abaixo não alteram a tabela 4.</p>
      ${tableFilterBar("te", state.epTable, engineerOptions, { showScope: true })}
      <div class="table-toolbar">
        <span class="muted">${fmt.format(engineers.length)} EPs</span>
        <button type="button" class="btn secondary" id="exportEps">Exportar CSV</button>
      </div>
      <div class="table-wrap">
        <table class="gd-table" id="euEpTable">
          <thead>
            <tr>
              <th data-sort="engineer">EP</th>
              <th data-sort="totalClients" class="num">Carteira</th>
              <th data-sort="completeness" class="num">Completude</th>
              <th data-sort="worstField">Campo mais vazio</th>
              <th data-sort="worstFillPercent" class="num">Preenchimento desse campo</th>
              <th data-sort="severityLabel">Faixa</th>
            </tr>
          </thead>
          <tbody>
            ${
              pageRows.length
                ? pageRows
                    .map(
                      (row) => `<tr>
              <td>${escapeHtml(row.engineer)}</td>
              <td class="num">${fmt.format(row.totalClients)}</td>
              <td class="num">${pctLabel(row.completeness)}</td>
              <td>${escapeHtml(row.worstField)}</td>
              <td class="num">${pctLabel(row.worstFillPercent)}</td>
              <td>${severityBadge(row)}</td>
            </tr>`,
                    )
                    .join("")
                : `<tr><td colspan="6">Nenhum EP encontrado para os filtros selecionados.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <div>Página ${state.page} de ${pages}</div>
        <div>
          <button class="btn secondary" type="button" id="euPrev" ${state.page <= 1 ? "disabled" : ""}>Anterior</button>
          <button class="btn secondary" type="button" id="euNext" ${state.page >= pages ? "disabled" : ""}>Próxima</button>
        </div>
      </div>
    </section>

    <section class="section-block" id="euSecClientTable">
      <h2>6. Detalhamento de Campos Vazios por EP e por Clientes</h2>
      <p class="note-muted">Uma linha por cliente com campos vazios no recorte desta tabela. As listas seguem os filtros abaixo; o percentual usa todos os ${summary.fieldCount} campos. Os filtros não alteram as seções 4 e 5.</p>
      ${tableFilterBar("tc", state.clientTable, engineerOptions, { showSeverity: false, showScope: true })}
      <div class="table-toolbar">
        <span class="muted">${fmt.format(emptyClients.length)} clientes</span>
        <button type="button" class="btn secondary" id="exportClients">Exportar CSV</button>
      </div>
      <div class="table-wrap">
        <table class="gd-table" id="euClientTable">
          <thead>
            <tr>
              <th data-sort="engineer">EP</th>
              <th data-sort="clientName">Cliente</th>
              <th data-sort="clientCode">Código</th>
              <th data-sort="priorityEmptyFields">Campos principais vazios</th>
              <th data-sort="priorityEmptyCount" class="num">Qtd principais</th>
              <th data-sort="otherEmptyFields">Demais campos vazios</th>
              <th data-sort="otherEmptyCount" class="num">Qtd demais</th>
              <th data-sort="emptyCount" class="num">Total vazios</th>
              <th data-sort="fillPercent" class="num">Preenchido</th>
            </tr>
          </thead>
          <tbody>
            ${
              clientPageRows.length
                ? clientPageRows
                    .map(
                      (row) => `<tr>
              <td>${escapeHtml(row.engineer)}</td>
              <td>${escapeHtml(row.clientName)}</td>
              <td>${escapeHtml(row.clientCode)}</td>
              <td class="wrap">${escapeHtml(row.priorityEmptyFields || "—")}</td>
              <td class="num">${fmt.format(row.priorityEmptyCount)}</td>
              <td class="wrap">${escapeHtml(row.otherEmptyFields || "—")}</td>
              <td class="num">${fmt.format(row.otherEmptyCount)}</td>
              <td class="num">${fmt.format(row.emptyCount)}</td>
              <td class="num">${pctLabel(row.fillPercent)}</td>
            </tr>`,
                    )
                    .join("")
                : `<tr><td colspan="9">Nenhum cliente com campo vazio para os filtros selecionados.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <div>Página ${state.clientPage} de ${clientPages}</div>
        <div>
          <button class="btn secondary" type="button" id="euClientPrev" ${state.clientPage <= 1 ? "disabled" : ""}>Anterior</button>
          <button class="btn secondary" type="button" id="euClientNext" ${state.clientPage >= clientPages ? "disabled" : ""}>Próxima</button>
        </div>
      </div>
    </section>
  `;

  bindTableFilters("tf", "fieldTable");
  bindTableFilters("te", "epTable");
  bindTableFilters("tc", "clientTable");

  $("euExpandEngineers")?.addEventListener("click", () => {
    state.showAllEngineers = !state.showAllEngineers;
    renderDashboard();
  });
  $("euExpandPriority")?.addEventListener("click", () => {
    state.showAllPriorityFields = !state.showAllPriorityFields;
    renderDashboard();
  });
  $("euPrev")?.addEventListener("click", () => {
    state.page -= 1;
    renderDashboard();
  });
  $("euNext")?.addEventListener("click", () => {
    state.page += 1;
    renderDashboard();
  });
  $("euClientPrev")?.addEventListener("click", () => {
    state.clientPage -= 1;
    renderDashboard();
  });
  $("euClientNext")?.addEventListener("click", () => {
    state.clientPage += 1;
    renderDashboard();
  });
  $("exportSummary")?.addEventListener("click", () => {
    downloadCsv("core-resumo.csv", [
      { key: "indicator", header: "Indicador" },
      { key: "value", header: "Valor" },
      { key: "unit", header: "Unidade" },
      { key: "detail", header: "Detalhe" },
    ], [
      { indicator: "Completude média", value: summary.averageFill, unit: "%", detail: `Média de ${summary.fieldCount} campos` },
      { indicator: "Clientes no recorte", value: summary.totalClients, unit: "clientes", detail: "Após os filtros globais" },
      { indicator: "Campos com preenchimento baixo", value: summary.lowFillFieldCount, unit: "campos", detail: "Abaixo de 60%" },
      { indicator: "EPs abaixo da mediana", value: summary.engineersBelowMedian, unit: "EPs", detail: summary.medianCompleteness == null ? "Sem carteiras elegíveis" : `Mediana ${pctLabel(summary.medianCompleteness)}; mínimo ${CORE_EP_UNFILLED_MIN_PORTFOLIO} clientes` },
    ]);
  });
  $("exportGaps")?.addEventListener("click", () => {
    const rows = [
      ...topFields.map((row) => ({ section: "Cartões: campos principais", ...row })),
      ...priorityFields.map((row) => ({ section: "Lacunas nos campos principais", ...row })),
      ...summary.topMissingFields.map((row) => ({ section: "Lacunas em todos os campos", ...row })),
    ];
    downloadCsv("core-lacunas.csv", [
      { key: "section", header: "Grupo" },
      { key: "label", header: "Campo" },
      { key: "filled", header: "Preenchidos" },
      { key: "missing", header: "Vazios" },
      { key: "totalRows", header: "Clientes no recorte" },
      { key: "missingPercent", header: "% vazio" },
    ], rows);
  });
  $("exportRanking")?.addEventListener("click", () => {
    downloadCsv("core-ranking-eps.csv", [
      { key: "engineer", header: "EP" },
      { key: "totalClients", header: "Carteira" },
      { key: "completeness", header: "% preenchido" },
      { key: "missingPercent", header: "% vazio" },
      { key: "worstField", header: "Campo mais vazio" },
      { key: "worstFillPercent", header: "% preenchido nesse campo" },
    ], rankedEngineers);
  });
  $("exportFields")?.addEventListener("click", () => {
    downloadCsv("core-dados-nao-preenchidos-campos.csv", [
      { key: "label", header: "Campo" },
      { key: "coreField", header: "Campo core" },
      { key: "baseqvField", header: "Campo BaseQV" },
      { key: "correlationType", header: "Correlação" },
      { key: "filled", header: "Preenchidos" },
      { key: "missing", header: "Vazios" },
      { key: "fillPercent", header: "Preenchido" },
      { key: "severityLabel", header: "Faixa" },
    ], fields);
  });
  $("exportEps")?.addEventListener("click", () => {
    downloadCsv("core-dados-nao-preenchidos-eps.csv", [
      { key: "engineer", header: "EP" },
      { key: "totalClients", header: "Carteira" },
      { key: "completeness", header: "Completude" },
      { key: "worstField", header: "Campo mais vazio" },
      { key: "worstFillPercent", header: "Preenchimento do campo mais vazio" },
      { key: "severityLabel", header: "Faixa" },
    ], engineers);
  });
  $("exportClients")?.addEventListener("click", () => {
    downloadCsv("core-dados-nao-preenchidos-clientes.csv", [
      { key: "engineer", header: "EP" },
      { key: "clientName", header: "Cliente" },
      { key: "clientCode", header: "Código" },
      { key: "priorityEmptyFields", header: "Campos principais vazios" },
      { key: "priorityEmptyCount", header: "Qtd principais" },
      { key: "otherEmptyFields", header: "Demais campos vazios" },
      { key: "otherEmptyCount", header: "Qtd demais" },
      { key: "emptyCount", header: "Total vazios" },
      { key: "fillPercent", header: "Preenchido" },
    ], emptyClients);
  });
  content.querySelectorAll("#euFieldTable th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortKey = key;
        state.sortDir = key === "label" || key === "severityLabel" ? "asc" : "desc";
      }
      renderDashboard();
    });
  });
  content.querySelectorAll("#euEpTable th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.epSortKey === key) state.epSortDir = state.epSortDir === "asc" ? "desc" : "asc";
      else {
        state.epSortKey = key;
        state.epSortDir = key === "engineer" || key === "worstField" || key === "severityLabel" ? "asc" : "desc";
      }
      renderDashboard();
    });
  });
  content.querySelectorAll("#euClientTable th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.clientSortKey === key) state.clientSortDir = state.clientSortDir === "asc" ? "desc" : "asc";
      else {
        state.clientSortKey = key;
        state.clientSortDir = key === "emptyCount" || key === "fillPercent" ? "desc" : "asc";
      }
      renderDashboard();
    });
  });
}

function bindGlobalFilters() {
  if (eventsBound) return;
  eventsBound = true;
  $("fStatus").innerHTML = CORE_EP_UNFILLED_STATUS_OPTIONS
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  $("fStatus").value = state.global.status;
  $("fSearch").value = state.global.search;

  const apply = () => {
    state.global = {
      search: $("fSearch").value || "",
      engineer: $("fEngineer").value || "all",
      status: $("fStatus").value || "all",
    };
    state.page = 1;
    state.clientPage = 1;
    renderDashboard();
  };
  $("fSearch").addEventListener("input", apply);
  $("fEngineer").addEventListener("change", apply);
  $("fStatus").addEventListener("change", apply);
  $("btnResetGlobal").addEventListener("click", () => {
    state.global = defaultCoreGlobalFilters();
    $("fSearch").value = "";
    $("fEngineer").value = "all";
    $("fStatus").value = "all";
    state.page = 1;
    state.clientPage = 1;
    renderDashboard();
  });
  $("btnRefresh").addEventListener("click", () => {
    void loadData({ force: true });
  });
}

async function loadData({ force = false } = {}) {
  state.loading = true;
  state.error = null;
  renderDashboard();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`/api/core-ep-unfilled${force ? "?force=1" : ""}`, {
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    state.payload = body;
  } catch (error) {
    state.error = error?.name === "AbortError"
      ? "A consulta demorou demais para responder. Tente atualizar novamente."
      : error instanceof Error
        ? error.message
        : "Falha ao carregar.";
  } finally {
    window.clearTimeout(timeoutId);
    state.loading = false;
    renderDashboard();
  }
}

bindGlobalFilters();
void loadData();

