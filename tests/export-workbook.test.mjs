import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { exportRows, writeExportWorkbook } from "../lib/export-workbook.mjs";

const payload = {
  catalog: [
    { id: "phone", label: "Telefone", domain: "Cliente", coreField: "personal_info.phone", baseqvField: "clients.phone", correlationType: "direta" },
    { id: "cpf", label: "CPF", domain: "Cliente", coreField: "personal_info.cpf", baseqvField: "clients.cpf", correlationType: "direta" },
  ],
  clients: [
    { clientId: "1", clientCode: "A", clientName: "=IMPORT()", engineer: "EP A", fills: { phone: true, cpf: false } },
    { clientId: "2", clientCode: "B", clientName: "Cliente B", engineer: "EP B", fills: { phone: false, cpf: false } },
  ],
};

test("base completa traz todos os pares cliente/campo e faltantes apenas os vazios", () => {
  const full = [...exportRows(payload, { source: "App Pharus", mode: "full" })];
  const missing = [...exportRows(payload, { source: "App Pharus", mode: "missing" })];
  assert.equal(full.length, 4);
  assert.equal(missing.length, 3);
  assert.equal(full.filter((row) => row.filled === "Preenchido").length, 1);
  assert.ok(missing.every((row) => row.filled === "Vazio"));
  assert.equal(full[0].clientName, "'=IMPORT()");
  assert.equal(full[0].sourceField, "personal_info.phone");
  assert.equal(full[0].baseqvField, "clients.phone");
  assert.ok(full.every((row) => !Object.hasOwn(row, "phone") && !Object.hasOwn(row, "cpf")));
  assert.throws(() => [...exportRows(payload, { source: "BaseQV", mode: "invalid" })]);
});

test("gera um XLSX legível com cabeçalho e todas as linhas do modo selecionado", async () => {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  await writeExportWorkbook(stream, payload, { source: "BaseQV", mode: "missing" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  const sheet = workbook.getWorksheet("Dados");
  assert.equal(sheet.rowCount, 4);
  assert.equal(sheet.getCell("A1").value, "Fonte");
  assert.equal(sheet.getCell("N2").value, "Vazio");
  assert.equal(sheet.getCell("E2").value, "'=IMPORT()");
});
