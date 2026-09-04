/**
 * Cliente REST somente leitura da BASE QV (PostgREST GET).
 */
import { getCoreEnv, getDataEnv } from "../env.mjs";

const MAX_OFFSET = 200_000;
const DEFAULT_PAGE_SIZE = 1000;
const POSTGREST_RANGE_MAX = 1000;

const TABLE_PAGE_SIZES = {
  clients: 5000,
  client_meetings: 5000,
  meeting_attendance: 5000,
  manual_meetings: 2000,
  client_mecanismos: 2000,
  mecanismos: 1000,
  cancellations: 1000,
};

function assertReadOnlyTable(table) {
  const name = String(table || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Nome de tabela inválido para leitura.");
  }
  return name;
}

function resolveRangeSize(table) {
  return Math.min(TABLE_PAGE_SIZES[table] || DEFAULT_PAGE_SIZE, POSTGREST_RANGE_MAX);
}

export async function fetchAllRows(opts) {
  const table = assertReadOnlyTable(opts?.table);
  const select = String(opts?.select || "*");
  const rangeSize = resolveRangeSize(table);
  const dataEnv = opts?.env === "core" ? getCoreEnv() : getDataEnv();
  const url = String(opts?.url || dataEnv.url || "").replace(/\/$/, "");
  const restKey = String(opts?.restKey || dataEnv.serviceRoleKey || "").trim();
  const schema = String(opts?.schema || "public").trim() || "public";
  if (!url || !restKey) {
    throw new Error("Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY.");
  }

  const rows = [];
  let offset = 0;
  const order = opts?.order === null ? null : opts?.order || "id.asc";

  while (true) {
    const endpoint = new URL(`/rest/v1/${table}`, url);
    endpoint.searchParams.set("select", select);
    if (order) endpoint.searchParams.set("order", order);
    if (opts?.filters) {
      for (const [key, value] of Object.entries(opts.filters)) {
        endpoint.searchParams.set(key, value);
      }
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: restKey,
        Authorization: `Bearer ${restKey}`,
        Accept: "application/json",
        "Accept-Profile": schema,
        Range: `${offset}-${offset + rangeSize - 1}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${table}: HTTP ${response.status} ${detail.slice(0, 200)}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(`${table}: resposta REST inválida.`);
    }
    rows.push(...batch);
    if (!batch.length || batch.length < rangeSize) break;
    offset += batch.length;
    if (offset > MAX_OFFSET) break;
  }

  return rows;
}
