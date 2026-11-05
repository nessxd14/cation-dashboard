const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { setTimeout: esperar } = require("node:timers/promises");

test(
  "inicio local en Windows PowerShell 5: arranque real, configuración conservada y errores visibles",
  { skip: process.platform !== "win32", timeout: 60000 },
  async (t) => {
    const puertoLibre = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(8767, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (!puertoLibre)
      return t.skip(
        "El puerto 8767 está ocupado; no se interrumpe el servicio existente.",
      );
    const raiz = await fs.mkdtemp(
      path.join(os.tmpdir(), "cation inicio con espacios "),
    );
    const programa = path.join(raiz, "programa"),
      datos = path.join(raiz, "datos");
    const pidArchivo = path.join(datos, "prueba.pid");
    await fs.mkdir(programa);
    await fs.mkdir(datos);
    const origen = path.resolve(__dirname, "../puente-videos");
    await fs.copyFile(
      path.join(origen, "Iniciar.ps1"),
      path.join(programa, "Iniciar.ps1"),
    );
    // Solo esta instancia de prueba escribe su PID, para detener exclusivamente el proceso que creamos.
    await fs.writeFile(
      path.join(programa, "servidor.mjs"),
      `import {writeFileSync as escribirPidPrueba} from 'node:fs';
escribirPidPrueba(process.env.CATION_VIDEOS_DATOS+'/prueba.pid',String(process.pid));\n` +
        (await fs.readFile(path.join(origen, "servidor.mjs"), "utf8")),
    );
    const powershell = path.join(
      process.env.SystemRoot,
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    const ejecutar = (envExtra = {}) =>
      spawnSync(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          path.join(programa, "Iniciar.ps1"),
          "-SinAbrirNavegador",
          "-SinPausa",
        ],
        {
          env: { ...process.env, CATION_VIDEOS_DATOS: datos, ...envExtra },
          encoding: "utf8",
          timeout: 25000,
        },
      );
    async function detenerPropio() {
      const texto = await fs.readFile(pidArchivo, "utf8").catch(() => "");
      if (/^\d+$/.test(texto)) {
        try {
          process.kill(Number(texto));
        } catch (e) {
          if (e.code !== "ESRCH") throw e;
        }
        for (let i = 0; i < 30; i++) {
          try {
            process.kill(Number(texto), 0);
          } catch (e) {
            if (e.code === "ESRCH") break;
            throw e;
          }
          await esperar(100);
        }
      }
      await fs.rm(pidArchivo, { force: true });
    }
    try {
      await t.test(
        "inicia con una ruta con espacios y reutiliza el servicio sin cambiar su identidad",
        async () => {
          const carpeta = path.join(raiz, "Grabaciones");
          await fs.mkdir(carpeta);
          const config = JSON.stringify({
            version: 1,
            id: randomUUID(),
            nombre: "Prueba aislada",
            clave: "a".repeat(64),
            carpeta,
            dashboardOrigin: "https://cation-dashboard.vercel.app",
          });
          await fs.writeFile(
            path.join(datos, "config.json"),
            "\uFEFF" + config,
          );
          const salida = ejecutar();
          assert.equal(salida.error, undefined, salida.stdout + salida.stderr);
          assert.equal(salida.status, 0, salida.stdout + salida.stderr);
          assert.match(salida.stdout, /CATION Videos listo/);
          const identidad = await (
            await fetch("http://127.0.0.1:8767/v1/identidad")
          ).json();
          assert.equal(identidad.id, JSON.parse(config).id);
          const pid = await fs.readFile(pidArchivo, "utf8");
          const segunda = ejecutar();
          assert.equal(segunda.status, 0, segunda.stdout + segunda.stderr);
          assert.equal(await fs.readFile(pidArchivo, "utf8"), pid);
          assert.deepEqual(
            await (await fetch("http://127.0.0.1:8767/v1/identidad")).json(),
            identidad,
          );
          assert.equal(
            await fs.readFile(path.join(datos, "config.json"), "utf8"),
            "\uFEFF" + config,
          );
          await detenerPropio();
        },
      );
      await t.test(
        "informa el fallo real y la ubicación del registro si el servidor no arranca",
        async () => {
          await fs.writeFile(
            path.join(datos, "config.json"),
            JSON.stringify({ id: "invalido" }),
          );
          const salida = ejecutar();
          assert.equal(salida.status, 1, salida.stdout + salida.stderr);
          assert.match(
            salida.stdout,
            /No se pudo iniciar CATION Videos\. Registro:/,
          );
          assert.match(salida.stdout, /inicio\.error\.log/);
          assert.doesNotMatch(salida.stdout, /CATION Videos listo/);
          assert.match(
            await fs.readFile(path.join(datos, "inicio.error.log"), "utf8"),
            /No se reinicia la identidad/,
          );
          await detenerPropio();
        },
      );
      await t.test("explica que falta Node en el paquete sin runtime", () => {
        const salida = ejecutar({
          PATH: path.join(process.env.SystemRoot, "System32"),
        });
        assert.equal(salida.status, 1, salida.stdout + salida.stderr);
        assert.match(salida.stdout, /paquete portatil de CATION Videos/);
      });
    } finally {
      await detenerPropio();
      await fs.rm(raiz, { recursive: true, force: true });
    }
  },
);
