/**
 * Filtros e agregações — Dados não preenchidos por EP.
 * Global: busca / programa / status. Tabelas 4 e 5 têm estado local independente.
 */
import { matchesSearch } from "./search.mjs";
import { programMatches, normalizeProgramFilter } from "./program.mjs";

function matchesStatusFilter(analyticalStatus, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  const status = String(analyticalStatus || "");
  if (filterKey === "active") return status === "Ativo";
  if (filterKey === "frozen") return status === "Congelado";
  if (filterKey === "cancelled") {
    return (
      status === "Cancelado"
      || status === "Cancelado confirmado"
      || status === "Cancelado efetivado sem data"
    );
  }
  return status === filterKey;
}
import {
  EP_UNFILLED_CATALOG,
  EP_UNFILLED_DOMAINS,
  EP_UNFILLED_MIN_PORTFOLIO,
  EP_UNFILLED_PRIORITY_FIELD_IDS,
  EP_UNFILLED_SEVERITY_OPTIONS,
  EP_UNFILLED_STATUS_OPTIONS,
} from "./catalog.mjs";

export const DEFAULT_STATUS_FILTER = "active";

const ALLOWED_STATUS = new Set(EP_UNFILLED_STATUS_OPTIONS.map((item) => item.value));
const ALLOWED_DOMAINS = new Set(EP_UNFILLED_DOMAINS);
const ALLOWED_SEVERITY = new Set(EP_UNFILLED_SEVERITY_OPTIONS.map((item) => item.value));
const CATALOG_IDS = new Set(EP_UNFILLED_CATALOG.map((field) => field.id));

export function defaultGlobalFilters() {
  return {
    search: "",
    program: "all",
    status: DEFAULT_STATUS_FILTER,
  };
}

/** Alias: filtros globais (sem EP/domínio). */
export function defaultEpUnfilledFilters() {
  return defaultGlobalFilters();
}

export function defaultTableLocalFilters() {
  return {
    engineer: "all",
    domain: "all",
    field: "all",
    severity: "all",
  };
}

export function normalizeEpUnfilledStatus(value) {
  return ALLOWED_STATUS.has(value) ? value : DEFAULT_STATUS_FILTER;
}

export function normalizeEpUnfilledDomain(value) {
  if (!value || value === "all") return "all";
  return ALLOWED_DOMAINS.has(value) ? value : "all";
}

export function normalizeEpUnfilledSeverity(value) {
  if (!value || value === "all") return "all";
  return ALLOWED_SEVERITY.has(value) ? value : "all";
}

export function normalizeEpUnfilledField(value) {
  if (!value || value === "all") return "all";
  return CATALOG_IDS.has(value) ? value : "all";
}

export function visibleCatalogFields(domain = "all") {
  const selected = normalizeEpUnfilledDomain(domain);
  if (selected === "all") return EP_UNFILLED_CATALOG;
  return EP_UNFILLED_CATALOG.filter((field) => field.domain === selected);
}

export function catalogForLocalFilters(localFilters = {}) {
  const next = { ...defaultTableLocalFilters(), ...localFilters };
  const domain = normalizeEpUnfilledDomain(next.domain);
  const fieldId = normalizeEpUnfilledField(next.field);
  let fields = visibleCatalogFields(domain);
  if (fieldId !== "all") fields = fields.filter((field) => field.id === fieldId);
  return fields;
}

export function fieldSelectOptions(domain = "all") {
  return visibleCatalogFields(domain).map((field) => ({ value: field.id, label: field.label }));
}

export function filterEpUnfilledClients(clients = [], filters = {}) {
  const next = { ...defaultGlobalFilters(), ...filters };
  const status = normalizeEpUnfilledStatus(next.status);
  const program = normalizeProgramFilter(next.program);
  return (Array.isArray(clients) ? clients : []).filter((row) => {
    if (!matchesStatusFilter(row.analyticalStatus, status)) return false;
    if (!programMatches(row, program)) return false;
    if (!matchesSearch(row, next.search)) return false;
    return true;
  });
}

function round1(value) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function fillSeverity(fillPercent) {
  if (fillPercent >= 85) return { key: "high", label: "Alto" };
  if (fillPercent >= 60) return { key: "medium", label: "Médio" };
  return { key: "low", label: "Baixo" };
}

function fieldCoverage(clients, field) {
  const total = clients.length;
  let filled = 0;
  for (const row of clients) {
    if (row?.fills?.[field.id]) filled += 1;
  }
  const missing = total - filled;
  const fillPercent = total ? round1((filled / total) * 100) : 0;
  const missingPercent = total ? round1((missing / total) * 100) : 0;
  return {
    id: field.id,
    domain: field.domain,
    label: field.label,
    kind: field.kind || "value",
    totalRows: total,
    filled,
    missing,
    fillPercent,
    missingPercent,
    severity: fillSeverity(fillPercent).key,
    severityLabel: fillSeverity(fillPercent).label,
  };
}

function engineerCompleteness(engineer, clients, fields) {
  const totalClients = clients.length;
  const fieldRows = fields.map((field) => fieldCoverage(clients, field));
  const completeness = fieldRows.length
    ? round1(fieldRows.reduce((sum, row) => sum + row.fillPercent, 0) / fieldRows.length)
    : 0;
  const worst = [...fieldRows].sort(
    (a, b) => b.missingPercent - a.missingPercent || a.label.localeCompare(b.label, "pt-BR"),
  )[0] || null;
  return {
    engineer,
    totalClients,
    completeness,
    missingPercent: round1(100 - completeness),
    worstField: worst?.label || "—",
    worstFieldId: worst?.id || null,
    worstFillPercent: worst?.fillPercent ?? null,
    rankEligible: totalClients >= EP_UNFILLED_MIN_PORTFOLIO,
    severity: fillSeverity(completeness).key,
    severityLabel: fillSeverity(completeness).label,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function groupByEngineer(clients) {
  const grouped = new Map();
  for (const row of clients) {
    const name = row.engineer || "Não informado";
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(row);
  }
  return grouped;
}

function sortFieldRows(fieldRows) {
  return [...fieldRows].sort(
    (a, b) => b.missingPercent - a.missingPercent || a.label.localeCompare(b.label, "pt-BR"),
  );
}

function sortEngineerRows(engineers) {
  return [...engineers].sort(
    (a, b) => a.completeness - b.completeness || b.totalClients - a.totalClients || a.engineer.localeCompare(b.engineer, "pt-BR"),
  );
}

export function summarizeEpUnfilled(clients = []) {
  const fields = visibleCatalogFields("all");
  const fieldRows = sortFieldRows(fields.map((field) => fieldCoverage(clients, field)));
  const engineers = sortEngineerRows(
    [...groupByEngineer(clients).entries()].map(([name, rows]) => engineerCompleteness(name, rows, fields)),
  );
  const eligible = engineers.filter((row) => row.rankEligible);
  const completenessValues = eligible.map((row) => row.completeness);
  const medianCompleteness = completenessValues.length ? round1(median(completenessValues)) : null;
  const engineersBelowMedian =
    medianCompleteness == null ? 0 : eligible.filter((row) => row.completeness < medianCompleteness).length;
  const averageFill = fieldRows.length
    ? round1(fieldRows.reduce((sum, row) => sum + row.fillPercent, 0) / fieldRows.length)
    : 0;

  return {
    totalClients: clients.length,
    fieldCount: fieldRows.length,
    averageFill,
    lowFillFieldCount: fieldRows.filter((row) => row.fillPercent < 60).length,
    engineersBelowMedian,
    eligibleEngineerCount: eligible.length,
    medianCompleteness,
    fields: fieldRows,
    topMissingFields: fieldRows.slice(0, 10),
    engineers,
    rankedEngineers: eligible,
    worstEngineers: eligible.slice(0, 8),
  };
}

export function summarizeFieldTable(clients = [], localFilters = {}) {
  const next = { ...defaultTableLocalFilters(), ...localFilters };
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  const scoped = engineer === "all"
    ? clients
    : clients.filter((row) => String(row.engineer || "Não informado") === engineer);
  const fields = catalogForLocalFilters(next);
  const severity = normalizeEpUnfilledSeverity(next.severity);
  return sortFieldRows(fields.map((field) => fieldCoverage(scoped, field))).filter(
    (row) => severity === "all" || row.severity === severity,
  );
}

export function summarizePriorityFields(clients = []) {
  const byId = new Map(EP_UNFILLED_CATALOG.map((field) => [field.id, field]));
  const fields = EP_UNFILLED_PRIORITY_FIELD_IDS.map((id) => byId.get(id)).filter(Boolean);
  return sortFieldRows(fields.map((field) => fieldCoverage(clients, field)));
}

export function summarizeEmptyClients(clients = [], localFilters = {}) {
  const next = { ...defaultTableLocalFilters(), ...localFilters };
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  const fields = catalogForLocalFilters(next);
  const scoped = engineer === "all"
    ? clients
    : clients.filter((row) => String(row.engineer || "Não informado") === engineer);

  return scoped
    .map((client) => {
      const empty = fields.filter((field) => !client?.fills?.[field.id]);
      const filled = fields.length - empty.length;
      const fillPercent = fields.length ? round1((filled / fields.length) * 100) : 0;
      return {
        engineer: client.engineer || "Não informado",
        clientName: client.clientName || "Não informado",
        clientCode: client.clientCode || "—",
        clientId: client.clientId,
        emptyFields: empty.map((field) => field.label).join(", ") || "—",
        emptyCount: empty.length,
        fillPercent,
      };
    })
    .filter((row) => row.emptyCount > 0)
    .sort(
      (a, b) => b.emptyCount - a.emptyCount || a.clientName.localeCompare(b.clientName, "pt-BR"),
    );
}

export function summarizeEpTable(clients = [], localFilters = {}) {
  const next = { ...defaultTableLocalFilters(), ...localFilters };
  const fields = catalogForLocalFilters(next);
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  const severity = normalizeEpUnfilledSeverity(next.severity);
  const grouped = groupByEngineer(clients);
  let engineers = sortEngineerRows(
    [...grouped.entries()].map(([name, rows]) => engineerCompleteness(name, rows, fields)),
  );
  if (engineer !== "all") engineers = engineers.filter((row) => row.engineer === engineer);
  if (severity !== "all") engineers = engineers.filter((row) => row.severity === severity);
  return engineers;
}

export function engineerSelectOptions(clients = []) {
  return [...new Set((clients || []).map((row) => row.engineer || "Não informado"))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
