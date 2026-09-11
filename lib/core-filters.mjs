/**
 * Filtros e agregações — Dados não preenchidos por EP no App Pharus/Core.
 */
import { matchesSearch } from "./search.mjs";
import {
  CORE_EP_UNFILLED_CATALOG,
  CORE_EP_UNFILLED_DOMAINS,
  CORE_EP_UNFILLED_MIN_PORTFOLIO,
  CORE_EP_UNFILLED_PRIORITY_FIELD_IDS,
  CORE_EP_UNFILLED_SEVERITY_OPTIONS,
  CORE_EP_UNFILLED_STATUS_OPTIONS,
} from "./core-catalog.mjs";

export const DEFAULT_CORE_STATUS_FILTER = "all";

const ALLOWED_STATUS = new Set(CORE_EP_UNFILLED_STATUS_OPTIONS.map((item) => item.value));
const ALLOWED_DOMAINS = new Set(CORE_EP_UNFILLED_DOMAINS);
const ALLOWED_SEVERITY = new Set(CORE_EP_UNFILLED_SEVERITY_OPTIONS.map((item) => item.value));
const CATALOG_IDS = new Set(CORE_EP_UNFILLED_CATALOG.map((field) => field.id));

export function defaultCoreGlobalFilters() {
  return {
    search: "",
    engineer: "all",
    status: DEFAULT_CORE_STATUS_FILTER,
  };
}

export function defaultCoreTableLocalFilters() {
  return {
    engineer: "all",
    domain: "all",
    field: "all",
    severity: "all",
  };
}

export function normalizeCoreStatus(value) {
  return ALLOWED_STATUS.has(value) ? value : DEFAULT_CORE_STATUS_FILTER;
}

export function normalizeCoreDomain(value) {
  if (!value || value === "all") return "all";
  return ALLOWED_DOMAINS.has(value) ? value : "all";
}

export function normalizeCoreSeverity(value) {
  if (!value || value === "all") return "all";
  return ALLOWED_SEVERITY.has(value) ? value : "all";
}

export function normalizeCoreField(value) {
  if (!value || value === "all") return "all";
  return CATALOG_IDS.has(value) ? value : "all";
}

function resolveCoreCatalog(fields) {
  return Array.isArray(fields) ? fields : CORE_EP_UNFILLED_CATALOG;
}

export function visibleCoreCatalogFields(domain = "all", fields) {
  const selected = normalizeCoreDomain(domain);
  const catalog = resolveCoreCatalog(fields);
  if (selected === "all") return catalog;
  return catalog.filter((field) => field.domain === selected);
}

export function coreCatalogForLocalFilters(localFilters = {}, fields) {
  const next = { ...defaultCoreTableLocalFilters(), ...localFilters };
  let scoped = visibleCoreCatalogFields(next.domain, fields);
  const fieldId = normalizeCoreField(next.field);
  if (fieldId !== "all") scoped = scoped.filter((field) => field.id === fieldId);
  return scoped;
}

export function coreFieldSelectOptions(domain = "all", fields) {
  return visibleCoreCatalogFields(domain, fields).map((field) => ({ value: field.id, label: field.label }));
}

function matchesStatusFilter(row, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  return row?.registrationStatus === filterKey;
}

export function filterCoreEpUnfilledClients(clients = [], filters = {}) {
  const next = { ...defaultCoreGlobalFilters(), ...filters };
  const status = normalizeCoreStatus(next.status);
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  return (Array.isArray(clients) ? clients : []).filter((row) => {
    if (!matchesStatusFilter(row, status)) return false;
    if (engineer !== "all" && String(row.engineer || "Não informado") !== engineer) return false;
    if (!matchesSearch(row, next.search)) return false;
    return true;
  });
}

function round1(value) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function coreFillSeverity(fillPercent) {
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
  const severity = coreFillSeverity(fillPercent);
  return {
    id: field.id,
    domain: field.domain,
    label: field.label,
    coreField: `${field.coreTable}.${field.coreField}`,
    baseqvField: `${field.baseqvTable}.${field.baseqvField}`,
    correlationType: field.correlationType,
    totalRows: total,
    filled,
    missing,
    fillPercent,
    missingPercent,
    severity: severity.key,
    severityLabel: severity.label,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

function sortFieldRows(rows) {
  return [...rows].sort((a, b) => b.missingPercent - a.missingPercent || a.label.localeCompare(b.label, "pt-BR"));
}

function engineerCompleteness(engineer, clients, fields) {
  const fieldRows = fields.map((field) => fieldCoverage(clients, field));
  const completeness = fieldRows.length
    ? round1(fieldRows.reduce((sum, row) => sum + row.fillPercent, 0) / fieldRows.length)
    : 0;
  const worst = sortFieldRows(fieldRows)[0] || null;
  const severity = coreFillSeverity(completeness);
  return {
    engineer,
    totalClients: clients.length,
    completeness,
    missingPercent: round1(100 - completeness),
    worstField: worst?.label || "—",
    worstFieldId: worst?.id || null,
    worstFillPercent: worst?.fillPercent ?? null,
    rankEligible: clients.length >= CORE_EP_UNFILLED_MIN_PORTFOLIO,
    severity: severity.key,
    severityLabel: severity.label,
  };
}

function sortEngineerRows(rows) {
  return [...rows].sort(
    (a, b) => a.completeness - b.completeness || b.totalClients - a.totalClients || a.engineer.localeCompare(b.engineer, "pt-BR"),
  );
}

export function summarizeCoreEpUnfilled(clients = [], fields) {
  const catalog = visibleCoreCatalogFields("all", fields);
  const fieldRows = sortFieldRows(catalog.map((field) => fieldCoverage(clients, field)));
  const engineers = sortEngineerRows(
    [...groupByEngineer(clients).entries()].map(([name, rows]) => engineerCompleteness(name, rows, catalog)),
  );
  const eligible = engineers.filter((row) => row.rankEligible);
  const medianCompleteness = eligible.length ? round1(median(eligible.map((row) => row.completeness))) : null;
  return {
    totalClients: clients.length,
    fieldCount: fieldRows.length,
    averageFill: fieldRows.length ? round1(fieldRows.reduce((sum, row) => sum + row.fillPercent, 0) / fieldRows.length) : 0,
    lowFillFieldCount: fieldRows.filter((row) => row.fillPercent < 60).length,
    engineersBelowMedian: medianCompleteness == null ? 0 : eligible.filter((row) => row.completeness < medianCompleteness).length,
    eligibleEngineerCount: eligible.length,
    medianCompleteness,
    fields: fieldRows,
    topMissingFields: fieldRows.slice(0, 10),
    engineers,
    rankedEngineers: eligible,
  };
}

export function summarizeCoreFieldTable(clients = [], localFilters = {}, fields) {
  const next = { ...defaultCoreTableLocalFilters(), ...localFilters };
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  const scoped = engineer === "all" ? clients : clients.filter((row) => String(row.engineer || "Não informado") === engineer);
  const severity = normalizeCoreSeverity(next.severity);
  return sortFieldRows(coreCatalogForLocalFilters(next, fields).map((field) => fieldCoverage(scoped, field))).filter(
    (row) => severity === "all" || row.severity === severity,
  );
}

export function summarizeCorePriorityFields(clients = [], fields) {
  const catalog = resolveCoreCatalog(fields);
  const byId = new Map(catalog.map((field) => [field.id, field]));
  return sortFieldRows(CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.map((id) => byId.get(id)).filter(Boolean).map((field) => fieldCoverage(clients, field)));
}

export function summarizeCoreEpTable(clients = [], localFilters = {}, fields) {
  const next = { ...defaultCoreTableLocalFilters(), ...localFilters };
  const catalog = coreCatalogForLocalFilters(next, fields);
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  const severity = normalizeCoreSeverity(next.severity);
  let engineers = sortEngineerRows(
    [...groupByEngineer(clients).entries()].map(([name, rows]) => engineerCompleteness(name, rows, catalog)),
  );
  if (engineer !== "all") engineers = engineers.filter((row) => row.engineer === engineer);
  if (severity !== "all") engineers = engineers.filter((row) => row.severity === severity);
  return engineers;
}

export function summarizeCoreEmptyClients(clients = [], localFilters = {}, fields) {
  const next = { ...defaultCoreTableLocalFilters(), ...localFilters };
  const catalog = coreCatalogForLocalFilters(next, fields);
  const engineer = next.engineer && next.engineer !== "all" ? String(next.engineer) : "all";
  const scoped = engineer === "all" ? clients : clients.filter((row) => String(row.engineer || "Não informado") === engineer);
  return scoped
    .map((client) => {
      const empty = catalog.filter((field) => !client?.fills?.[field.id]);
      const filled = catalog.length - empty.length;
      return {
        engineer: client.engineer || "Não informado",
        clientName: client.clientName || "Não informado",
        clientCode: client.clientCode || "—",
        clientId: client.clientId,
        emptyFields: empty.map((field) => field.label).join(", ") || "—",
        emptyCount: empty.length,
        fillPercent: catalog.length ? round1((filled / catalog.length) * 100) : 0,
      };
    })
    .filter((row) => row.emptyCount > 0)
    .sort((a, b) => b.emptyCount - a.emptyCount || a.clientName.localeCompare(b.clientName, "pt-BR"));
}

export function coreEngineerSelectOptions(clients = []) {
  return [...new Set((clients || []).map((row) => row.engineer || "Não informado"))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
