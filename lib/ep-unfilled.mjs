/**
 * Completude cadastral por EP — BASE QV somente leitura.
 * Atribuição: clients.engenheiro_patrimonial atual.
 */
import { dataConfigurationError } from "./env.mjs";
import { fetchAllRows } from "./data/supabase-rest.mjs";
import {
  ANALYTICAL_CANCEL_SELECT,
  buildAnalyticalCancellationMap,
  resolveAnalyticalStatusFromMaps,
} from "./analytical-cancellation.mjs";
import { excludedClientIds, filterExcludedClients } from "./exclusions.mjs";
import { resolveClientProgram } from "./program.mjs";
import { isMissingFieldValue } from "./missing.mjs";
import { EP_UNFILLED_CATALOG } from "./catalog.mjs";

export {
  EP_UNFILLED_CATALOG,
  EP_UNFILLED_DOMAINS,
  EP_UNFILLED_MIN_PORTFOLIO,
  EP_UNFILLED_STATUS_OPTIONS,
} from "./catalog.mjs";

const CLIENT_SELECT = [
  "id",
  "codigo",
  "name",
  "email",
  "phone",
  "cpf",
  "data_inicio_ciclo",
  "data_fim_ciclo",
  "data_aniversario",
  "profissao",
  "objetivo_principal",
  "segmentacao",
  "anotacoes",
  "drive_link",
  "hobbies",
  "nome_conjuge",
  "telefone_conjuge",
  "cidade",
  "estado",
  "engenheiro_patrimonial",
  "programa",
  "status",
  "davos_contrato_assinado",
].join(",");

const FINANCIAL_SELECT =
  "client_id,ultima_renda_mensal,ultimo_aporte,reserva_liquidez,valor_imoveis_quitados,hub_link,updated_at";

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function labelOrUnknown(value) {
  return blankToNull(value) ?? "Não informado";
}

function clientKey(value) {
  const raw = blankToNull(value);
  return raw == null ? "" : String(raw);
}

function latestByClient(rows, pick) {
  const map = new Map();
  const stamps = new Map();
  for (const row of rows || []) {
    const id = clientKey(row.client_id);
    if (!id) continue;
    const stamp = Date.parse(row.updated_at || "") || 0;
    if (!map.has(id) || stamp >= (stamps.get(id) || 0)) {
      map.set(id, pick(row));
      stamps.set(id, stamp);
    }
  }
  return map;
}

function setByClient(rows) {
  const set = new Set();
  for (const row of rows || []) {
    const id = clientKey(row.client_id);
    if (id) set.add(id);
  }
  return set;
}

function presenceFromFinancial(row, field) {
  if (!row) return false;
  return !isMissingFieldValue(row[field.column], Boolean(field.includeBlank));
}

export function evaluateClientFills(client, context) {
  const id = clientKey(client.id);
  const financial = context.financial.get(id) || null;
  const fills = {};
  for (const field of EP_UNFILLED_CATALOG) {
    if (field.source === "financial") {
      fills[field.id] = presenceFromFinancial(financial, field);
      continue;
    }
    if (field.column && !field.kind) {
      fills[field.id] = !isMissingFieldValue(client[field.column], Boolean(field.includeBlank));
      continue;
    }
    if (field.id === "has_financial") fills[field.id] = Boolean(financial);
    else if (field.id === "has_journey") fills[field.id] = context.journeys.has(id);
    else if (field.id === "has_journey_stage") fills[field.id] = context.journeyStages.has(id);
    else if (field.id === "has_meeting") fills[field.id] = context.meetings.has(id);
    else if (field.id === "has_checkpoint") fills[field.id] = context.checkpoints.has(id);
    else if (field.id === "has_task") fills[field.id] = context.tasks.has(id);
    else if (field.id === "has_mechanism") fills[field.id] = context.mecanismos.has(id);
    else if (field.id === "has_mechanism_implemented") fills[field.id] = context.mecanismosImplemented.has(id);
    else fills[field.id] = false;
  }
  return fills;
}

function buildSatelliteContext({
  financial = [],
  journeys = [],
  meetings = [],
  manualMeetings = [],
  attendance = [],
  tasks = [],
  mecanismos = [],
} = {}) {
  const financialMap = latestByClient(financial, (row) => row);
  const journeyStages = new Set();
  const journeyClients = setByClient(journeys);
  for (const row of journeys || []) {
    const id = clientKey(row.client_id);
    if (id && !isMissingFieldValue(row.current_stage_id, false)) journeyStages.add(id);
  }

  const meetingClients = new Set();
  const urisByClient = new Map();
  for (const row of meetings || []) {
    const id = clientKey(row.client_id);
    if (!id) continue;
    meetingClients.add(id);
    const uri = blankToNull(row.calendly_event_uri);
    if (!uri) continue;
    if (!urisByClient.has(id)) urisByClient.set(id, new Set());
    urisByClient.get(id).add(String(uri));
  }
  for (const row of manualMeetings || []) {
    const id = clientKey(row.client_id);
    if (id) meetingClients.add(id);
  }

  const attendanceUris = new Set();
  for (const row of attendance || []) {
    const uri = blankToNull(row.calendly_event_uri);
    if (uri && !isMissingFieldValue(row.status, true)) attendanceUris.add(String(uri));
  }
  const checkpoints = new Set();
  for (const [id, uris] of urisByClient.entries()) {
    for (const uri of uris) {
      if (attendanceUris.has(uri)) {
        checkpoints.add(id);
        break;
      }
    }
  }

  const mecanismoClients = setByClient(mecanismos);
  const mecanismosImplemented = new Set();
  for (const row of mecanismos || []) {
    const id = clientKey(row.client_id);
    if (!id) continue;
    const hasValue = !isMissingFieldValue(row.valor_aplicado, false);
    const hasDate = !isMissingFieldValue(row.implemented_at, false);
    if (hasValue || hasDate) mecanismosImplemented.add(id);
  }

  return {
    financial: financialMap,
    journeys: journeyClients,
    journeyStages,
    meetings: meetingClients,
    checkpoints,
    tasks: setByClient(tasks),
    mecanismos: mecanismoClients,
    mecanismosImplemented,
  };
}

export function buildEpUnfilledClients({
  clients = [],
  cancellations = [],
  financial = [],
  journeys = [],
  meetings = [],
  manualMeetings = [],
  attendance = [],
  tasks = [],
  mecanismos = [],
} = {}) {
  const visibleClients = filterExcludedClients(clients);
  const excluded = excludedClientIds(clients);
  const { map: cancelMap } = buildAnalyticalCancellationMap(cancellations, visibleClients);
  const context = buildSatelliteContext({
    financial,
    journeys,
    meetings,
    manualMeetings,
    attendance,
    tasks,
    mecanismos,
  });

  return visibleClients
    .filter((client) => client?.id && !excluded.has(String(client.id)))
    .map((client) => {
      const cancelInfo = cancelMap.get(String(client.id)) || null;
      return {
        clientId: String(client.id),
        clientCode: blankToNull(client.codigo),
        clientName: blankToNull(client.name) || "Não informado",
        engineer: labelOrUnknown(client.engenheiro_patrimonial),
        program: resolveClientProgram(client),
        davosContractSigned: client.davos_contrato_assinado === true,
        programa: blankToNull(client.programa),
        analyticalStatus: resolveAnalyticalStatusFromMaps(client.status, cancelInfo),
        fills: evaluateClientFills(client, context),
      };
    });
}

async function loadOptionalTable(table, select) {
  try {
    return await fetchAllRows({ table, select });
  } catch {
    return [];
  }
}

export async function computeEpUnfilledPayload(options = {}) {
  const configError = dataConfigurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }

  const load = options.loadTable || fetchAllRows;
  const loadOptional = options.loadOptionalTable || loadOptionalTable;

  const [
    clients,
    cancellations,
    financial,
    journeys,
    meetings,
    manualMeetings,
    attendance,
    tasks,
    mecanismos,
  ] = await Promise.all([
    load({ table: "clients", select: CLIENT_SELECT }),
    load({ table: "cancellations", select: ANALYTICAL_CANCEL_SELECT }),
    loadOptional("client_financial_data", FINANCIAL_SELECT),
    loadOptional("client_journeys", "client_id,current_stage_id"),
    loadOptional("client_meetings", "client_id,calendly_event_uri"),
    loadOptional("manual_meetings", "client_id"),
    loadOptional("meeting_attendance", "calendly_event_uri,status"),
    loadOptional("tasks", "client_id"),
    loadOptional("client_mecanismos", "client_id,valor_aplicado,implemented_at"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    catalog: EP_UNFILLED_CATALOG.map(({ id, domain, label, kind }) => ({
      id,
      domain,
      label,
      kind: kind || "value",
    })),
    clients: buildEpUnfilledClients({
      clients,
      cancellations,
      financial,
      journeys,
      meetings,
      manualMeetings,
      attendance,
      tasks,
      mecanismos,
    }),
  };
}
