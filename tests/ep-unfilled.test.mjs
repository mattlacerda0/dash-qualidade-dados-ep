import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EP_UNFILLED_CATALOG,
  EP_UNFILLED_MIN_PORTFOLIO,
  buildEpUnfilledClients,
  evaluateClientFills,
} from "../lib/ep-unfilled.mjs";
import {
  EP_UNFILLED_PRIORITY_CHART_LIMIT,
  EP_UNFILLED_PRIORITY_FIELD_IDS,
} from "../lib/catalog.mjs";
import {
  defaultEpUnfilledFilters,
  defaultTableLocalFilters,
  filterEpUnfilledClients,
  summarizeEmptyClients,
  summarizeEpTable,
  summarizeEpUnfilled,
  summarizeFieldTable,
  summarizePriorityFields,
} from "../lib/filters.mjs";

function fills(overrides = {}) {
  const base = Object.fromEntries(EP_UNFILLED_CATALOG.map((field) => [field.id, true]));
  return { ...base, ...overrides };
}

function client(partial) {
  return {
    clientId: "1",
    clientCode: "QV00001",
    clientName: "Ana",
    engineer: "EP A",
    program: "Pharus",
    analyticalStatus: "Ativo",
    fills: fills(),
    ...partial,
  };
}

test("catálogo cobre os domínios acordados", () => {
  const domains = new Set(EP_UNFILLED_CATALOG.map((field) => field.domain));
  for (const domain of ["Cliente", "Financeiro", "Jornada", "Reuniões", "Tarefas", "Mecanismos"]) {
    assert.ok(domains.has(domain), domain);
  }
  assert.ok(EP_UNFILLED_CATALOG.some((field) => field.id === "email"));
  assert.ok(EP_UNFILLED_CATALOG.some((field) => field.id === "has_financial"));
});

test("ficha financeira usa o registro mais recente", () => {
  const rows = buildEpUnfilledClients({
    clients: [
      {
        id: "1",
        codigo: "QV1",
        name: "Ana",
        engenheiro_patrimonial: "EP A",
        programa: "Pharus",
        status: "ativo",
      },
    ],
    financial: [
      { client_id: "1", ultima_renda_mensal: 1000, hub_link: "http://old", updated_at: "2024-01-01T00:00:00.000Z" },
      { client_id: "1", ultima_renda_mensal: null, hub_link: "http://new", updated_at: "2026-01-01T00:00:00.000Z" },
    ],
  });
  assert.equal(rows[0].fills.has_financial, true);
  assert.equal(rows[0].fills.ultima_renda_mensal, false);
  assert.equal(rows[0].fills.hub_link, true);
});

test("string vazia e financeiro ausente contam como vazio", () => {
  const rows = buildEpUnfilledClients({
    clients: [
      {
        id: "1",
        codigo: "QV1",
        name: "Ana",
        email: "   ",
        phone: "11999999999",
        engenheiro_patrimonial: "EP A",
        programa: "Pharus",
        status: "ativo",
      },
    ],
    financial: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fills.email, false);
  assert.equal(rows[0].fills.phone, true);
  assert.equal(rows[0].fills.has_financial, false);
  assert.equal(rows[0].fills.ultima_renda_mensal, false);
});

test("satélites 1:N entram como presença", () => {
  const context = {
    financial: new Map(),
    journeys: new Set(["1"]),
    journeyStages: new Set(),
    meetings: new Set(["1"]),
    checkpoints: new Set(),
    tasks: new Set(),
    mecanismos: new Set(["1"]),
    mecanismosImplemented: new Set(),
  };
  const result = evaluateClientFills({ id: "1", email: "a@a.com" }, context);
  assert.equal(result.has_journey, true);
  assert.equal(result.has_journey_stage, false);
  assert.equal(result.has_meeting, true);
  assert.equal(result.has_checkpoint, false);
  assert.equal(result.has_mechanism, true);
  assert.equal(result.has_mechanism_implemented, false);
});

test("filtro padrão é Ativos e troca o recorte", () => {
  assert.equal(defaultEpUnfilledFilters().status, "active");
  assert.equal(defaultEpUnfilledFilters().engineer, undefined);
  const rows = [
    client({ clientId: "1", analyticalStatus: "Ativo" }),
    client({ clientId: "2", clientName: "Bruno", analyticalStatus: "Cancelado" }),
    client({ clientId: "3", clientName: "Carla", analyticalStatus: "Congelado" }),
  ];
  assert.equal(filterEpUnfilledClients(rows, defaultEpUnfilledFilters()).length, 1);
  assert.equal(filterEpUnfilledClients(rows, { ...defaultEpUnfilledFilters(), status: "cancelled" }).length, 1);
  assert.equal(filterEpUnfilledClients(rows, { ...defaultEpUnfilledFilters(), status: "frozen" }).length, 1);
  assert.equal(filterEpUnfilledClients(rows, { ...defaultEpUnfilledFilters(), status: "all" }).length, 3);
});

test("universo vazio produz resumo zerado", () => {
  const summary = summarizeEpUnfilled([]);
  assert.equal(summary.totalClients, 0);
  assert.equal(summary.averageFill, 0);
  assert.equal(summary.rankedEngineers.length, 0);
  assert.equal(summarizeFieldTable([], defaultTableLocalFilters()).every((row) => row.totalRows === 0), true);
  assert.deepEqual(summarizeEpTable([], defaultTableLocalFilters()), []);
});

test("ranking de EP exige n mínimo e ordena pior completude primeiro", () => {
  const small = Array.from({ length: 3 }, (_, index) =>
    client({
      clientId: `s${index}`,
      engineer: "EP Pequeno",
      fills: fills({ email: false, phone: false }),
    }),
  );
  const good = Array.from({ length: EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
    client({
      clientId: `g${index}`,
      engineer: "EP Bom",
      fills: fills(),
    }),
  );
  const weak = Array.from({ length: EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
    client({
      clientId: `w${index}`,
      engineer: "EP Fraco",
      fills: fills({ email: false, phone: false, cpf: false, segmentacao: false }),
    }),
  );
  const summary = summarizeEpUnfilled([...small, ...good, ...weak]);
  assert.equal(summary.rankedEngineers[0].engineer, "EP Fraco");
  assert.ok(summary.rankedEngineers[0].completeness < summary.rankedEngineers[1].completeness);
  assert.ok(summary.engineers.some((row) => row.engineer === "EP Pequeno" && row.rankEligible === false));
  assert.ok(!summary.rankedEngineers.some((row) => row.engineer === "EP Pequeno"));
  assert.ok(summary.fields[0].missingPercent >= summary.fields[1].missingPercent);
});

test("filtros locais da tabela 4 não alteram a tabela 5", () => {
  const rows = [
    ...Array.from({ length: EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
      client({
        clientId: `a${index}`,
        engineer: "EP A",
        fills: fills({ email: false }),
      }),
    ),
    ...Array.from({ length: EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
      client({
        clientId: `b${index}`,
        clientName: "Bruno",
        engineer: "EP B",
        fills: fills({ phone: false }),
      }),
    ),
  ];
  const fieldOnlyA = summarizeFieldTable(rows, { ...defaultTableLocalFilters(), engineer: "EP A", field: "email" });
  const epOnlyB = summarizeEpTable(rows, { ...defaultTableLocalFilters(), engineer: "EP B" });
  assert.equal(fieldOnlyA.length, 1);
  assert.equal(fieldOnlyA[0].id, "email");
  assert.equal(fieldOnlyA[0].missing, EP_UNFILLED_MIN_PORTFOLIO);
  assert.equal(epOnlyB.length, 1);
  assert.equal(epOnlyB[0].engineer, "EP B");
  const fieldAll = summarizeFieldTable(rows, defaultTableLocalFilters());
  assert.ok(fieldAll.length > 1);
});

test("domínio e faixa recortam só a tabela pedida", () => {
  const rows = Array.from({ length: EP_UNFILLED_MIN_PORTFOLIO }, (_, index) =>
    client({
      clientId: `c${index}`,
      fills: fills({ email: false, has_financial: false }),
    }),
  );
  const finance = summarizeFieldTable(rows, { ...defaultTableLocalFilters(), domain: "Financeiro" });
  assert.ok(finance.every((row) => row.domain === "Financeiro"));
  const low = summarizeFieldTable(rows, { ...defaultTableLocalFilters(), field: "email", severity: "low" });
  assert.equal(low.length, 1);
  assert.equal(low[0].severity, "low");
  const highEmail = summarizeFieldTable(rows, { ...defaultTableLocalFilters(), field: "email", severity: "high" });
  assert.equal(highEmail.length, 0);
  const epDomain = summarizeEpTable(rows, { ...defaultTableLocalFilters(), domain: "Cliente", field: "email" });
  assert.equal(epDomain.length, 1);
  assert.ok(epDomain[0].completeness < 100);
});

test("campos principais são 16 IDs fechados e o gráfico ordena por lacuna", () => {
  assert.equal(EP_UNFILLED_PRIORITY_FIELD_IDS.length, 16);
  assert.equal(EP_UNFILLED_PRIORITY_CHART_LIMIT, 10);
  for (const id of EP_UNFILLED_PRIORITY_FIELD_IDS) {
    assert.ok(EP_UNFILLED_CATALOG.some((field) => field.id === id), id);
  }
  const rows = [
    client({ clientId: "1", fills: fills({ email: false, phone: false, cpf: false }) }),
    client({ clientId: "2", clientName: "Bruno", fills: fills({ email: false }) }),
  ];
  const priority = summarizePriorityFields(rows);
  assert.equal(priority.length, 16);
  assert.equal(priority[0].id, "email");
  assert.ok(priority[0].missingPercent >= priority[1].missingPercent);
  assert.equal(priority.slice(0, EP_UNFILLED_PRIORITY_CHART_LIMIT).length, 10);
});

test("detalhe por cliente lista vazios e isola filtros locais", () => {
  const rows = [
    client({
      clientId: "1",
      engineer: "EP A",
      fills: fills({ email: false, phone: false }),
    }),
    client({
      clientId: "2",
      clientName: "Bruno",
      clientCode: "QV00002",
      engineer: "EP B",
      fills: fills({ phone: false }),
    }),
    client({
      clientId: "3",
      clientName: "Carla",
      engineer: "EP A",
      fills: fills(),
    }),
  ];
  const all = summarizeEmptyClients(rows, defaultTableLocalFilters());
  assert.equal(all.length, 2);
  assert.equal(all[0].clientName, "Ana");
  assert.equal(all[0].emptyCount, 2);
  assert.match(all[0].emptyFields, /E-mail/);
  assert.ok(!all.some((row) => row.clientName === "Carla"));

  const onlyB = summarizeEmptyClients(rows, { ...defaultTableLocalFilters(), engineer: "EP B" });
  assert.equal(onlyB.length, 1);
  assert.equal(onlyB[0].engineer, "EP B");

  const onlyEmail = summarizeEmptyClients(rows, { ...defaultTableLocalFilters(), field: "email" });
  assert.equal(onlyEmail.length, 1);
  assert.equal(onlyEmail[0].clientName, "Ana");
  assert.equal(onlyEmail[0].emptyCount, 1);
});
