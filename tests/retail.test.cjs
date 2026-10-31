const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cargar = require("./cargar.cjs");
const fixture = require("./retail-fixture.cjs");

test("retail: enlaces conservan período, tipo, estado y página; limpian la selección", () => {
  const r = cargar("lib/retail.ts");
  const params = {
    p: "rango",
    desde: "2026-10-01",
    hasta: "2026-10-31",
    cliente: "5",
    retail_tipo: "VTD",
    retail_estado: "revision",
    pagina: "2",
    venta: "101",
  };
  const u = new URL(r.enlaceRetail(params, { venta: "102" }), "https://local");
  for (const key of [
    "p",
    "desde",
    "hasta",
    "cliente",
    "retail_tipo",
    "retail_estado",
    "pagina",
  ])
    assert.equal(u.searchParams.get(key), params[key]);
  assert.equal(u.searchParams.get("venta"), "102");
  assert.equal(
    new URL(r.enlaceRetail(params), "https://local").searchParams.has("venta"),
    false,
  );
  assert.equal(r.idRetail("1e3"), null);
  assert.equal(r.idRetail(["1"]), null);
  assert.equal(r.idRetail("0"), null);
  assert.equal(r.tipoRetail(["VTA"]), "TODAS");
  assert.equal(r.estadoRetail("__proto__"), "todos");
});
test("retail: pago en revisión y saldo a favor no se presentan como efectivo confirmado", () => {
  const { cobroRetail } = cargar("lib/retail.ts");
  const d = fixture.documentos[0];
  assert.equal(
    cobroRetail({ ...d, en_revision: 420, cobrado: 0 }).texto,
    "Pago en revisión",
  );
  assert.equal(
    cobroRetail({ ...d, saldo_favor: 420, cobrado: 0 }).texto,
    "Cubierta · incluye saldo",
  );
  assert.equal(
    cobroRetail({ ...d, anulada: true }).texto,
    "Anulada · ver historial",
  );
  assert.equal(
    cobroRetail({ ...d, pendiente: 420, pago_posterior: true }).texto,
    "Pago posterior",
  );
});
test("retail: expediente muestra reparto del cobro, entrega independiente y texto escapado", () => {
  const { ExpedienteRetail } = cargar("components/ExpedienteRetail.tsx");
  const d = fixture.expediente("101");
  d.notas = '<script>alert("nota")</script>';
  const html = renderToStaticMarkup(
    React.createElement(ExpedienteRetail, {
      d,
      params: { retail_tipo: "VTD", retail_estado: "entrega", pagina: "2" },
    }),
  );
  assert.match(html, /CJA-DEMO-001/);
  assert.match(html, /VTA-DEMO-001/);
  assert.match(html, /En Caja/);
  assert.match(html, /retail_tipo=VTD/);
  assert.match(html, /venta=102/);
  assert.match(html, /pagina=2/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Material enviado a Caja/);
  assert.doesNotMatch(html, /&quot;version&quot;/);
});
test("retail: consulta utiliza RPC de lectura con la sesión del usuario", async () => {
  const calls = [];
  const { obtenerListaRetail, obtenerExpedienteRetail } = cargar(
    "lib/retail-servidor.ts",
    {
      "./supabase/server": {
        crearClienteServidor: async () => ({
          rpc: async (name, args) => {
            calls.push({ name, args });
            return name === "dash_retail_expediente"
              ? { error: { code: "P0002" } }
              : { data: { total: 0 }, error: null };
          },
        }),
      },
    },
  );
  assert.deepEqual(
    await obtenerListaRetail(
      "2026-10-01",
      "2026-10-31",
      { sucursal: "1" },
      "VTD",
      "cobro",
      2,
    ),
    { total: 0 },
  );
  assert.equal(calls[0].name, "dash_retail_lista");
  assert.equal(calls[0].args.p_tipo, "VTD");
  assert.equal(calls[0].args.p_estado, "cobro");
  assert.deepEqual(calls[0].args.p_filtros, { sucursal: "1" });
  assert.equal(await obtenerExpedienteRetail("999"), null);
});
test("retail: pantalla vacía y paginación conservan el alcance sin consultar con IDs inválidos", async () => {
  let consultas = 0;
  const mocks = {
    "@/lib/retail-servidor": {
      ...fixture,
      obtenerExpedienteRetail: async (id) => {
        consultas++;
        return fixture.expediente(id);
      },
    },
    "@/components/Cabecera": {
      Cabecera: () => React.createElement("h1", null, "Ventas retail"),
    },
    "@/components/ErrorConsulta": {
      ErrorConsulta: ({ mensaje }) => React.createElement("p", null, mensaje),
    },
    "next/navigation": {
      notFound: () => {
        throw new Error("NOT_FOUND");
      },
      redirect: () => {
        throw new Error("REDIRECT");
      },
    },
    "next/link": ({ href, children, ...p }) =>
      React.createElement("a", { href, ...p }, children),
  };
  const Page = cargar("app/(dash)/retail/page.tsx", mocks).default;
  await assert.rejects(
    Page({ searchParams: Promise.resolve({ venta: "-1" }) }),
    /NOT_FOUND/,
  );
  assert.equal(consultas, 0);
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        retail_tipo: "VTA",
        retail_estado: "entrega",
      }),
    }),
  );
  assert.match(html, /No hay documentos con estos filtros/);
  assert.match(html, /Importe vigente/);
});
