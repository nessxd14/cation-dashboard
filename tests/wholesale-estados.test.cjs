const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cargar = require("./cargar.cjs");
const { pedido } = require("./wholesale-fixture.cjs");
const { estadosEtapasWholesale: estados } = cargar("lib/wholesale-estados.ts");

test("cobro distingue abonos, revisión y saldo cero sin afirmar pago por falta de partidas", () => {
  assert.equal(estados(pedido).pago.texto, "Abono parcial");
  assert.equal(
    estados({ ...pedido, en_revision: 500 }).pago.texto,
    "Por verificar",
  );
  const sinSaldo = estados({
    ...pedido,
    aplicado: pedido.total,
    saldo: 0,
  }).pago;
  assert.equal(sinSaldo.texto, "Saldo cero");
  assert.match(sinSaldo.ayuda, /agregado/);
  assert.equal(
    estados({ ...pedido, partidas: 0, saldo: 0 }).pago.texto,
    "Sin partida",
  );
  assert.equal(
    estados({ ...pedido, aplicado: 0, saldo: pedido.total }).pago.texto,
    "Pendiente",
  );
});

test("importes ausentes, diferencias y cancelaciones no se presentan como cobro completo", () => {
  for (const valor of [null, undefined, NaN, "0"])
    assert.equal(
      estados({ ...pedido, saldo: valor }).pago.texto,
      "No disponible",
    );
  for (const cambios of [
    { saldo: -1 },
    { total_partidas: 100 },
    { aplicado: 0, saldo: 0 },
    { en_revision: pedido.total },
  ])
    assert.equal(
      estados({ ...pedido, ...cambios }).pago.texto,
      "Revisar cobro",
    );
  assert.equal(
    estados({ ...pedido, estado: "CANCELADO" }).pago.texto,
    "Revisar cobro",
  );
  assert.equal(
    estados({ ...pedido, estado: "CANCELADO", partidas: 0 }).pago.texto,
    "Cancelado",
  );
});

test("una marca no declara completas todas las tandas; fechas inválidas no son registro", () => {
  assert.equal(estados(pedido).alistado.texto, "Con preparado");
  assert.equal(estados(pedido).verificacion.texto, "Con verificación");
  assert.match(estados(pedido).verificacion.ayuda, /no que todas las tandas/);
  const abierto = estados({
    ...pedido,
    preparado_en: null,
    verificado_en: "fecha inválida",
  });
  assert.equal(abierto.alistado.texto, "En proceso");
  assert.equal(abierto.verificacion.texto, "Sin marca");
  assert.equal(
    estados({ ...pedido, preparaciones: 0, preparado_en: null }).alistado.texto,
    "Sin registro",
  );
});

test("salida exige líneas vigentes completas y movimientos vigentes", () => {
  assert.equal(estados(pedido).salida.texto, "Parcial");
  assert.equal(
    estados({ ...pedido, lineas_entregadas: 3 }).salida.texto,
    "Completa",
  );
  assert.equal(
    estados({ ...pedido, salidas: 0, lineas_entregadas: 3 }).salida.texto,
    "Sin salidas",
  );
  assert.notEqual(
    estados({ ...pedido, lineas_vigentes: 0, lineas_entregadas: 0 }).salida
      .texto,
    "Completa",
  );
  assert.equal(
    estados({ ...pedido, lineas_entregadas: 4 }).salida.texto,
    "No disponible",
  );
});

test("última actividad: tipo, tono, hora, creado y orden en los enlaces", () => {
  const { FilaPedidoWholesale, tonoActividad } = cargar(
    "components/FilaPedidoWholesale.tsx",
  );
  const { ordenWholesale, enlaceWholesale } = cargar("lib/wholesale.ts");
  const html = renderToStaticMarkup(
    React.createElement(FilaPedidoWholesale, {
      pedido: {
        ...pedido,
        creado_en: "2020-10-24T15:00:00Z",
        actividad_en: "2020-11-02T22:06:00Z",
        actividad_tipo: "Cobro aplicado",
      },
      params: { orden: "creacion" },
      seleccionado: false,
    }),
  );
  assert.ok(html.includes("Cobro aplicado"));
  assert.ok(html.includes('data-tono="violeta"'));
  assert.ok(html.includes("02/11 18:06"));
  assert.ok(html.includes("creado 24/10"));
  assert.ok(html.includes("orden=creacion"));
  const sin = renderToStaticMarkup(
    React.createElement(FilaPedidoWholesale, {
      pedido: { ...pedido, actividad_en: null },
      params: {},
      seleccionado: false,
    }),
  );
  assert.ok(sin.includes("—"));
  assert.equal(tonoActividad("Pedido anulado"), "rojo");
  assert.equal(tonoActividad("Salida registrada"), "verde");
  assert.equal(tonoActividad("Alistado en proceso"), "azul");
  assert.equal(tonoActividad("Pedido editado"), "ambar");
  assert.equal(tonoActividad("otra cosa"), "gris");
  assert.equal(ordenWholesale("creacion"), "creacion");
  assert.equal(ordenWholesale("x"), "actividad");
  assert.equal(ordenWholesale(undefined), "actividad");
  assert.ok(enlaceWholesale({ orden: "creacion" }, {}).includes("orden=creacion"));
});

test("cada etapa mantiene su enlace, texto e icono decorativo; conserva filtros y selección", () => {
  const { FilaPedidoWholesale } = cargar("components/FilaPedidoWholesale.tsx");
  const html = renderToStaticMarkup(
    React.createElement(FilaPedidoWholesale, {
      pedido,
      params: { buscar: "Ana & José", pagina: "2" },
      seleccionado: true,
    }),
  );
  for (const etapa of [
    "cotizacion",
    "pedido",
    "alistado",
    "verificacion",
    "salida",
    "pago",
  ])
    assert.ok(html.includes(`etapa=${etapa}`));
  assert.ok(html.includes("pagina=2"));
  assert.ok(html.includes("ws-seleccionado"));
  assert.ok(html.includes("Abono parcial"));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.equal((html.match(/<svg/g) || []).length, 6);
  assert.ok(html.includes("1 de 3 líneas completas"));
});

test("filtros rápidos: solo valores conocidos, claves de p_filtros y enlaces que los conservan", () => {
  const {
    filtrosRapidosWholesale,
    filtrosRapidosRpc,
    enlaceWholesale,
  } = cargar("lib/wholesale.ts");
  const f = filtrosRapidosWholesale({
    ws_estado: "abierto",
    ws_cobro: "x",
    ws_actividad: "problemas",
    ws_sin_mov: "5",
  });
  assert.deepEqual(f, { ws_estado: "abierto", ws_actividad: "problemas" });
  assert.deepEqual(filtrosRapidosWholesale({ ws_sin_mov: "7" }), {
    ws_sin_mov: "7",
  });
  assert.deepEqual(filtrosRapidosRpc({ ws_cobro: "con_saldo", ws_sin_mov: "7" }), {
    cobro: "con_saldo",
    sin_mov: "7",
  });
  const url = enlaceWholesale({ ws_estado: "abierto", ws_cobro: "parcial", pagina: "2" }, { pagina: "" });
  assert.ok(url.includes("ws_estado=abierto"));
  assert.ok(url.includes("ws_cobro=parcial"));
  assert.ok(!url.includes("pagina="));
});

test("tonos de actividad coinciden con analitica.actividad_familia", () => {
  const { tonoActividad } = cargar("components/FilaPedidoWholesale.tsx");
  // Etiquetas reales de analitica.pedido_actividad_eventos y su familia en SQL
  const familia = {
    problemas: "rojo",
    cobro: "violeta",
    salida: "verde",
    cambios: "ambar",
    almacen: "azul",
    otros: "gris",
  };
  const sql = {
    "Alistado": "almacen",
    "Alistado en curso": "almacen",
    "Alistado iniciado": "almacen",
    "Verificado": "almacen",
    "Verificación en curso": "almacen",
    "Pedido creado": "otros",
    "Reemplazo de material": "otros",
    "Preparación reabierta": "otros",
    "Cobro aplicado": "cobro",
    "Anticipo en caja": "cobro",
    "Pedido anulado": "problemas",
    "Pedido rechazado": "problemas",
    "Ítem rechazado": "problemas",
    "Compra cancelada": "problemas",
    "Incidencia de almacén": "problemas",
    "Pedido editado": "cambios",
    "Pedido restaurado": "cambios",
    "Ítem cambiado": "cambios",
    "Ítem retirado": "cambios",
    "Ítems agregados": "cambios",
    "Ítem devuelto a almacén": "cambios",
    "Compra alistada": "cambios",
    "Compra realizada": "cambios",
    "Compra recibida": "cambios",
    "Enviado a compra": "cambios",
    "Retiro confirmado": "salida",
    "Despacho registrado": "salida",
    "Salida de mercadería": "salida",
  };
  for (const [tipo, fam] of Object.entries(sql))
    assert.equal(tonoActividad(tipo), familia[fam], tipo);
});
