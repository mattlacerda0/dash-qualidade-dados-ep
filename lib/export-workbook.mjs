import ExcelJS from "exceljs";

export const EXPORT_MODES = new Set(["full", "missing"]);

function safeText(value) {
  const text = String(value ?? "");
  return /^[\s\uFEFF]*[=+@-]/.test(text) ? `'${text}` : text;
}

export function* exportRows(payload, { source, mode }) {
  if (!EXPORT_MODES.has(mode)) throw new Error("Modo de extração inválido.");
  for (const client of payload.clients || []) {
    for (const field of payload.catalog || []) {
      const filled = client.fills?.[field.id] === true;
      if (mode === "missing" && filled) continue;
      yield {
        source: safeText(source),
        engineer: safeText(client.engineer),
        clientId: safeText(client.clientId),
        clientCode: safeText(client.clientCode),
        clientName: safeText(client.clientName),
        clientStatus: safeText(client.analyticalStatus || client.registrationStatus),
        program: safeText(client.program),
        domain: safeText(field.domain),
        field: safeText(field.label),
        fieldId: safeText(field.id),
        sourceField: safeText(field.coreField || field.id),
        baseqvField: safeText(field.baseqvField),
        correlation: safeText(field.correlationType),
        filled: filled ? "Preenchido" : "Vazio",
      };
    }
  }
}

export async function writeExportWorkbook(res, payload, { source, mode }) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  const sheet = workbook.addWorksheet("Dados", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Fonte", key: "source", width: 16 },
    { header: "EP", key: "engineer", width: 28 },
    { header: "ID cliente", key: "clientId", width: 38 },
    { header: "Código cliente", key: "clientCode", width: 18 },
    { header: "Cliente", key: "clientName", width: 34 },
    { header: "Status cliente", key: "clientStatus", width: 18 },
    { header: "Programa", key: "program", width: 22 },
    { header: "Domínio", key: "domain", width: 18 },
    { header: "Campo", key: "field", width: 34 },
    { header: "ID campo", key: "fieldId", width: 28 },
    { header: "Campo de origem", key: "sourceField", width: 38 },
    { header: "Campo BaseQV correlacionado", key: "baseqvField", width: 42 },
    { header: "Correlação", key: "correlation", width: 18 },
    { header: "Preenchimento", key: "filled", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202020" } };
  sheet.getRow(1).commit();
  for (const row of exportRows(payload, { source, mode })) sheet.addRow(row).commit();
  sheet.commit();
  await workbook.commit();
}
