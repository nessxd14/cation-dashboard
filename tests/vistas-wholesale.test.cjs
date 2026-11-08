const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cargar = require("./cargar.cjs");
const fixture = require("./wholesale-fixture.cjs");

test("WholeSale abre en listado y consulta el expediente solo al seleccionar un pedido", async () => {
  let consultas = 0;
  const mocks = {
    "@/lib/wholesale-servidor": {
      obtenerPedidosWholesale: async () => ({ ...fixture.lista, total: 50 }),
      obtenerExpedienteWholesale: async () => {
        consultas++;
        return fixture.expediente;
      },
    },
    "@/lib/datos": { usuarioActual: async () => ({ id: "persona-qa" }) },
    "@/lib/operativo": { paginaValida: (v) => Math.max(1, Number(v) || 1) },
    "@/lib/enlaces": { enlaceOrigen: () => null },
  };
  const Page = cargar("app/(dash)/pedidos/page.tsx", mocks).default;
  const lista = await Page({
    searchParams: Promise.resolve({ buscar: "Ejemplo", pagina: "2" }),
  });
  assert.equal(consultas, 0);
  const visor = React.Children.toArray(lista.props.children).find(
    (el) => el.props?.etiquetaLista === "pedidos",
  );
  assert.equal(visor.props.seleccion, null);
  assert.equal(visor.props.preferenciaId, "persona-qa");
  assert.ok(visor.props.volver.includes("buscar=Ejemplo"));
  assert.equal(
    new URL(visor.props.volver, "http://local").searchParams.get("pagina"),
    "2",
  );
  const abierta = await Page({
    searchParams: Promise.resolve({
      pedido: "842",
      etapa: "pago",
      buscar: "Ejemplo",
      vista: "pagina",
    }),
  });
  assert.equal(consultas, 1);
  const detalle = React.Children.toArray(abierta.props.children).find(
    (el) => el.props?.etiquetaLista === "pedidos",
  );
  assert.equal(detalle.props.seleccion, "842");
  assert.equal(detalle.props.vistaPagina, true);
  assert.equal(detalle.props.abrirEtapa, true);
  assert.equal(detalle.props.resumen.props.datos.pedido.id, "842");
  assert.equal(
    new URL(detalle.props.volver, "http://local").searchParams.has("pedido"),
    false,
  );
  assert.equal(
    React.Children.toArray(detalle.props.detalle.props.children).at(-1).props
      .inicial,
    "pago",
  );
});

test("el resumen enlaza cada etapa y solo las evidencias de Telegram confirmadas", () => {
  const { ResumenPedidoWholesale } = cargar(
    "components/ResumenPedidoWholesale.tsx",
  );
  const { enlaceTelegram } = cargar("lib/wholesale.ts");
  const evidencia = fixture.expediente.evidencias[0];
  const enlace = "https://t.me/c/3058173908/9/24529";
  const salida = "https://t.me/c/3058173908/9/24530";
  const datos = {
    ...fixture.expediente,
    evidencias: [
      { ...evidencia, telegram_enlace: enlace },
      { ...evidencia, etapa: "SALIDA", telegram_enlace: salida },
      {
        ...evidencia,
        estado: "PENDIENTE",
        telegram_enlace: "https://t.me/c/3058173908/9/24531",
      },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(ResumenPedidoWholesale, {
      datos,
      params: { buscar: "Ejemplo" },
    }),
  );
  assert.equal((html.match(/Ver detalle ↗/g) ?? []).length, 6);
  assert.match(
    html,
    /buscar=Ejemplo&amp;pedido=842&amp;etapa=pago&amp;vista=pagina" target="_blank"/,
  );
  assert.match(html, /Andrea/);
  assert.match(html, /Rosa/);
  const filas = html.split('<tr role="row">');
  assert.ok(
    filas
      .find((fila) => fila.includes("Alistado / preparado"))
      .includes(enlace),
  );
  assert.ok(
    filas.find((fila) => fila.includes("Salida</th>")).includes(salida),
  );
  assert.equal(html.includes("24531"), false);
  assert.equal(enlaceTelegram(evidencia), null);
  assert.equal(
    enlaceTelegram({
      ...evidencia,
      telegram_enlace: "https://t.me.ejemplo.test/c/1/2/3",
    }),
    null,
  );
});

test("el expediente empieza a consultarse mientras carga el listado", async () => {
  let resolverLista;
  const lista = new Promise((resolve) => {
    resolverLista = resolve;
  });
  let detalleSolicitado = false;
  const Page = cargar("app/(dash)/pedidos/page.tsx", {
    "@/lib/wholesale-servidor": {
      obtenerPedidosWholesale: () => lista,
      obtenerExpedienteWholesale: async () => {
        detalleSolicitado = true;
        return fixture.expediente;
      },
    },
    "@/lib/datos": { usuarioActual: async () => null },
    "@/lib/operativo": { paginaValida: () => 1 },
  }).default;
  const pagina = Page({ searchParams: Promise.resolve({ pedido: "842" }) });
  await Promise.resolve();
  const enParalelo = detalleSolicitado;
  resolverLista(fixture.lista);
  await pagina;
  assert.equal(enParalelo, true);
});
