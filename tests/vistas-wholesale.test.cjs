const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
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
    }),
  });
  assert.equal(consultas, 1);
  const detalle = React.Children.toArray(abierta.props.children).find(
    (el) => el.props?.etiquetaLista === "pedidos",
  );
  assert.equal(detalle.props.seleccion, "842");
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
