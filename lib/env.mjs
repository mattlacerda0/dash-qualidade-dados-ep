/**
 * Variáveis de ambiente — BASE QV (DATA_*) e Auth corporativa (AUTH_*).
 */

function trimEnv(value) {
  return String(value || "").trim();
}

function trimUrl(value) {
  return trimEnv(value).replace(/\/$/, "");
}

export function getDataEnv() {
  const url = trimUrl(process.env.DATA_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceRoleKey = trimEnv(
    process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return { url, serviceRoleKey };
}

export function getAuthEnv() {
  const url = trimUrl(process.env.AUTH_SUPABASE_URL);
  const anonKey = trimEnv(process.env.AUTH_SUPABASE_ANON_KEY);
  return { url, anonKey };
}

export function dataConfigurationError() {
  const { url, serviceRoleKey } = getDataEnv();
  if (!url || !serviceRoleKey) {
    return "Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY.";
  }
  if (!/^https:\/\//i.test(url)) {
    return "DATA_SUPABASE_URL deve usar HTTPS.";
  }
  return null;
}

export function authConfigurationError() {
  const { url, anonKey } = getAuthEnv();
  if (!url || !anonKey) {
    return "Configure AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY.";
  }
  if (!/^https:\/\//i.test(url)) {
    return "AUTH_SUPABASE_URL deve usar HTTPS.";
  }
  if (/service_role/i.test(anonKey)) {
    return "Chave de serviço não pode ser exposta ao navegador. Use AUTH_SUPABASE_ANON_KEY.";
  }
  return null;
}

export function buildAuthConfigResult() {
  const error = authConfigurationError();
  const headers = { "Cache-Control": "no-store" };
  if (error) {
    return {
      status: 503,
      headers,
      body: { error, code: "AUTH_CONFIG_MISSING" },
    };
  }
  const { url, anonKey } = getAuthEnv();
  return {
    status: 200,
    headers,
    body: { url, anonKey },
  };
}
