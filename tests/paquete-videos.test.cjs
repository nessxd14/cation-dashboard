const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { inflateRawSync } = require("node:zlib");
test("paquete local: contiene solo el servicio actualizado y sus instrucciones, sin configuración ni videos", () => {
  const raiz = path.resolve(__dirname, ".."),
    zip = fs.readFileSync(
      path.join(raiz, "public/descargas/cation-videos.zip"),
    );
  const nombres = [];
  let p = 0;
  while (zip.readUInt32LE(p) === 0x04034b50) {
    const metodo = zip.readUInt16LE(p + 8),
      comprimido = zip.readUInt32LE(p + 18),
      largoNombre = zip.readUInt16LE(p + 26),
      extra = zip.readUInt16LE(p + 28),
      nombre = zip.toString("utf8", p + 30, p + 30 + largoNombre),
      inicio = p + 30 + largoNombre + extra,
      datos = zip.subarray(inicio, inicio + comprimido);
    nombres.push(nombre);
    const contenido = metodo === 8 ? inflateRawSync(datos) : datos;
    const normalizar = (texto) =>
      texto
        .toString("utf8")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n");
    if (nombre.endsWith(".ps1"))
      assert.equal(
        contenido.subarray(0, 3).toString("hex"),
        "efbbbf",
        "PowerShell 5 necesita BOM para los textos en español",
      );
    if (nombre.endsWith(".cmd")) {
      assert.ok(
        contenido.includes(Buffer.from("\r\n")),
        "CMD usa finales de línea Windows",
      );
      assert.match(contenido.toString(), /if errorlevel 1 \([\s\S]*pause/);
    }
    assert.equal(
      normalizar(contenido),
      normalizar(fs.readFileSync(path.join(raiz, "puente-videos", nombre))),
      `Paquete desactualizado: ${nombre}`,
    );
    p = inicio + comprimido;
  }
  assert.deepEqual(
    nombres.sort(),
    [
      "Configurar.ps1",
      "Configurar.cmd",
      "Iniciar.ps1",
      "Iniciar.cmd",
      "Instalar-inicio.ps1",
      "LEEME.md",
      "servidor.mjs",
    ].sort(),
  );
});
