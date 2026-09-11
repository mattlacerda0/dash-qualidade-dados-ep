/**
 * Split Base QV × Pharus a partir dos catálogos atuais.
 * Interseção: item Core cujo baseqvField (ou id) existe no catálogo QV (id ou column).
 */
import { EP_UNFILLED_CATALOG } from "./catalog.mjs";
import { CORE_EP_UNFILLED_CATALOG } from "./core-catalog.mjs";

function qvLookupKeys(field) {
  return [field.id, field.column].filter(Boolean);
}

function findQvMatch(coreField, qvByKey) {
  const candidates = [coreField.baseqvField, coreField.id].filter(Boolean);
  for (const key of candidates) {
    const match = qvByKey.get(key);
    if (match) return match;
  }
  return null;
}

export function splitCompareCatalog(qvCatalog = EP_UNFILLED_CATALOG, coreCatalog = CORE_EP_UNFILLED_CATALOG) {
  const qvByKey = new Map();
  for (const field of qvCatalog) {
    for (const key of qvLookupKeys(field)) {
      if (!qvByKey.has(key)) qvByKey.set(key, field);
    }
  }

  const intersection = [];
  const matchedQvIds = new Set();
  const matchedCoreIds = new Set();

  for (const coreField of coreCatalog) {
    const qvField = findQvMatch(coreField, qvByKey);
    if (!qvField) continue;
    intersection.push({
      id: qvField.id,
      label: qvField.label,
      domain: qvField.domain,
      qvId: qvField.id,
      coreId: coreField.id,
    });
    matchedQvIds.add(qvField.id);
    matchedCoreIds.add(coreField.id);
  }

  return {
    intersection,
    onlyQv: qvCatalog.filter((field) => !matchedQvIds.has(field.id)),
    onlyPharus: coreCatalog.filter((field) => !matchedCoreIds.has(field.id)),
  };
}

export function intersectionQvCatalog(split = splitCompareCatalog()) {
  const ids = new Set(split.intersection.map((pair) => pair.qvId));
  return EP_UNFILLED_CATALOG.filter((field) => ids.has(field.id));
}

export function intersectionCoreCatalog(split = splitCompareCatalog()) {
  const ids = new Set(split.intersection.map((pair) => pair.coreId));
  return CORE_EP_UNFILLED_CATALOG.filter((field) => ids.has(field.id));
}

export function otherFillLookup(source, otherFieldRows = [], split = splitCompareCatalog()) {
  const otherById = new Map(otherFieldRows.map((row) => [row.id, row]));
  const lookup = new Map();
  for (const pair of split.intersection) {
    if (source === "pharus") {
      lookup.set(pair.coreId, otherById.get(pair.qvId)?.fillPercent ?? null);
    } else {
      lookup.set(pair.qvId, otherById.get(pair.coreId)?.fillPercent ?? null);
    }
  }
  return lookup;
}

export function attachOtherFill(fieldRows = [], source = "qv", otherFieldRows = [], split = splitCompareCatalog()) {
  const lookup = otherFillLookup(source, otherFieldRows, split);
  return fieldRows.map((row) => ({
    ...row,
    otherFillPercent: lookup.get(row.id) ?? null,
  }));
}

function round1(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 10) / 10;
}

export function buildCompareFillRows(qvFieldRows = [], pharusFieldRows = [], split = splitCompareCatalog()) {
  const qvById = new Map(qvFieldRows.map((row) => [row.id, row]));
  const pharusById = new Map(pharusFieldRows.map((row) => [row.id, row]));
  return split.intersection.map((pair) => {
    const qvFillPercent = qvById.get(pair.qvId)?.fillPercent ?? null;
    const pharusFillPercent = pharusById.get(pair.coreId)?.fillPercent ?? null;
    const delta = qvFillPercent == null || pharusFillPercent == null
      ? null
      : round1(pharusFillPercent - qvFillPercent);
    return {
      id: pair.id,
      label: pair.label,
      domain: pair.domain,
      qvId: pair.qvId,
      coreId: pair.coreId,
      qvFillPercent,
      pharusFillPercent,
      delta,
    };
  });
}

export function summarizeCompareFills(rows = []) {
  const withBoth = rows.filter((row) => Number.isFinite(row.qvFillPercent) && Number.isFinite(row.pharusFillPercent));
  const average = (key) => (
    withBoth.length
      ? round1(withBoth.reduce((sum, row) => sum + Number(row[key]), 0) / withBoth.length)
      : 0
  );
  return {
    fieldCount: rows.length,
    qvAverage: average("qvFillPercent") ?? 0,
    pharusAverage: average("pharusFillPercent") ?? 0,
    qvAhead: withBoth.filter((row) => row.qvFillPercent > row.pharusFillPercent).length,
    pharusAhead: withBoth.filter((row) => row.pharusFillPercent > row.qvFillPercent).length,
    tied: withBoth.filter((row) => row.qvFillPercent === row.pharusFillPercent).length,
  };
}
