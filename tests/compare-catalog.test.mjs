import assert from "node:assert/strict";
import { test } from "node:test";
import { EP_UNFILLED_CATALOG } from "../lib/catalog.mjs";
import {
  buildCompareFillRows,
  intersectionCoreCatalog,
  intersectionQvCatalog,
  splitCompareCatalog,
  summarizeCompareFills,
} from "../lib/compare-catalog.mjs";
import { CORE_EP_UNFILLED_CATALOG } from "../lib/core-catalog.mjs";
import {
  defaultCoreGlobalFilters,
  defaultCoreTableLocalFilters,
  filterCoreEpUnfilledClients,
  summarizeCoreEpUnfilled,
  summarizeCoreFieldTable,
} from "../lib/core-filters.mjs";
import {
  defaultEpUnfilledFilters,
  defaultTableLocalFilters,
  filterEpUnfilledClients,
  summarizeEpUnfilled,
  summarizeFieldTable,
  summarizePriorityFields,
} from "../lib/filters.mjs";

const QV_ONLY_IDS = [
  "objetivo_principal",
  "segmentacao",
  "anotacoes",
  "drive_link",
  "hobbies",
  "nome_conjuge",
  "telefone_conjuge",
  "has_financial",
  "hub_link",
  "has_journey_stage",
  "has_task",
  "has_mechanism",
];

function qvFills(overrides = {}) {
  return { ...Object.fromEntries(EP_UNFILLED_CATALOG.map((field) => [field.id, true])), ...overrides };
}

function coreFills(overrides = {}) {
  return { ...Object.fromEntries(CORE_EP_UNFILLED_CATALOG.map((field) => [field.id, true])), ...overrides };
}

function qvClient(partial = {}) {
  return {
    clientId: "1",
    clientCode: "QV00001",
    clientName: "Ana",
    engineer: "EP A",
    program: "Pharus",
    analyticalStatus: "Ativo",
    fills: qvFills(),
    ...partial,
  };
}

function coreClient(partial = {}) {
  return {
    clientId: "u1",
    clientCode: "u1",
    clientName: "Ana",
    engineer: "EP A",
    registrationStatus: "registered",
    fills: coreFills(),
    ...partial,
  };
}

test("split estável: exclusivos e interseção a partir dos catálogos atuais", () => {
  const split = splitCompareCatalog();
  assert.deepEqual(split.onlyQv.map((field) => field.id).sort(), [...QV_ONLY_IDS].sort());
  assert.deepEqual(split.onlyPharus.map((field) => field.id), ["contract_signed"]);
  assert.equal(split.intersection.length, 17);
  assert.ok(split.intersection.every((pair) => pair.qvId && pair.coreId && pair.label && pair.domain));
  assert.equal(split.intersection.find((pair) => pair.qvId === "email")?.coreId, "alternative_email");
  assert.equal(split.intersection.find((pair) => pair.qvId === "has_mechanism_implemented")?.coreId, "has_mechanism_status");
  assert.equal(split.intersection.find((pair) => pair.qvId === "data_inicio_ciclo")?.coreId, "cycle_start");
});

test("parte 3 não inclui objetivo_principal nem contract_signed", () => {
  const qvFields = intersectionQvCatalog();
  const coreFields = intersectionCoreCatalog();
  assert.equal(qvFields.some((field) => field.id === "objetivo_principal"), false);
  assert.equal(coreFields.some((field) => field.id === "contract_signed"), false);
  assert.equal(qvFields.some((field) => field.id === "email"), true);
  assert.equal(coreFields.some((field) => field.id === "alternative_email"), true);
  const qvSummary = summarizeEpUnfilled([qvClient()], qvFields);
  const coreSummary = summarizeCoreEpUnfilled([coreClient()], coreFields);
  assert.equal(qvSummary.fields.some((row) => row.id === "objetivo_principal"), false);
  assert.equal(coreSummary.fields.some((row) => row.id === "contract_signed"), false);
  assert.equal(qvSummary.fieldCount, qvFields.length);
  assert.equal(coreSummary.fieldCount, coreFields.length);
});

test("catálogo filtrado recorta resumo, tabela e campos principais", () => {
  const qvFields = intersectionQvCatalog();
  const rows = [
    qvClient({ fills: qvFills({ email: false, objetivo_principal: false, phone: false }) }),
    qvClient({ clientId: "2", clientName: "Bruno", fills: qvFills({ email: false }) }),
  ];
  const full = summarizeEpUnfilled(rows);
  const filtered = summarizeEpUnfilled(rows, qvFields);
  assert.ok(full.fields.some((row) => row.id === "objetivo_principal"));
  assert.equal(filtered.fields.some((row) => row.id === "objetivo_principal"), false);
  assert.ok(filtered.fieldCount < full.fieldCount);
  const table = summarizeFieldTable(rows, defaultTableLocalFilters(), qvFields);
  assert.equal(table.some((row) => row.id === "objetivo_principal"), false);
  const priority = summarizePriorityFields(rows, qvFields);
  assert.equal(priority.some((row) => row.id === "objetivo_principal"), false);
  assert.ok(priority.some((row) => row.id === "email"));
});

test("filtros de cada fonte recortam só a própria carteira", () => {
  const qvRows = [
    qvClient({ fills: qvFills({ email: false }) }),
    qvClient({ clientId: "2", analyticalStatus: "Cancelado", fills: qvFills({ phone: false }) }),
  ];
  const coreRows = [
    coreClient({ fills: coreFills({ alternative_email: false, contract_signed: false }) }),
    coreClient({ clientId: "u2", registrationStatus: "unregistered", fills: coreFills({ phone: false }) }),
  ];
  const qvClients = filterEpUnfilledClients(qvRows, defaultEpUnfilledFilters());
  const coreClients = filterCoreEpUnfilledClients(coreRows, defaultCoreGlobalFilters());
  const qvSummary = summarizeEpUnfilled(qvClients, intersectionQvCatalog());
  const coreSummary = summarizeCoreEpUnfilled(coreClients, intersectionCoreCatalog());
  assert.equal(qvClients.length, 1);
  assert.equal(coreClients.length, 2);
  assert.ok(qvSummary.fields.some((row) => row.id === "email"));
  assert.ok(coreSummary.fields.some((row) => row.id === "alternative_email"));
  assert.equal(qvSummary.fields.some((row) => row.id === "alternative_email"), false);
  assert.equal(coreSummary.fields.some((row) => row.id === "email"), false);
  assert.equal(coreSummary.fields.some((row) => row.id === "contract_signed"), false);
});

test("buildCompareFillRows casa o par conceitual e calcula delta Pharus − QV", () => {
  const qvRows = [qvClient({ fills: qvFills({ email: false }) })];
  const coreRows = [coreClient({ fills: coreFills({ alternative_email: true, phone: false }) })];
  const qvFields = summarizeFieldTable(qvRows, defaultTableLocalFilters(), intersectionQvCatalog());
  const coreFields = summarizeCoreFieldTable(coreRows, defaultCoreTableLocalFilters(), intersectionCoreCatalog());
  const compared = buildCompareFillRows(qvFields, coreFields);
  assert.equal(compared.some((row) => row.id === "objetivo_principal"), false);
  assert.equal(compared.some((row) => row.coreId === "contract_signed"), false);
  const email = compared.find((row) => row.id === "email");
  const phone = compared.find((row) => row.id === "phone");
  assert.equal(email.coreId, "alternative_email");
  assert.equal(email.qvFillPercent, 0);
  assert.equal(email.pharusFillPercent, 100);
  assert.equal(email.delta, 100);
  assert.equal(phone.qvFillPercent, 100);
  assert.equal(phone.pharusFillPercent, 0);
  assert.equal(phone.delta, -100);
  const summary = summarizeCompareFills(compared);
  assert.equal(summary.fieldCount, 17);
  assert.ok(summary.qvAhead >= 1);
  assert.ok(summary.pharusAhead >= 1);
});
