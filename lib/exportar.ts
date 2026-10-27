import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Reporte } from "./reportes";

export async function crearExcel(reporte: Reporte): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "CATION";
  libro.created = new Date();
  const hoja = libro.addWorksheet("Reporte", {
    views: [{ state: "frozen", ySplit: reporte.notas.length + 3 }],
  });
  hoja.columns = reporte.columnas.map((c) => ({ width: c.ancho }));
  hoja.addRow([`CATION · ${reporte.titulo}`]);
  hoja.getRow(1).font = { bold: true, size: 17, color: { argb: "FF17335A" } };
  for (const n of reporte.notas) hoja.addRow([n]);
  for (let i = 1; i <= reporte.notas.length + 1; i++) {
    hoja.mergeCells(i, 1, i, reporte.columnas.length);
    hoja.getRow(i).alignment = { wrapText: true, vertical: "middle" };
    hoja.getRow(i).height =
      i === 1
        ? 30
        : Math.max(
            18,
            Math.ceil(String(hoja.getCell(i, 1).value).length / 110) * 15,
          );
  }
  hoja.addRow([]);
  const header = hoja.addRow(reporte.columnas.map((c) => c.nombre));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 28;
  header.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17335A" },
    };
  });
  const inicio = header.number;
  for (const fila of reporte.filas) {
    const row = hoja.addRow(fila);
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell, i) => {
      if (typeof cell.value === "number")
        cell.numFmt = reporte.columnas[i - 1].moneda
          ? "#,##0.00;[Red]-#,##0.00"
          : "#,##0.######";
      if (row.number % 2 === 0)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F5FB" },
        };
    });
  }
  hoja.autoFilter = {
    from: { row: inicio, column: 1 },
    to: {
      row: Math.max(inicio, hoja.rowCount),
      column: reporte.columnas.length,
    },
  };
  hoja.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${inicio}:${inicio}`,
  };
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

const textoPDF = (s: string) =>
  s
    .replace(/[−–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, " ");
export async function crearPDF(reporte: Reporte): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`CATION - ${reporte.titulo}`);
  doc.setAuthor("CATION");
  const normal = await doc.embedFont(StandardFonts.Helvetica),
    negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = 841.89,
    h = 595.28,
    m = 30,
    fontSize = 8.5,
    linea = 11,
    util = w - m * 2;
  const suma = reporte.columnas.reduce((s, c) => s + c.ancho, 0),
    anchos = reporte.columnas.map((c) => (c.ancho / suma) * util);
  const envolver = (valor: string, ancho: number, bold = false) => {
    const font = bold ? negrita : normal,
      limite = ancho - 10;
    let actual = "";
    const lineas: string[] = [];
    for (const palabra of textoPDF(valor).split(/\s+/)) {
      if (
        actual &&
        font.widthOfTextAtSize(`${actual} ${palabra}`, fontSize) <= limite
      ) {
        actual += ` ${palabra}`;
        continue;
      }
      if (actual) {
        lineas.push(actual);
        actual = "";
      }
      for (const c of palabra) {
        if (actual && font.widthOfTextAtSize(actual + c, fontSize) > limite) {
          lineas.push(actual);
          actual = "";
        }
        actual += c;
      }
    }
    lineas.push(actual);
    return lineas;
  };
  let pagina = doc.addPage([w, h]),
    y = h - m;
  const dibujar = (
    textos: string[][],
    alto: number,
    bold = false,
    fondo = false,
  ) => {
    if (fondo)
      pagina.drawRectangle({
        x: m,
        y: y - alto,
        width: util,
        height: alto,
        color: rgb(0.93, 0.96, 0.99),
      });
    let x = m;
    textos.forEach((ls, i) => {
      ls.forEach((t, j) =>
        pagina.drawText(t, {
          x: x + 5,
          y: y - 13 - j * linea,
          font: bold ? negrita : normal,
          size: fontSize,
          color: rgb(0.07, 0.12, 0.2),
        }),
      );
      x += anchos[i];
    });
    pagina.drawLine({
      start: { x: m, y: y - alto },
      end: { x: w - m, y: y - alto },
      thickness: 0.3,
      color: rgb(0.8, 0.84, 0.89),
    });
    y -= alto;
  };
  const encabezado = () => {
    pagina.drawText(textoPDF(`CATION - ${reporte.titulo}`), {
      x: m,
      y: y - 16,
      size: 17,
      font: negrita,
      color: rgb(0.09, 0.2, 0.35),
    });
    y -= 32;
    for (const nota of reporte.notas) {
      for (const l of envolver(nota, util)) {
        pagina.drawText(l, {
          x: m + 5,
          y: y - 10,
          size: fontSize,
          font: normal,
        });
        y -= linea;
      }
    }
    y -= 10;
    const ls = reporte.columnas.map((c) =>
      envolver(c.nombre, (c.ancho / suma) * util, true),
    );
    dibujar(ls, Math.max(...ls.map((x) => x.length)) * linea + 10, true, true);
  };
  encabezado();
  const capacidadPagina = Math.floor((y - m - 24 - 10) / linea);
  for (let n = 0; n < reporte.filas.length; n++) {
    const fila = reporte.filas[n],
      textos = fila.map((v, i) =>
        envolver(
          v === null
            ? "-"
            : typeof v === "number"
              ? v.toLocaleString("es-BO", {
                  minimumFractionDigits: reporte.columnas[i].moneda ? 2 : 0,
                  maximumFractionDigits: reporte.columnas[i].moneda ? 2 : 6,
                })
              : v,
          anchos[i],
        ),
      );
    let offset = 0,
      total = Math.max(...textos.map((t) => t.length));
    // Conserva juntas las filas normales; solo divide una fila que por sí
    // sola sea más alta que el espacio de una página completa.
    if (
      total <= capacidadPagina &&
      total > Math.floor((y - m - 24 - 10) / linea)
    ) {
      pagina = doc.addPage([w, h]);
      y = h - m;
      encabezado();
    }
    while (offset < total) {
      const disponibles = Math.floor((y - m - 24 - 10) / linea);
      if (disponibles < 1) {
        pagina = doc.addPage([w, h]);
        y = h - m;
        encabezado();
        continue;
      }
      const cantidad = Math.min(disponibles, total - offset);
      dibujar(
        textos.map((t) => t.slice(offset, offset + cantidad)),
        cantidad * linea + 10,
        false,
        n % 2 === 1,
      );
      offset += cantidad;
      if (offset < total) {
        pagina = doc.addPage([w, h]);
        y = h - m;
        encabezado();
      }
    }
  }
  if (!reporte.filas.length)
    pagina.drawText("Sin registros para los filtros seleccionados.", {
      x: m,
      y: y - 20,
      font: normal,
      size: 11,
    });
  doc
    .getPages()
    .forEach((p, i) =>
      p.drawText(
        `${reporte.filas.length} registros - Pagina ${i + 1} de ${doc.getPageCount()}`,
        { x: m, y: 18, font: normal, size: 8, color: rgb(0.35, 0.4, 0.45) },
      ),
    );
  return doc.save();
}
