const { test } = require("node:test");
const assert = require("node:assert/strict");
const cargar = require("./cargar.cjs");

test("un timeout de la RPC se presenta como aviso recuperable en el Resumen", async () => {
  const cache = new Map();
  const mocks = {
    "./supabase/server": {
      crearClienteServidor: async () => ({
        rpc: async (nombre) =>
          nombre === "dash_resumen"
            ? {
                error: {
                  code: "57014",
                  message: "canceling statement due to statement timeout",
                },
              }
            : { data: [] },
      }),
    },
    react: { ...require("react"), cache: (fn) => fn },
  };
  const { default: Page } = cargar("app/(dash)/page.tsx", mocks, cache);
  const result = await Page({ searchParams: Promise.resolve({}) });
  assert.match(result.props.mensaje, /tardó más de lo permitido/);
  assert.equal(result.props.mensaje.includes("statement timeout"), false);
});
test("el error inesperado del servidor no publica el texto técnico", () => {
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const ErrorDash = cargar("app/(dash)/error.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": ({ href, children, ...p }) =>
      React.createElement("a", { href, ...p }, children),
  }).default;
  const html = renderToString(
    React.createElement(ErrorDash, {
      error: { message: "detalle interno secreto", digest: "3545139971" },
      reset() {},
    }),
  );
  assert.equal(html.includes("detalle interno secreto"), false);
  assert.ok(html.includes("3545139971"));
  assert.ok(html.includes("Reintentar"));
});
