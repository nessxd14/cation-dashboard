const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cargar = require("./cargar.cjs");

test("la insignia de salud no bloquea el render del servidor", () => {
  const { InsigniaSalud } = cargar("components/InsigniaSalud.tsx");
  // En el servidor no consulta nada: se pide en el navegador después de pintar
  assert.equal(renderToStaticMarkup(React.createElement(InsigniaSalud)), "");
});

test("el layout ya no consulta dash_salud en cada página", () => {
  const layout = fs.readFileSync(
    path.resolve(__dirname, "..", "app/(dash)/layout.tsx"),
    "utf8",
  );
  assert.ok(!layout.includes("obtenerSalud"));
  assert.ok(layout.includes("<InsigniaSalud />"));
});
