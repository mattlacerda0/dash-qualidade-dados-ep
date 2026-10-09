import { loadPayload as loadBasePayload } from "./ep-unfilled-handler.mjs";
import { loadPayload as loadCorePayload } from "./core-ep-unfilled-handler.mjs";
import { EXPORT_MODES, writeExportWorkbook } from "../export-workbook.mjs";

export async function handleExportApi(req, res, source) {
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    res.end();
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  const mode = url.searchParams.get("mode");
  if (!EXPORT_MODES.has(mode)) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Escolha base completa ou apenas dados faltantes." }));
    return;
  }
  try {
    const payload = await (source === "core" ? loadCorePayload() : loadBasePayload());
    const filename = `${source === "core" ? "app-pharus" : "baseqv"}-${mode === "full" ? "base-completa" : "dados-faltantes"}.xlsx`;
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    await writeExportWorkbook(res, payload, { source: source === "core" ? "App Pharus" : "BaseQV", mode });
  } catch (error) {
    console.error("[export]", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error?.message || "Falha ao gerar o XLSX." }));
    } else {
      res.destroy(error);
    }
  }
}
