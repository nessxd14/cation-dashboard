// Revisión visual local con datos ficticios. No autentica ni escribe en Supabase.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
const cargar = require("../tests/cargar.cjs");
const catalogos = {
  sucursales: [
    { id: "1", nombre: "Almacén Central" },
    { id: "2", nombre: "Tienda" },
  ],
  vendedores: [{ id: "ana", nombre: "Ana" }],
  clientes: [{ id: "5", nombre: "Cliente de ejemplo" }],
  canales: [{ id: "MAYOR", nombre: "Mayor" }],
  productos: [
    { id: "10", nombre: "Papel bond · hoja" },
    { id: "11", nombre: "Marcador azul · unidad" },
  ],
};
const inventario = {
  total: 2,
  sin_stock: 1,
  bajo_minimo: 1,
  riesgo: 0,
  filas: [
    {
      id: "10",
      producto: "Papel bond tamaño carta",
      unidad: "hoja",
      fisico: 4000,
      reservado_global: 3500,
      disponible: 500,
      minimo: 1000,
      reorden: 1200,
      transito: 2000,
      cobertura_dias: 4.5,
      estado: "BAJO_MINIMO",
      ubicaciones: [
        { sucursal: "Almacén Central", ubicacion: "Estante A", cantidad: 4000 },
      ],
    },
    {
      id: "11",
      producto: "Marcador permanente azul",
      unidad: "unidad",
      fisico: 0,
      reservado_global: 8,
      disponible: 0,
      minimo: 10,
      reorden: 20,
      transito: 30,
      cobertura_dias: 0,
      estado: "SIN_STOCK",
      ubicaciones: [],
    },
  ],
};
const datos = {
  obtenerCatalogos: async () => catalogos,
  obtenerInventario: async () => inventario,
  obtenerCobranza: async () => ({
    clientes: [
      {
        id: "5",
        cliente: "Cliente de ejemplo",
        saldo: 18000,
        vencido: 9500,
        dias_vencido: 45,
        ultimo_pago: "2026-10-10T15:00:00Z",
        sin_partida: 1000,
        por_verificar: 1,
        prioridad: "ALTA",
      },
      {
        id: "6",
        cliente: "Distribuidora de ejemplo",
        saldo: 2500,
        vencido: 0,
        dias_vencido: null,
        ultimo_pago: null,
        sin_partida: 0,
        por_verificar: 0,
        prioridad: "PREVENTIVA",
      },
    ],
  }),
  obtenerMetas: async () => ({
    mes: "2026-10-01",
    hasta: "2026-10-31",
    hoy: "2026-10-26",
    ventas: 85000,
    cobranza: 72000,
    meta: { ventas: 100000, cobranza: 90000 },
  }),
  obtenerMargen: async () => ({
    vendido: 85000,
    con_costo: 60000,
    costo: 45000,
    utilidad: 15000,
    lineas_sin_costo: 17,
    grupos: [
      {
        dimension: "producto",
        nombre: "Papel bond tamaño carta",
        vendido: 50000,
        con_costo: 50000,
        costo: 37500,
      },
      {
        dimension: "producto",
        nombre: "Marcador permanente azul",
        vendido: 35000,
        con_costo: 10000,
        costo: 7500,
      },
    ],
    costos: [
      {
        producto_id: "10",
        producto: "Papel bond tamaño carta",
        unidad: "hoja",
        desde: "2026-10-01",
        costo_base: 0.2,
        nota: "Costo de referencia de prueba",
      },
    ],
  }),
  obtenerDetalle: async () => ({
    total: 2,
    monto: 1500,
    filas: [
      {
        id: "1",
        fecha: "2026-10-26",
        documento: "PED-0001",
        cliente: "Cliente de ejemplo",
        concepto: "Papel bond tamaño carta",
        cantidad: 4000,
        monto: 1200,
        origen: "PEDIDO",
        referencia_id: "1",
        producto_id: "10",
      },
      {
        id: "2",
        fecha: "2026-10-25",
        documento: "VTA-0002",
        cliente: "Distribuidora de ejemplo",
        concepto: "Marcador permanente azul",
        cantidad: 100,
        monto: 300,
        origen: "RETAIL",
        referencia_id: "2",
        producto_id: "11",
      },
    ],
  }),
  paginaValida: () => 1,
  rpc: async () => ({}),
};
async function resolver(el) {
  if (Array.isArray(el)) return Promise.all(el.map(resolver));
  if (!React.isValidElement(el)) return el;
  if (
    typeof el.type === "function" &&
    el.type.constructor.name === "AsyncFunction"
  )
    return resolver(await el.type(el.props));
  if (el.props.children !== undefined) {
    const hijos = await resolver(el.props.children);
    return Array.isArray(hijos)
      ? React.cloneElement(el, undefined, ...hijos)
      : React.cloneElement(el, undefined, hijos);
  }
  return el;
}
async function pagina(nombre) {
  const params = new URLSearchParams({ p: "mes" });
  const mocks = {
    "@/lib/operativo": datos,
    "@/app/(dash)/configurar": {
      guardarMeta: () => {},
      guardarCosto: () => {},
    },
    "@/app/login/actions": { salir: () => {} },
    "@/app/(dash)/actions": { alternarLiviano: () => {} },
    react: {
      ...React,
      useActionState: () => [
        { error: null, ok: false },
        "/qa-no-submit",
        false,
      ],
    },
    "next/navigation": {
      usePathname: () => `/${nombre}`,
      useSearchParams: () => params,
      useRouter: () => ({ refresh() {} }),
      redirect: (r) => {
        throw new Error(r);
      },
      notFound: () => {
        throw new Error("404");
      },
    },
    "next/link": ({ href, children, ...props }) =>
      React.createElement("a", { href, ...props }, children),
  };
  const Page = cargar(`app/(dash)/${nombre}/page.tsx`, mocks).default;
  const Menu = cargar("components/Menu.tsx", mocks).Menu;
  const contenido = await resolver(
    await Page({ searchParams: Promise.resolve(Object.fromEntries(params)) }),
  );
  const marco = React.createElement(
    "div",
    { className: "escena" },
    React.createElement("div", { className: "luz luz-1" }),
    React.createElement("div", { className: "luz luz-2" }),
    React.createElement(
      "div",
      { className: "marco" },
      React.createElement(Menu, {
        correo: "revision@ejemplo.local",
        alertas: 3,
        hora: "20:45",
        liviano: false,
      }),
      React.createElement("main", { className: "contenido" }, contenido),
    ),
  );
  return (
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CATION · revisión visual</title><style>' +
    fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8") +
    "</style>" +
    renderToStaticMarkup(marco) +
    "</html>"
  );
}
(async () => {
  const paginas = {};
  for (const n of ["inventario", "margen", "metas", "cobranza", "detalle"])
    paginas[`/${n}`] = await pagina(n);
  http
    .createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1:3208");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (u.pathname === "/movil") {
        res.end(
          `<html><body style="margin:0;background:#222;display:grid;place-items:center"><iframe title="Vista móvil" style="border:0;width:390px;height:844px" src="/${u.searchParams.get("pagina") || "inventario"}"></iframe></body></html>`,
        );
      } else res.end(paginas[u.pathname] || paginas["/inventario"]);
    })
    .listen(3208, "127.0.0.1", () =>
      process.stdout.write(
        "Revisión visual: http://127.0.0.1:3208/inventario\n",
      ),
    );
})();
