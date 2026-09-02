/**
 * Handler HTTP para /api/ep-unfilled.
 */
import { computeEpUnfilledPayload } from "../ep-unfilled.mjs";

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { expiresAt: 0, payload: null, inflight: null };

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function loadPayload(force = false) {
  if (!force && cache.payload && cache.expiresAt > Date.now()) return cache.payload;
  if (cache.inflight) return cache.inflight;
  cache.inflight = computeEpUnfilledPayload()
    .then((payload) => {
      cache = { expiresAt: Date.now() + CACHE_TTL_MS, payload, inflight: null };
      return payload;
    })
    .catch((error) => {
      cache.inflight = null;
      throw error;
    });
  return cache.inflight;
}

export async function handleEpUnfilledApi(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("refresh") === "1";

  try {
    const payload = await loadPayload(force);
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    sendJson(res, 200, payload);
  } catch (error) {
    const code = error?.code || "EP_UNFILLED_ERROR";
    const status = code === "config" ? 503 : 500;
    console.error("[ep-unfilled]", error);
    sendJson(res, status, {
      error: error?.message || "Falha ao calcular preenchimento por EP.",
      code,
    });
  }
}
