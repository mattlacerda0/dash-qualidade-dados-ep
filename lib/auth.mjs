/**
 * Validação de sessão corporativa nas APIs Node.
 */
import { getAuthEnv } from "./env.mjs";
import { isAllowedCorporateEmail } from "./corporate-email.mjs";

const AUTH_CACHE_TTL_MS = 30_000;
const validatedTokens = new Map();
const validationsInFlight = new Map();

function headerValue(req, name) {
  const headers = req?.headers || {};
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct)) return direct[0] || "";
  if (typeof req?.headers?.get === "function") {
    return req.headers.get(name) || req.headers.get(name.toLowerCase()) || "";
  }
  return "";
}

export function getRequestAccessToken(req) {
  const header = headerValue(req, "authorization");
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function requestAuthUser(authUrl, anonKey, token) {
  const cached = validatedTokens.get(token);
  if (cached?.expiresAt > Date.now()) return { user: cached.user };
  if (cached) validatedTokens.delete(token);

  let pending = validationsInFlight.get(token);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(`${authUrl}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
        });
        if (!response.ok) {
          return { status: response.status };
        }
        const user = await response.json().catch(() => null);
        if (!user?.email) return { status: 401 };
        validatedTokens.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
        return { user };
      } catch {
        return { status: 0 };
      }
    })();
    validationsInFlight.set(token, pending);
  }

  try {
    return await pending;
  } finally {
    validationsInFlight.delete(token);
  }
}

export async function authenticateRequest(req) {
  const token = getRequestAccessToken(req);
  if (!token) {
    return { error: { status: 401, body: { error: "Não autenticado.", code: "unauthenticated" } } };
  }

  const { url: authUrl, anonKey } = getAuthEnv();
  if (!authUrl || !anonKey) {
    return {
      error: {
        status: 503,
        body: { error: "Configure AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY.", code: "config" },
      },
    };
  }

  const authResult = await requestAuthUser(authUrl, anonKey, token);
  if (!authResult.user) {
    if (
      !authResult.status
      || authResult.status === 408
      || authResult.status === 425
      || authResult.status === 429
      || authResult.status >= 500
    ) {
      return {
        error: {
          status: 503,
          body: { error: "Não foi possível validar a sessão agora. Tente novamente.", code: "auth_unavailable" },
        },
      };
    }
    return { error: { status: 401, body: { error: "Sessão inválida ou expirada.", code: "unauthenticated" } } };
  }

  if (!authResult.user.email) {
    return { error: { status: 401, body: { error: "Sessão inválida ou expirada.", code: "unauthenticated" } } };
  }

  if (!isAllowedCorporateEmail(authResult.user.email)) {
    return {
      error: {
        status: 403,
        body: { error: "O acesso é permitido somente para contas @quartavia.com.br.", code: "invalid_domain" },
      },
    };
  }

  return { user: authResult.user };
}

export async function requireCorporateAuth(req) {
  const result = await authenticateRequest(req);
  return result.error || null;
}
