/**
 * Completude por EP — App Pharus/Core somente leitura.
 * Atribuição: backoffice.internals_customers_allocations atual.
 */
import { coreConfigurationError } from "./env.mjs";
import { fetchAllRows } from "./data/supabase-rest.mjs";
import { isMissingFieldValue } from "./missing.mjs";
import { CORE_EP_UNFILLED_CATALOG } from "./core-catalog.mjs";

const CORE_EXCLUDED_ENGINEERS = new Set([
  "Engenheiro Patrimonial Teste",
  "Raphael R. D'Avila",
]);

export {
  CORE_EP_UNFILLED_CATALOG,
  CORE_EP_UNFILLED_DOMAINS,
  CORE_EP_UNFILLED_MIN_PORTFOLIO,
  CORE_EP_UNFILLED_STATUS_OPTIONS,
} from "./core-catalog.mjs";

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function userKey(value) {
  const raw = blankToNull(value);
  return raw == null ? "" : String(raw);
}

function labelOrUnknown(value) {
  return blankToNull(value) ?? "Não informado";
}

function shortId(value) {
  const id = userKey(value);
  return id ? id.slice(0, 8) : "";
}

function engineerFallbackLabel(internalId) {
  const id = shortId(internalId);
  return id ? `EP ${id}` : "Não informado";
}

function setByUser(rows, field = "user_id", predicate = () => true) {
  const set = new Set();
  for (const row of rows || []) {
    const id = userKey(row[field]);
    if (id && predicate(row)) set.add(id);
  }
  return set;
}

function mapByUser(rows, field = "user_id") {
  const map = new Map();
  for (const row of rows || []) {
    const id = userKey(row[field]);
    if (id && !map.has(id)) map.set(id, row);
  }
  return map;
}

function buildEngineerMap(internals = []) {
  const map = new Map();
  for (const row of internals || []) {
    const id = userKey(row.internal_id);
    if (id) map.set(id, labelOrUnknown(row.name));
  }
  return map;
}

function buildAllocations(allocations = [], internals = []) {
  const engineerMap = buildEngineerMap(internals);
  const seen = new Set();
  const rows = [];
  for (const row of allocations || []) {
    const userId = userKey(row.customer_id);
    const internalId = userKey(row.internal_id);
    if (!userId) continue;
    const key = `${userId}:${internalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      userId,
      engineer: labelOrUnknown(engineerMap.get(internalId) || engineerFallbackLabel(internalId)),
    });
  }
  return rows;
}

function buildFallbackAllocations({
  scheduledMeetings = [],
  schedulingBookingAudit = [],
} = {}) {
  const rows = [];
  const push = (customerId, internalId = null) => {
    const userId = userKey(customerId);
    if (!userId) return;
    rows.push({ customer_id: userId, internal_id: userKey(internalId) || null });
  };

  for (const row of schedulingBookingAudit || []) push(row.customer_id || row.user_id, row.internal_id || row.advisor_internal_id);
  for (const row of scheduledMeetings || []) push(row.user_id || row.customer_id, row.advisor_internal_id || row.internal_id);
  return rows;
}

export function evaluateCoreClientFills(client, context) {
  const personal = context.personal.get(client.userId) || null;
  const engine = context.engines.get(client.userId) || null;
  return {
    phone: !isMissingFieldValue(personal?.phone, true),
    cpf: !isMissingFieldValue(personal?.cpf, true),
    occupation: !isMissingFieldValue(personal?.occupation, true),
    birth_date: !isMissingFieldValue(personal?.birth_date, false),
    city: !isMissingFieldValue(personal?.city, true),
    uf: !isMissingFieldValue(personal?.uf, true),
    alternative_email: !isMissingFieldValue(personal?.alternative_email, true),
    income: !isMissingFieldValue(engine?.income, false),
    reserve: !isMissingFieldValue(engine?.reserve, false),
    contribution: !isMissingFieldValue(engine?.contribution, false),
    real_estate_market_value: context.realEstateValues.has(client.userId),
    has_journey: context.formSubmissions.has(client.userId),
    has_meeting: context.scheduledMeetings.has(client.userId),
    has_checkpoint: context.meetingNotes.has(client.userId),
    has_mechanism_status: context.mechanismStatuses.has(client.userId),
    cycle_start: context.cycleStarts.has(client.userId),
    cycle_end: context.cycleEnds.has(client.userId),
    contract_signed: context.contractsSigned.has(client.userId),
  };
}

function registrationStatus(userId, context) {
  if (context.contractsSigned.has(userId)) return "contract";
  if (context.personal.has(userId) || context.preRegistrations.has(userId)) return "registered";
  return "unregistered";
}

export function buildCoreEpUnfilledClients({
  allocations = [],
  internals = [],
  personalInfo = [],
  userEngines = [],
  preRegistrations = [],
  formSubmissions = [],
  scheduledMeetings = [],
  schedulingBookingAudit = [],
  meetingOutputs = [],
  userMechanisms = [],
  realEstateAssets = [],
  userPayments = [],
  userContracts = [],
  fallbackAllocations = [],
} = {}) {
  const allocationSourceRows = allocations.length ? allocations : fallbackAllocations.length ? fallbackAllocations : buildFallbackAllocations({
    scheduledMeetings,
    schedulingBookingAudit,
  });
  const allocationRows = buildAllocations(allocationSourceRows, internals);
  const context = {
    personal: mapByUser(personalInfo),
    engines: mapByUser(userEngines),
    preRegistrations: setByUser(preRegistrations, "user_id"),
    formSubmissions: setByUser(formSubmissions, "user_id", (row) => !isMissingFieldValue(row.submitted_at, false)),
    scheduledMeetings: setByUser(scheduledMeetings, "user_id", (row) => !isMissingFieldValue(row.status, true)),
    meetingNotes: setByUser(meetingOutputs, "user_id", (row) => !isMissingFieldValue(row.notes, true)),
    mechanismStatuses: setByUser(userMechanisms, "user_id", (row) => !isMissingFieldValue(row.status, true)),
    realEstateValues: setByUser(realEstateAssets, "user_id", (row) => !isMissingFieldValue(row.market_value, false)),
    cycleStarts: setByUser(userPayments, "user_id", (row) => !isMissingFieldValue(row.cycle_start, false)),
    cycleEnds: setByUser(userPayments, "user_id", (row) => !isMissingFieldValue(row.cycle_end, false)),
    contractsSigned: setByUser(userContracts, "user_id", (row) => !isMissingFieldValue(row.signed_doc_url, true)),
  };

  return allocationRows.map((allocation) => {
    const personal = context.personal.get(allocation.userId);
    return {
      clientId: allocation.userId,
      clientCode: allocation.userId.slice(0, 8),
      clientName: blankToNull(personal?.name) || allocation.userId.slice(0, 8),
      engineer: allocation.engineer,
      registrationStatus: registrationStatus(allocation.userId, context),
      fills: evaluateCoreClientFills(allocation, context),
    };
  }).filter((client) => !CORE_EXCLUDED_ENGINEERS.has(client.engineer));
}

async function loadCore(load, table, select, schema = "core") {
  return load({ env: "core", schema, table, select, order: null });
}

async function loadCoreOptional(load, table, select, schema, warnings) {
  try {
    return await loadCore(load, table, select, schema);
  } catch (error) {
    warnings.push(`${schema}.${table}: ${error.message}`);
    return [];
  }
}

export async function computeCoreEpUnfilledPayload(options = {}) {
  const configError = coreConfigurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "config";
    throw err;
  }

  const load = options.loadTable || fetchAllRows;
  const warnings = [];
  const [
    allocations,
    internals,
    schedulingBookingAudit,
    personalInfo,
    userEngines,
    preRegistrations,
    formSubmissions,
    scheduledMeetings,
    meetingOutputs,
    userMechanisms,
    realEstateAssets,
    userPayments,
    userContracts,
  ] = await Promise.all([
    loadCoreOptional(load, "internals_customers_allocations", "internal_id,customer_id", "backoffice", warnings),
    loadCoreOptional(load, "internal_profile", "internal_id,name", "backoffice", warnings),
    loadCoreOptional(load, "scheduling_booking_audit", "customer_id,internal_id", "core", warnings),
    loadCoreOptional(load, "personal_info", "user_id,name,phone,cpf,occupation,birth_date,city,uf,alternative_email", "core", warnings),
    loadCoreOptional(load, "user_engines", "user_id,income,reserve,contribution", "core", warnings),
    loadCoreOptional(load, "pre_registrations", "user_id", "core", warnings),
    loadCoreOptional(load, "form_submissions", "user_id,submitted_at", "core", warnings),
    loadCoreOptional(load, "scheduled_meetings", "user_id,status,advisor_internal_id", "core", warnings),
    loadCoreOptional(load, "meeting_outputs", "user_id,notes", "core", warnings),
    loadCoreOptional(load, "user_mechanisms", "user_id,status", "core", warnings),
    loadCoreOptional(load, "real_estate_assets", "user_id,market_value", "core", warnings),
    loadCoreOptional(load, "user_payments", "user_id,cycle_start,cycle_end", "core", warnings),
    loadCoreOptional(load, "user_contracts", "user_id,signed_doc_url", "core", warnings),
  ]);

  const allocationSource = allocations.length ? "backoffice" : "core_fallback";
  const fallbackAllocations = buildFallbackAllocations({ scheduledMeetings, schedulingBookingAudit });
  const backofficeDenied = warnings.some((warning) => warning.includes("backoffice.") && warning.includes("42501"));
  if (!allocations.length && !fallbackAllocations.length && backofficeDenied) {
    const err = new Error(
      "A chave configurada não tem permissão para ler a dimensão de EP no schema backoffice. Configure CORE_SUPABASE_SERVICE_ROLE_KEY para carregar a tela Core/Pharus com percentuais corretos.",
    );
    err.code = "partial_access";
    err.warnings = warnings;
    throw err;
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceProject: "qvtqufdivpbmubooawdm",
    allocationSource,
    warnings,
    catalog: CORE_EP_UNFILLED_CATALOG.map((field) => ({
      id: field.id,
      domain: field.domain,
      label: field.label,
      kind: field.kind || "value",
      coreField: `${field.coreTable}.${field.coreField}`,
      baseqvField: `${field.baseqvTable}.${field.baseqvField}`,
      correlationType: field.correlationType,
    })),
    clients: buildCoreEpUnfilledClients({
      allocations,
      internals,
      schedulingBookingAudit,
      fallbackAllocations,
      personalInfo,
      userEngines,
      preRegistrations,
      formSubmissions,
      scheduledMeetings,
      meetingOutputs,
      userMechanisms,
      realEstateAssets,
      userPayments,
      userContracts,
    }),
  };
}
