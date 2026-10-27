const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { PDFDocument, PDFRawStream, decodePDFRawStream } = require("pdf-lib");
const cargar = require("./cargar.cjs");
const { crearExcel, crearPDF } = cargar("lib/exportar.ts");
const reporte = {
  titulo: "Prueba de exportación",
  archivo: "prueba",
  notas: ["Rango: 2026-10-01 a 2026-10-26", "Producto: papel · unidad base"],
  columnas: [
    { nombre: "Documento", ancho: 20 },
    { nombre: "Concepto", ancho: 45 },
    { nombre: "Monto (Bs)", ancho: 16, moneda: true },
  ],
  filas: Array.from({ length: 125 }, (_, i) => [
    i === 124 ? "ULTIMA-FILA-125" : `000${i + 1}`,
    i === 0
      ? '=HYPERLINK("https://ejemplo.invalid")'
      : `Descripción con acentos: café, ñandú, reducción − 10%. ${"Referencia extensa ".repeat(8)}`,
    i + 0.45,
  ]),
};
test("Excel exporta todas las filas, conserva tipos y no interpreta fórmulas de texto", async () => {
  const bytes = await crearExcel(reporte),
    libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes);
  const hoja = libro.getWorksheet("Reporte");
  assert.equal(hoja.rowCount, 130);
  assert.equal(hoja.getCell("A130").value, "ULTIMA-FILA-125");
  assert.equal(hoja.getCell("B6").type, ExcelJS.ValueType.String);
  assert.equal(hoja.getCell("C6").value, 0.45);
  assert.equal(hoja.getCell("A6").value, "0001");
});
test("PDF pagina texto largo sin omitir la última fila y tolera signos y acentos", async () => {
  const bytes = await crearPDF(reporte),
    doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() > 1);
  const streams = doc.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream)
    .map(([, o]) => {
      try {
        return Buffer.from(decodePDFRawStream(o).decode()).toString();
      } catch {
        return "";
      }
    })
    .join("\n");
  assert.ok(
    streams.includes(
      Buffer.from("ULTIMA-FILA-125").toString("hex").toUpperCase(),
    ),
  );
  if (process.env.GUARDAR_QA === "1") {
    fs.mkdirSync(path.resolve(__dirname, "../.qa"), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, "../.qa/exportacion.pdf"), bytes);
  }
});
test("exportación vacía genera archivos válidos", async () => {
  const vacio = { ...reporte, filas: [] };
  assert.ok((await crearExcel(vacio)).length > 100);
  assert.equal(
    (await PDFDocument.load(await crearPDF(vacio))).getPageCount(),
    1,
  );
});
