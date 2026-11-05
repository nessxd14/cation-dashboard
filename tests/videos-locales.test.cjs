const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const {
  createHmac,
  createHash,
  randomBytes,
  randomUUID,
} = require("node:crypto");
const cargar = require("./cargar.cjs");
const origin = "https://cation-dashboard.vercel.app";
function firma(config, reto, extras = {}) {
  const carga = Buffer.from(
    JSON.stringify({
      aud: "cation-videos-locales",
      equipo: config.id,
      usuario: randomUUID(),
      reto,
      exp: Math.floor(Date.now() / 1000) + 90,
      ...extras,
    }),
  ).toString("base64url");
  return (
    carga + "." + createHmac("sha256", config.clave).update(carga).digest("hex")
  );
}
async function esperarIndice(p) {
  for (let n = 0; n < 300 && p.estado().escaneando; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(p.estado().escaneando, false);
}

test("videos locales: código por equipo y fechas de grabación en Bolivia", () => {
  const v = cargar("lib/videos-locales.ts");
  const id = randomUUID(),
    clave = randomBytes(32).toString("hex");
  assert.deepEqual(v.codigoEquipoVideo(id + ":" + clave), { id, clave });
  for (const code of [
    id + ":" + clave + ":otro",
    "../archivo",
    null,
    Array(200).fill("x").join(""),
  ])
    assert.equal(v.codigoEquipoVideo(code), null);
  assert.equal(
    v.fechaGrabacionBolivia("2026-11-05T08:30"),
    "2026-11-05T12:30:00.000Z",
  );
  assert.equal(v.fechaGrabacionBolivia("2026-02-31T08:30"), null);
  assert.equal(v.fechaGrabacionBolivia("2026-11-05T24:50"), null);
});
test("videos locales: permisos firmados no sirven para otro equipo, reto o después de vencer", async () => {
  const { verificarAcceso, rangoBytes } = await import(
    "../puente-videos/servidor.mjs"
  );
  const config = { id: randomUUID(), clave: randomBytes(32).toString("hex") },
    reto = randomBytes(32).toString("hex");
  assert.equal(
    verificarAcceso(firma(config, reto), config, reto).equipo,
    config.id,
  );
  for (const t of [
    firma(config, reto, { exp: 1 }),
    firma(config, reto, { aud: "otro" }),
    firma(config, reto, { equipo: randomUUID() }),
    firma(config, "otro"),
    firma({ ...config, clave: "f".repeat(64) }, reto),
    "eyJ9.00",
  ])
    assert.throws(() => verificarAcceso(t, config, reto));
  assert.deepEqual(rangoBytes("bytes=5-9", 20), {
    inicio: 5,
    fin: 9,
    parcial: true,
  });
  assert.deepEqual(rangoBytes("bytes=-5", 20), {
    inicio: 15,
    fin: 19,
    parcial: true,
  });
  for (const r of [
    "bytes=30-",
    "bytes=1-2,4-5",
    "bytes=-0",
    "bytes=10-2",
    "bytes=-",
  ])
    assert.throws(() => rangoBytes(r, 20));
});
test("videos locales: lectura autenticada por rangos, aislamiento de carpeta y archivos modificados", async () => {
  const { crearPuente } = await import("../puente-videos/servidor.mjs");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "cation-video-test-"));
  let p, p2;
  try {
    const carpeta = path.join(temp, "grabaciones"),
      datos = path.join(temp, "equipo"),
      fuera = path.join(temp, "fuera");
    await fs.mkdir(carpeta);
    await fs.mkdir(datos);
    await fs.mkdir(fuera);
    const bytes = Buffer.alloc(4096);
    for (let n = 0; n < bytes.length; n++) bytes[n] = n % 251;
    await fs.writeFile(path.join(carpeta, "clip.mp4"), bytes);
    await fs.writeFile(path.join(fuera, "privado.mp4"), "no-se-comparte");
    await fs.symlink(fuera, path.join(carpeta, "atajo"), "junction");
    const config = {
      id: randomUUID(),
      clave: randomBytes(32).toString("hex"),
      nombre: "Equipo de prueba",
      carpeta,
      dashboardOrigin: origin,
    };
    await fs.writeFile(
      path.join(datos, "config.json"),
      "\uFEFF" + JSON.stringify(config),
    );
    p = await crearPuente({ carpetaDatos: datos, puerto: 0 });
    await esperarIndice(p);
    const identidad = await (
      await fetch(p.url + "/v1/identidad", { headers: { Origin: origin } })
    ).json();
    assert.equal(identidad.id, config.id);
    assert.equal(Object.hasOwn(identidad, "carpeta"), false);
    assert.equal(Object.hasOwn(identidad, "clave"), false);
    const headers = {
      Origin: origin,
      Authorization: "Bearer " + firma(config, identidad.reto),
    };
    assert.equal(
      (await fetch(p.url + "/v1/archivos", { headers: { Origin: origin } }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(p.url + "/v1/archivos", {
          headers: { ...headers, Origin: "https://sitio-ajeno.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(p.url + "/", { headers: { Origin: origin } })).status,
      403,
    );
    const hostAjeno = await new Promise((resolve, reject) => {
      const req = http.get(
        p.url + "/v1/identidad",
        { headers: { Host: "dominio-ajeno.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
    });
    assert.equal(hostAjeno, 403);
    const response = await fetch(p.url + "/v1/archivos", { headers }),
      lista = await response.json();
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(lista.filas.length, 1);
    const archivo = lista.filas[0];
    assert.equal(
      archivo.clave,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(Object.hasOwn(archivo, "ruta"), false);
    assert.equal(JSON.stringify(lista).includes("privado"), false);
    const post = async (ruta, body) =>
      fetch(p.url + ruta, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const disponibles = await (
      await post("/v1/disponibles", { claves: [archivo.clave, "0".repeat(64)] })
    ).json();
    assert.equal(disponibles.archivos.length, 1);
    const play = await (
      await post("/v1/reproduccion", { clave: archivo.clave })
    ).json();
    let video = await fetch(p.url + play.ruta, {
      headers: { Origin: origin, Range: "bytes=100-200" },
    });
    assert.equal(video.status, 206);
    assert.equal(video.headers.get("content-range"), "bytes 100-200/4096");
    assert.deepEqual(
      Buffer.from(await video.arrayBuffer()),
      bytes.subarray(100, 201),
    );
    video = await fetch(p.url + play.ruta, {
      method: "HEAD",
      headers: { Origin: origin },
    });
    assert.equal(video.headers.get("content-length"), "4096");
    video = await fetch(p.url + play.ruta, {
      headers: { Origin: origin, Range: "bytes=9999-" },
    });
    assert.equal(video.status, 416);
    assert.equal(video.headers.get("content-range"), "bytes */4096");
    assert.equal(
      (
        await fetch(p.url + play.ruta.replace(/ticket=.*/, "ticket=invalido"), {
          headers: { Origin: origin },
        })
      ).status,
      401,
    );
    await fs.writeFile(path.join(carpeta, "clip.mp4"), Buffer.alloc(4097));
    assert.equal(
      (await fetch(p.url + play.ruta, { headers: { Origin: origin } })).status,
      409,
    );
    const otra = path.join(temp, "otra-carpeta"),
      otrosDatos = path.join(temp, "otra-pc");
    await fs.mkdir(otra);
    await fs.mkdir(otrosDatos);
    await fs.writeFile(path.join(otra, "nombre-distinto.mp4"), bytes);
    const config2 = {
      ...config,
      id: randomUUID(),
      clave: randomBytes(32).toString("hex"),
      carpeta: otra,
    };
    await fs.writeFile(
      path.join(otrosDatos, "config.json"),
      JSON.stringify(config2),
    );
    p2 = await crearPuente({ carpetaDatos: otrosDatos, puerto: 0 });
    await esperarIndice(p2);
    const i2 = await (await fetch(p2.url + "/v1/identidad")).json(),
      l2 = await (
        await fetch(p2.url + "/v1/archivos", {
          headers: {
            Origin: origin,
            Authorization: "Bearer " + firma(config2, i2.reto),
          },
        })
      ).json();
    assert.equal(l2.filas[0].clave, archivo.clave);
    assert.equal(l2.filas[0].nombre, "nombre-distinto.mp4");
    assert.equal(
      (await fetch(p2.url + "/v1/archivos", { headers })).status,
      401,
    );
  } finally {
    if (p) await p.close();
    if (p2) await p2.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
test("videos locales: server actions validan antes de escribir y solo solicitan permisos del puente", async () => {
  const llamadas = [];
  const acciones = cargar("app/(dash)/videos/acciones.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": {
      crearClienteServidor: async () => ({
        rpc: async (nombre, args) => {
          llamadas.push({ nombre, args });
          return {
            data:
              nombre === "dash_video_acceso"
                ? { ticket: "permiso-local", expira: 123 }
                : randomUUID(),
            error: null,
          };
        },
      }),
    },
  });
  assert.equal((await acciones.registrarPuente("invalido", "PC")).ok, false);
  assert.equal((await acciones.accesoPuente("invalido", "x")).ok, false);
  const base = {
    pedido: "842",
    preparacion: "20",
    archivo: "a".repeat(64),
    nombre: "clip.mp4",
    bytes: 2048,
    camara: "Cámara A",
    inicio: "",
    fin: "",
  };
  assert.equal(
    (await acciones.vincularVideoLocal({ ...base, nombre: "../clip.mp4" })).ok,
    false,
  );
  assert.equal(
    (await acciones.vincularVideoLocal({ ...base, inicio: "2026-11-05T09:00" }))
      .ok,
    false,
  );
  assert.equal(llamadas.length, 0);
  assert.equal((await acciones.vincularVideoLocal(base)).ok, true);
  assert.equal(llamadas[0].nombre, "dash_vincular_video_local");
  assert.equal(llamadas[0].args.p_inicio, null);
  const id = randomUUID();
  assert.equal((await acciones.accesoPuente(id, "b".repeat(64))).ok, true);
  assert.equal(llamadas[1].nombre, "dash_video_acceso");
});
