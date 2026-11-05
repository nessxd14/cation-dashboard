// Puente local de CATION. Node.js >=22. Sin dependencias ni conexión saliente.
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { promises as fs, createReadStream } from "node:fs";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const PORT = 8767;
const FORMATOS = new Map([
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".ogg", "video/ogg"],
  [".mov", "video/quicktime"],
  [".avi", "video/x-msvideo"],
  [".mkv", "video/x-matroska"],
  [".dav", "application/octet-stream"],
]);
const REPRODUCIBLES = new Set([".mp4", ".m4v", ".webm", ".ogg"]);
export const directorioDatos = () =>
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
    "CationVideos",
  );
const validoId = (id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
const token = () => randomBytes(32).toString("hex");
function problema(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado });
}
function dentro(raiz, destino) {
  const relativo = path.relative(raiz, destino);
  return (
    relativo !== "" &&
    !relativo.startsWith(".." + path.sep) &&
    relativo !== ".." &&
    !path.isAbsolute(relativo)
  );
}
function mismoArchivo(a, b) {
  return (
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ino === b.ino &&
    a.dev === b.dev
  );
}
function escapar(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function verificarAcceso(ticket, config, reto, ahora = Date.now()) {
  if (typeof ticket !== "string" || ticket.length > 2048)
    throw problema(401, "Acceso local no válido.");
  const partes = ticket.split(".");
  if (
    partes.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(partes[0]) ||
    !/^[a-f0-9]{64}$/.test(partes[1])
  )
    throw problema(401, "Acceso local no válido.");
  const firma = createHmac("sha256", config.clave).update(partes[0]).digest();
  if (!timingSafeEqual(firma, Buffer.from(partes[1], "hex")))
    throw problema(401, "El equipo no coincide. Vuelve a vincular esta PC.");
  let carga;
  try {
    carga = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
  } catch {
    throw problema(401, "Acceso local no válido.");
  }
  if (
    carga.aud !== "cation-videos-locales" ||
    carga.equipo !== config.id ||
    carga.reto !== reto ||
    !Number.isSafeInteger(carga.exp) ||
    carga.exp * 1000 <= ahora ||
    carga.exp * 1000 > ahora + 120000 ||
    typeof carga.usuario !== "string"
  )
    throw problema(401, "El acceso local venció. Vuelve a conectar esta PC.");
  return carga;
}
export function rangoBytes(cabecera, tamano) {
  if (!cabecera) return { inicio: 0, fin: tamano - 1, parcial: false };
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera);
  if (!m || (!m[1] && !m[2])) throw problema(416, "Rango inválido.");
  let inicio, fin;
  if (!m[1]) {
    const ultimos = Number(m[2]);
    if (!Number.isSafeInteger(ultimos) || ultimos <= 0)
      throw problema(416, "Rango inválido.");
    inicio = Math.max(0, tamano - ultimos);
    fin = tamano - 1;
  } else {
    inicio = Number(m[1]);
    fin = m[2] ? Number(m[2]) : tamano - 1;
  }
  if (
    !Number.isSafeInteger(inicio) ||
    !Number.isSafeInteger(fin) ||
    inicio < 0 ||
    inicio >= tamano ||
    fin < inicio
  )
    throw problema(416, "Rango inválido.");
  return { inicio, fin: Math.min(fin, tamano - 1), parcial: true };
}
async function guardarJson(archivo, valor) {
  const temporal = archivo + ".tmp";
  await fs.writeFile(temporal, JSON.stringify(valor, null, 2), { mode: 0o600 });
  await fs.rename(temporal, archivo);
}
async function leerJson(archivo, defecto) {
  try {
    return JSON.parse(
      (await fs.readFile(archivo, "utf8")).replace(/^\uFEFF/, ""),
    );
  } catch (e) {
    if (e.code === "ENOENT") return defecto;
    throw e;
  }
}
async function leerCuerpo(req) {
  let size = 0;
  const trozos = [];
  for await (const c of req) {
    size += c.length;
    if (size > 8192) throw problema(413, "Solicitud demasiado grande.");
    trozos.push(c);
  }
  try {
    const datos = JSON.parse(Buffer.concat(trozos).toString("utf8"));
    if (!datos || typeof datos !== "object" || Array.isArray(datos))
      throw new Error("Objeto JSON requerido");
    return datos;
  } catch {
    throw problema(400, "Solicitud inválida.");
  }
}
function origenDashboard(valor) {
  const u = new URL(valor);
  if (
    u.origin !== valor ||
    u.username ||
    u.password ||
    (u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      ))
  )
    throw new Error("El Dashboard debe tener un origen HTTPS válido.");
  return valor;
}

export async function crearPuente({
  carpetaDatos = directorioDatos(),
  puerto = PORT,
  dashboardOrigin = "https://cation-dashboard.vercel.app",
} = {}) {
  await fs.mkdir(carpetaDatos, { recursive: true, mode: 0o700 });
  const archivoConfig = path.join(carpetaDatos, "config.json"),
    archivoCache = path.join(carpetaDatos, "indice.json");
  let config = await leerJson(archivoConfig, null);
  if (!config) {
    config = {
      version: 1,
      id: randomUUID(),
      nombre: os.hostname(),
      clave: token(),
      carpeta: null,
      dashboardOrigin: origenDashboard(dashboardOrigin),
    };
    await guardarJson(archivoConfig, config);
  }
  if (!/^[a-f0-9-]{36}$/.test(config.id) || !validoId(config.clave))
    throw new Error(
      "Configuración del puente inválida. No se reinicia la identidad automáticamente.",
    );
  config.dashboardOrigin = origenDashboard(config.dashboardOrigin);
  const reto = token(),
    csrf = token(),
    reproducciones = new Map();
  let indice = new Map(),
    escaneando = false,
    progreso = { revisados: 0, indexados: 0, error: null },
    raiz = null;
  const estado = () => ({
    equipo: { id: config.id, nombre: config.nombre },
    configurada: !!config.carpeta,
    escaneando,
    ...progreso,
    total: indice.size,
  });
  async function escanear() {
    if (escaneando) return;
    escaneando = true;
    progreso = { revisados: 0, indexados: 0, error: null };
    try {
      if (!config.carpeta) {
        indice = new Map();
        return;
      }
      raiz = await fs.realpath(config.carpeta);
      const previo = await leerJson(archivoCache, { raiz: null, archivos: [] }),
        cache = new Map(
          previo.raiz === raiz
            ? previo.archivos.map((x) => [x.relativo, x])
            : [],
        ),
        nuevo = new Map(),
        persistir = [];
      async function recorrer(carpeta) {
        for (const e of await fs.readdir(carpeta, { withFileTypes: true })) {
          if (e.isSymbolicLink()) continue;
          const ruta = path.join(carpeta, e.name);
          if (e.isDirectory()) {
            await recorrer(ruta);
            continue;
          }
          const ext = path.extname(e.name).toLowerCase();
          if (!e.isFile() || !FORMATOS.has(ext)) continue;
          progreso.revisados++;
          try {
            const real = await fs.realpath(ruta);
            if (!dentro(raiz, real)) continue;
            const stat = await fs.stat(real);
            if (
              !stat.isFile() ||
              stat.size <= 0 ||
              !Number.isSafeInteger(stat.size)
            )
              continue;
            const relativo = path.relative(raiz, real),
              anterior = cache.get(relativo);
            let clave;
            if (
              anterior &&
              mismoArchivo(anterior, stat) &&
              validoId(anterior.clave)
            )
              clave = anterior.clave;
            else {
              const hash = createHash("sha256");
              for await (const trozo of createReadStream(real))
                hash.update(trozo);
              clave = hash.digest("hex");
              if (!mismoArchivo(stat, await fs.stat(real))) continue;
            }
            const registro = {
              clave,
              nombre: e.name,
              bytes: stat.size,
              modificado_en: stat.mtime.toISOString(),
              tipo: FORMATOS.get(ext),
              reproducible: REPRODUCIBLES.has(ext),
              ruta: real,
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              ino: stat.ino,
              dev: stat.dev,
              relativo,
            };
            if (!nuevo.has(clave)) nuevo.set(clave, registro);
            indice.set(clave, registro);
            persistir.push(registro);
            progreso.indexados = nuevo.size;
          } catch (e) {
            if (!["ENOENT", "EACCES", "EPERM", "EBUSY"].includes(e.code))
              throw e;
          }
        }
      }
      await recorrer(raiz);
      indice = nuevo;
      await guardarJson(archivoCache, { raiz, archivos: persistir });
    } catch {
      progreso.error =
        "No se pudo completar la lectura de la carpeta. Comprueba que esté conectada y tengas permiso.";
      indice = new Map();
    } finally {
      escaneando = false;
    }
  }
  const visible = (a) => ({
    clave: a.clave,
    nombre: a.nombre,
    bytes: a.bytes,
    modificado_en: a.modificado_en,
    tipo: a.tipo,
    reproducible: a.reproducible,
  });
  async function abrirArchivo(clave) {
    const a = indice.get(clave);
    if (!a || !raiz) throw problema(404, "No disponible en esta PC.");
    let archivo;
    try {
      const real = await fs.realpath(a.ruta);
      if (!dentro(raiz, real))
        throw problema(404, "Archivo fuera de la carpeta configurada.");
      archivo = await fs.open(real, "r");
      const stat = await archivo.stat();
      if (!stat.isFile() || !mismoArchivo(a, stat))
        throw problema(
          409,
          "El archivo cambió. Actualiza la carpeta antes de reproducirlo.",
        );
      return { archivo, a };
    } catch (e) {
      if (archivo) await archivo.close();
      if (e.estado) throw e;
      throw problema(404, "No disponible en esta PC.");
    }
  }
  function paginaConfig() {
    return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CATION · Videos de esta PC</title><style>body{font:16px/1.6 system-ui;background:#0b1222;color:#eff3fa;max-width:760px;margin:40px auto;padding:0 20px}label{display:block;margin:20px 0 6px}input,textarea,button{font:inherit;box-sizing:border-box;padding:10px;border-radius:7px;border:1px solid #53637e;background:#18233a;color:inherit}input,textarea{width:100%}button{margin:16px 8px 0 0;cursor:pointer}small{color:#bdc9dd}code{overflow-wrap:anywhere}#estado{white-space:pre-wrap}a{color:#9fc5ff}</style><h1>Videos de esta PC</h1><p>Los archivos se leen de la carpeta que elijas y permanecen en este equipo.</p><form id="config"><label>Nombre del equipo<input name="nombre" maxlength="100" value="${escapar(config.nombre)}" required></label><label>Carpeta de videos<input name="carpeta" value="${escapar(config.carpeta || "")}" placeholder="D:\\Grabaciones\\Almacen" required></label><small>Puedes pegar una ruta distinta en cada PC. También puedes elegirla al ejecutar Configurar.cmd.</small><button>Guardar carpeta</button><button type="button" id="escanear">Actualizar carpeta</button></form><h2>Vincular con el Dashboard</h2><p>En el Dashboard abre <a href="${escapar(config.dashboardOrigin)}/videos" target="_blank" rel="noreferrer">Videos locales</a>, pega este código y pulsa Vincular esta PC.</p><textarea readonly aria-label="Código de vinculación" rows="4">${escapar(config.id + ":" + config.clave)}</textarea><small>Este código pertenece solo a este servicio. Compártelo únicamente con las cuentas autorizadas del Dashboard.</small><h2>Estado</h2><p id="estado" aria-live="polite"></p><script>const csrf=${JSON.stringify(csrf)};async function estado(){const r=await fetch('/config/estado');const s=await r.json();document.querySelector('#estado').textContent=(s.configurada?'Carpeta configurada. ':'Selecciona una carpeta. ')+(s.escaneando?'Revisando '+s.revisados+' archivos…':s.total+' videos disponibles.')+(s.error?'\n'+s.error:'');}async function enviar(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Cation-CSRF':csrf},body:JSON.stringify(body)});const s=await r.json();if(!r.ok)throw new Error(s.error);await estado();}document.querySelector('#config').onsubmit=async e=>{e.preventDefault();try{await enviar('/config',Object.fromEntries(new FormData(e.target)));}catch(e){document.querySelector('#estado').textContent=e.message;}};document.querySelector('#escanear').onclick=async()=>{try{await enviar('/config/escanear',{});}catch(e){document.querySelector('#estado').textContent=e.message;}};estado();setInterval(estado,3000);</script></html>`;
  }
  function responder(res, status, body, headers = {}) {
    res.writeHead(status, {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }
  const server = http.createServer(async (req, res) => {
    let abierto;
    try {
      const host = req.headers.host,
        localOrigin = `http://${host}`;
      if (
        ![
          `127.0.0.1:${server.address()?.port}`,
          `localhost:${server.address()?.port}`,
        ].includes(host)
      )
        throw problema(403, "Host no permitido.");
      const url = new URL(req.url, localOrigin),
        origen = req.headers.origin;
      if (origen && origen !== config.dashboardOrigin && origen !== localOrigin)
        throw problema(403, "Origen no permitido.");
      if (
        (url.pathname === "/" || url.pathname.startsWith("/config")) &&
        origen &&
        origen !== localOrigin
      )
        throw problema(403, "La configuración solo se abre en esta PC.");
      if (origen === config.dashboardOrigin) {
        res.setHeader("Access-Control-Allow-Origin", origen);
        res.setHeader("Vary", "Origin");
        res.setHeader(
          "Access-Control-Expose-Headers",
          "Content-Length,Content-Range,Accept-Ranges",
        );
      }
      if (req.method === "OPTIONS") {
        if (origen !== config.dashboardOrigin)
          throw problema(403, "Origen no permitido.");
        res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization,Content-Type,Range",
        );
        res.setHeader("Access-Control-Max-Age", "600");
        return responder(res, 204, "");
      }
      if (url.pathname === "/" && req.method === "GET")
        return responder(res, 200, paginaConfig(), {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        });
      if (url.pathname === "/config/estado" && req.method === "GET") {
        if (origen && origen !== localOrigin)
          throw problema(403, "Solo configuración local.");
        return responder(res, 200, estado(), {
          "Content-Type": "application/json",
        });
      }
      if (url.pathname.startsWith("/config") && req.method === "POST") {
        if (origen !== localOrigin || req.headers["x-cation-csrf"] !== csrf)
          throw problema(403, "Vuelve a abrir la configuración local.");
        if (url.pathname === "/config") {
          if (escaneando)
            throw problema(409, "Espera a que termine la lectura actual.");
          const datos = await leerCuerpo(req);
          if (
            typeof datos.carpeta !== "string" ||
            !path.isAbsolute(datos.carpeta) ||
            typeof datos.nombre !== "string" ||
            !datos.nombre.trim() ||
            datos.nombre.length > 100
          )
            throw problema(400, "Revisa el nombre y la ruta de la carpeta.");
          let carpeta;
          try {
            carpeta = await fs.realpath(datos.carpeta);
            if (!(await fs.stat(carpeta)).isDirectory()) throw new Error();
          } catch {
            throw problema(400, "La carpeta no existe o no se puede abrir.");
          }
          config = { ...config, nombre: datos.nombre.trim(), carpeta };
          await guardarJson(archivoConfig, config);
          indice = new Map();
          reproducciones.clear();
        } else if (url.pathname !== "/config/escanear")
          throw problema(404, "No encontrado.");
        void escanear();
        return responder(
          res,
          202,
          { ok: true },
          { "Content-Type": "application/json" },
        );
      }
      if (url.pathname === "/v1/identidad" && req.method === "GET")
        return responder(
          res,
          200,
          { id: config.id, nombre: config.nombre, reto, version: 1 },
          { "Content-Type": "application/json" },
        );
      if (
        url.pathname.startsWith("/v1/media/") &&
        ["GET", "HEAD"].includes(req.method)
      ) {
        const clave = url.pathname.slice("/v1/media/".length),
          t = reproducciones.get(url.searchParams.get("ticket"));
        if (!validoId(clave) || !t || t.clave !== clave || t.vence < Date.now())
          throw problema(
            401,
            "El enlace local venció. Solicita otro desde el Dashboard.",
          );
        abierto = await abrirArchivo(clave);
        const { archivo, a } = abierto;
        let rango;
        try {
          rango = rangoBytes(req.headers.range, a.bytes);
        } catch (e) {
          res.setHeader("Content-Range", `bytes */${a.bytes}`);
          throw e;
        }
        const headers = {
          "Content-Type": a.tipo,
          "Accept-Ranges": "bytes",
          "Content-Length": rango.fin - rango.inicio + 1,
          "Referrer-Policy": "no-referrer",
        };
        if (rango.parcial)
          headers["Content-Range"] =
            `bytes ${rango.inicio}-${rango.fin}/${a.bytes}`;
        if (!a.reproducible)
          headers["Content-Disposition"] =
            "attachment; filename*=UTF-8''" + encodeURIComponent(a.nombre);
        res.writeHead(rango.parcial ? 206 : 200, {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          ...headers,
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        const stream = archivo.createReadStream({
          start: rango.inicio,
          end: rango.fin,
          autoClose: false,
        });
        res.once("close", () => stream.destroy());
        await pipeline(stream, res);
        return;
      }
      const carga = verificarAcceso(
        String(req.headers.authorization || "").replace(/^Bearer /, ""),
        config,
        reto,
      );
      if (url.pathname === "/v1/estado" && req.method === "GET")
        return responder(res, 200, estado(), {
          "Content-Type": "application/json",
        });
      if (url.pathname === "/v1/archivos" && req.method === "GET") {
        const buscar = (url.searchParams.get("buscar") || "")
            .slice(0, 120)
            .toLowerCase(),
          pagina = Number(url.searchParams.get("pagina") || 1);
        if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000)
          throw problema(400, "Página inválida.");
        const filas = [...indice.values()]
          .filter((a) => a.nombre.toLowerCase().includes(buscar))
          .sort(
            (a, b) =>
              a.nombre.localeCompare(b.nombre) ||
              a.clave.localeCompare(b.clave),
          );
        return responder(
          res,
          200,
          {
            ...estado(),
            total_filtrado: filas.length,
            filas: filas.slice((pagina - 1) * 50, pagina * 50).map(visible),
          },
          { "Content-Type": "application/json" },
        );
      }
      if (url.pathname === "/v1/disponibles" && req.method === "POST") {
        const datos = await leerCuerpo(req);
        if (
          !Array.isArray(datos.claves) ||
          datos.claves.length > 100 ||
          datos.claves.some((c) => !validoId(c))
        )
          throw problema(400, "Lista inválida.");
        const archivos = [];
        for (const clave of datos.claves) {
          try {
            const { archivo, a } = await abrirArchivo(clave);
            await archivo.close();
            archivos.push(visible(a));
          } catch {}
        }
        return responder(
          res,
          200,
          { archivos, ...estado() },
          { "Content-Type": "application/json" },
        );
      }
      if (url.pathname === "/v1/reproduccion" && req.method === "POST") {
        const datos = await leerCuerpo(req);
        if (!validoId(datos.clave)) throw problema(400, "Archivo inválido.");
        const { archivo, a } = await abrirArchivo(datos.clave);
        await archivo.close();
        for (const [id, t] of reproducciones)
          if (t.vence < Date.now()) reproducciones.delete(id);
        while (reproducciones.size >= 100)
          reproducciones.delete(reproducciones.keys().next().value);
        const id = token();
        reproducciones.set(id, {
          clave: a.clave,
          usuario: carga.usuario,
          vence: Date.now() + 300000,
        });
        return responder(
          res,
          200,
          {
            ruta: `/v1/media/${a.clave}?ticket=${id}`,
            expira: Date.now() + 300000,
            reproducible: a.reproducible,
          },
          { "Content-Type": "application/json" },
        );
      }
      if (url.pathname === "/v1/escanear" && req.method === "POST") {
        void escanear();
        return responder(res, 202, estado(), {
          "Content-Type": "application/json",
        });
      }
      throw problema(404, "No encontrado.");
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
      } else
        responder(
          res,
          e.estado || 500,
          {
            error: e.estado
              ? e.message
              : "No se pudo completar la lectura local.",
          },
          { "Content-Type": "application/json" },
        );
    } finally {
      if (abierto) await abierto.archivo.close().catch(() => {});
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(puerto, "127.0.0.1", resolve);
  });
  void escanear();
  return {
    server,
    config,
    estado,
    escanear,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const datos = process.env.CATION_VIDEOS_DATOS || directorioDatos();
  crearPuente({ carpetaDatos: datos })
    .then(async (p) => {
      const mensaje = `CATION Videos: ${p.url}\nConfiguración por equipo: ${datos}\n`;
      await fs
        .appendFile(path.join(datos, "inicio.salida.log"), mensaje)
        .catch(() => {});
      process.stdout.write(mensaje);
      for (const s of ["SIGINT", "SIGTERM"])
        process.on(s, () => p.close().then(() => process.exit(0)));
    })
    .catch(async (e) => {
      const mensaje =
        (e.code === "EADDRINUSE"
          ? "El servicio ya está iniciado en esta PC. Abre http://127.0.0.1:8767"
          : e.message) + "\n";
      await fs
        .appendFile(path.join(datos, "inicio.error.log"), mensaje)
        .catch(() => {});
      process.stderr.write(mensaje);
      process.exitCode = 1;
    });
}
