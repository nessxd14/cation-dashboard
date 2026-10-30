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
