import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CORE_EP_UNFILLED_CATALOG,
  CORE_EP_UNFILLED_MIN_PORTFOLIO,
  buildCoreEpUnfilledClients,
  evaluateCoreClientFills,
} from "../lib/core-ep-unfilled.mjs";
import {
  CORE_EP_UNFILLED_PRIORITY_FIELD_IDS,
} from "../lib/core-catalog.mjs";
import {
  defaultCoreGlobalFilters,
  defaultCoreClientTableFilters,
  defaultCoreTableLocalFilters,
  filterCoreEpUnfilledClients,
  summarizeCoreEmptyClients,
  summarizeCoreEpTable,
  summarizeCoreEpUnfilled,
  summarizeCoreFieldTable,
  summarizeCorePriorityFields,
} from "../lib/core-filters.mjs";
import { summarizeCoreEmptyClients as summarizeBrowserCoreEmptyClients } from "../public/lib/core-filters.mjs";

function fullContext(overrides = {}) {
  return {
    personal: new Map([["u1", { user_id: "u1", phone: "11", cpf: "123", occupation: "Engenheira", birth_date: "1990-01-01", city: "São Paulo", uf: "SP", alternative_email: "a@b.com" }]]),
    engines: new Map([["u1", { user_id: "u1", income: 1, reserve: 1, contribution: 1 }]]),
    preRegistrations: new Set(),
    formSubmissions: new Set(["u1"]),
    scheduledMeetings: new Set(["u1"]),
    meetingNotes: new Set(["u1"]),
    mechanismStatuses: new Set(["u1"]),
    realEstateValues: new Set(["u1"]),
    cycleStarts: new Set(["u1"]),
    cycleEnds: new Set(["u1"]),
    contractsSigned: new Set(["u1"]),
    ...overrides,
  };
}

function fills(overrides = {}) {
  const base = Object.fromEntries(CORE_EP_UNFILLED_CATALOG.map((field) => [field.id, true]));
  return { ...base, ...overrides };
}

function client(partial = {}) {
  return {
    clientId: "u1",
    clientCode: "u1",
    clientName: "Cliente",
    engineer: "EP A",
    registrationStatus: "registered",
    fills: fills(),
    ...partial,
  };
}

test("catálogo Core contém apenas correlações aceitas", () => {
  const allowed = new Set(["direta", "equivalente", "derivada"]);
  assert.ok(CORE_EP_UNFILLED_CATALOG.length > 0);
  for (const field of CORE_EP_UNFILLED_CATALOG) {
    assert.ok(allowed.has(field.correlationType), field.id);
    assert.ok(field.coreTable && field.coreField, field.id);
    assert.ok(field.baseqvTable && field.baseqvField, field.id);
  }
  assert.equal(CORE_EP_UNFILLED_CATALOG.some((field) => field.correlationType === "sem correspondencia"), false);
});

test("campos 1:1 tratam null e string vazia como vazio", () => {
  const result = evaluateCoreClientFills({ userId: "u1" }, fullContext({
    personal: new Map([["u1", { user_id: "u1", phone: " ", cpf: null, occupation: "Arquiteta", birth_date: "1990-01-01", city: "", uf: "SP" }]]),
    engines: new Map([["u1", { user_id: "u1", income: null, reserve: 100, contribution: 0 }]]),
  }));
  assert.equal(result.phone, false);
  assert.equal(result.cpf, false);
  assert.equal(result.occupation, true);
  assert.equal(result.city, false);
  assert.equal(result.uf, true);
  assert.equal(result.income, false);
  assert.equal(result.reserve, true);
  assert.equal(result.contribution, true);
});

test("campos 1:N contam como preenchidos quando existe registro válido", () => {
  const result = evaluateCoreClientFills({ userId: "u1" }, fullContext());
  assert.equal(result.has_journey, true);
  assert.equal(result.has_meeting, true);
  assert.equal(result.has_checkpoint, true);
  assert.equal(result.has_mechanism_status, true);
  assert.equal(result.real_estate_market_value, true);
  assert.equal(result.contract_signed, true);
});

test("denominador por EP usa clientes distintos alocados", () => {
  const rows = buildCoreEpUnfilledClients({
    allocations: [
      { customer_id: "u1", internal_id: "i1" },
      { customer_id: "u1", internal_id: "i1" },
      { customer_id: "u2", internal_id: "i1" },
    ],
    internals: [{ internal_id: "i1", name: "EP A" }],
    personalInfo: [{ user_id: "u1", name: "Ana", cpf: "1" }, { user_id: "u2", name: "Bruno" }],
  });
  const summary = summarizeCoreEpUnfilled(rows);
  assert.equal(rows.length, 2);
  assert.equal(summary.engineers[0].totalClients, 2);
});

test("fallback de alocação usa dados do core quando backoffice não está disponível", () => {
  const rows = buildCoreEpUnfilledClients({
    allocations: [],
    internals: [],
    scheduledMeetings: [
      { user_id: "u1", status: "done", advisor_internal_id: "11111111-2222-3333-4444-555555555555" },
      { user_id: "u1", status: "done", advisor_internal_id: "11111111-2222-3333-4444-555555555555" },
      { user_id: "u2", status: "scheduled", advisor_internal_id: "11111111-2222-3333-4444-555555555555" },
    ],
    personalInfo: [{ user_id: "u1", name: "Ana" }, { user_id: "u2", name: "Bruno" }],
  });
  const summary = summarizeCoreEpUnfilled(rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].engineer, "EP 11111111");
  assert.equal(summary.engineers[0].totalClients, 2);
});

test("remove EP excluído do recorte Core/Pharus", () => {
  const rows = buildCoreEpUnfilledClients({
    allocations: [
      { customer_id: "u1", internal_id: "i1" },
      { customer_id: "u2", internal_id: "i2" },
      { customer_id: "u3", internal_id: "i3" },
    ],
    internals: [
      { internal_id: "i1", name: "Raphael R. D'Avila" },
      { internal_id: "i2", name: "EP Mantido" },
      { internal_id: "i3", name: "Engenheiro Patrimonial Teste" },
    ],
    personalInfo: [
      { user_id: "u1", name: "Cliente removido" },
      { user_id: "u2", name: "Cliente mantido" },
      { user_id: "u3", name: "Cliente teste" },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].engineer, "EP Mantido");
});

test("sem alocação ou fonte cliente-EP não monta universo artificial", () => {
  const rows = buildCoreEpUnfilledClients({
    allocations: [],
    internals: [],
    personalInfo: [{ user_id: "u1", name: "Ana", cpf: "123", phone: "11999999999" }],
  });
  assert.equal(rows.length, 0);
});

test("filtros e agregações mantêm comportamento da tela BaseQV", () => {
  const rows = [
    ...Array.from({ length: CORE_EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
      client({ clientId: `a${index}`, engineer: "EP A", fills: fills({ phone: false }) }),
    ),
    ...Array.from({ length: CORE_EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
      client({ clientId: `b${index}`, clientName: "Bruno", engineer: "EP B", registrationStatus: "contract", fills: fills({ cpf: false, income: false }) }),
    ),
  ];
  assert.equal(filterCoreEpUnfilledClients(rows, { ...defaultCoreGlobalFilters(), engineer: "EP B" }).length, CORE_EP_UNFILLED_MIN_PORTFOLIO);
  assert.equal(filterCoreEpUnfilledClients(rows, { ...defaultCoreGlobalFilters(), status: "contract" }).length, CORE_EP_UNFILLED_MIN_PORTFOLIO);
  assert.equal(summarizeCoreFieldTable(rows, { ...defaultCoreTableLocalFilters(), field: "phone" })[0].missing, CORE_EP_UNFILLED_MIN_PORTFOLIO);
  assert.equal(summarizeCoreEpTable(rows, { ...defaultCoreTableLocalFilters(), engineer: "EP A" }).length, 1);
  assert.ok(summarizeCoreEmptyClients(rows, { ...defaultCoreTableLocalFilters(), field: "cpf" }).every((row) => row.engineer === "EP B"));
});

test("campos principais pertencem ao catálogo e ordenam por lacuna", () => {
  assert.equal(CORE_EP_UNFILLED_CATALOG.length, 18);
  assert.equal(CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.length, 15);
  assert.ok(!CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.includes("phone"));
  for (const id of CORE_EP_UNFILLED_PRIORITY_FIELD_IDS) {
    assert.ok(CORE_EP_UNFILLED_CATALOG.some((field) => field.id === id), id);
  }
  const rows = [
    client({ clientId: "u1", fills: fills({ phone: false, cpf: false }) }),
    client({ clientId: "u2", fills: fills({ phone: false }) }),
  ];
  const priority = summarizeCorePriorityFields(rows);
  assert.equal(priority[0].id, "cpf");
  assert.ok(!priority.some((row) => row.id === "phone"));
  assert.ok(priority[0].missingPercent >= priority[1].missingPercent);
});

test("lacunas do cliente separam principais dos demais e mantêm completude global", () => {
  const rows = [client({ fills: fills({ cpf: false, phone: false, alternative_email: false, cycle_end: false }) })];
  const [all] = summarizeCoreEmptyClients(rows);
  assert.equal(all.priorityEmptyFields, "CPF");
  assert.equal(all.priorityEmptyCount, 1);
  assert.equal(all.otherEmptyFields, "Telefone, E-mail alternativo, Fim do ciclo");
  assert.equal(all.otherEmptyCount, 3);
  assert.equal(all.emptyCount, 4);
  assert.equal(all.fillPercent, 77.8);

  const [filtered] = summarizeCoreEmptyClients(rows, { field: "phone" });
  assert.equal(filtered.priorityEmptyCount, 0);
  assert.equal(filtered.otherEmptyCount, 1);
  assert.equal(filtered.emptyCount, 1);
  assert.equal(filtered.fillPercent, 77.8);
  assert.deepEqual(summarizeBrowserCoreEmptyClients(rows, { field: "phone" }), [filtered]);
});

test("detalhe Core inicia em campos dos indicadores e alterna para todos", () => {
  const rows = [client({ fills: fills({ cpf: false, phone: false, alternative_email: false }) })];
  const defaults = defaultCoreClientTableFilters();
  assert.equal(defaults.scope, "indicators");
  const [indicators] = summarizeCoreEmptyClients(rows, defaults);
  assert.equal(indicators.priorityEmptyCount, 1);
  assert.equal(indicators.otherEmptyCount, 0);
  assert.equal(indicators.emptyCount, 1);
  const [all] = summarizeCoreEmptyClients(rows, { ...defaults, scope: "all" });
  assert.equal(all.otherEmptyFields, "Telefone, E-mail alternativo");
  assert.equal(all.otherEmptyCount, 2);
  assert.equal(all.emptyCount, 3);
  assert.equal(all.fillPercent, indicators.fillPercent);
  assert.deepEqual(summarizeBrowserCoreEmptyClients(rows, defaults), [indicators]);
  assert.deepEqual(summarizeBrowserCoreEmptyClients(rows, { ...defaults, scope: "all" }), [all]);
});

test("tabelas Core de campos e EPs usam o mesmo recorte de indicadores", () => {
  const rows = [client({ fills: fills({ cpf: false, phone: false, alternative_email: false }) })];
  const indicators = defaultCoreClientTableFilters();
  const all = { ...indicators, scope: "all" };
  assert.equal(summarizeCoreFieldTable(rows, indicators).length, CORE_EP_UNFILLED_PRIORITY_FIELD_IDS.length);
  assert.equal(summarizeCoreFieldTable(rows, all).length, CORE_EP_UNFILLED_CATALOG.length);
  assert.equal(summarizeCoreFieldTable(rows, indicators).some((row) => row.id === "alternative_email"), false);
  assert.equal(summarizeCoreFieldTable(rows, indicators).some((row) => row.id === "phone"), false);
  assert.equal(summarizeCoreFieldTable(rows, all).some((row) => row.id === "alternative_email"), true);
  assert.ok(summarizeCoreEpTable(rows, indicators)[0].completeness > summarizeCoreEpTable(rows, all)[0].completeness);
});

test("ranking principal Core por EP ignora telefone", () => {
  const rows = Array.from({ length: CORE_EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
    client({ clientId: `rank${index}`, fills: fills({ contract_signed: false, phone: false }) }),
  );
  const [ranked] = summarizeCoreEpTable(rows, { scope: "indicators" }).filter((row) => row.rankEligible);
  assert.equal(ranked.worstField, "Contrato assinado");
  assert.ok(ranked.completeness > summarizeCoreEpTable(rows, { scope: "all" })[0].completeness);
});
