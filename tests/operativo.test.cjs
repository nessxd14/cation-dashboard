const { test } = require("node:test");
const assert = require("node:assert/strict");
const cargar = require("./cargar.cjs");

test("rango de fechas: calendario real, límite inclusivo y aviso al rechazar", () => {
  const { fechaValida, leerPeriodo } = cargar("lib/periodo.ts");
  assert.equal(fechaValida("2026-02-31"), false);
  assert.equal(fechaValida("2024-02-29"), true);
  assert.equal(fechaValida("0000-01-01"), false);
  assert.equal(
    leerPeriodo({ p: "rango", desde: "2025-01-01", hasta: "2026-02-04" }).clave,
    "rango",
  );
  for (const [desde, hasta] of [
    ["2025-01-01", "2026-02-05"],
    ["2026-02-31", "2026-03-01"],
    ["2026-10-31", "2026-10-01"],
  ]) {
    const p = leerPeriodo({ p: "rango", desde, hasta });
    assert.equal(p.clave, "30d");
    assert.ok(p.aviso);
  }
});
test("los enlaces conservan solo filtros comunes, no paginación de otra pantalla", () => {
  const { enlace, leerFiltros } = cargar("lib/filtros.ts");
  assert.deepEqual(
    leerFiltros({
      sucursal: "1",
      cliente: "NaN",
      producto: "-3",
      canal: ["MAYOR"],
    }),
    { sucursal: "1" },
  );
  const url = new URL(
    enlace(
      "/detalle",
      {
        p: "rango",
        desde: "2026-10-01",
        hasta: "2026-10-26",
        sucursal: "1",
        vendedor: "José & Ana",
        pagina: "9",
      },
      { tipo: "ventas" },
    ),
    "https://dashboard.local",
  );
  assert.equal(url.searchParams.get("vendedor"), "José & Ana");
  assert.equal(url.searchParams.get("sucursal"), "1");
  assert.equal(url.searchParams.get("pagina"), null);
  assert.equal(url.searchParams.get("tipo"), "ventas");
});
test("redirección de sesión conserva las cookies renovadas", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  const { middleware } = cargar("middleware.ts", {
    "@supabase/ssr": {
      createServerClient: (_url, _key, options) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              {
                name: "session",
                value: "renovada",
                options: { httpOnly: true, path: "/" },
              },
            ]);
            return { data: { user: { id: "test" } } };
          },
        },
      }),
    },
  });
  const response = await middleware(
    new NextRequest("https://dashboard.local/login"),
  );
  assert.equal(response.status, 307);
  assert.equal(response.cookies.get("session").value, "renovada");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("exportación rechaza cuentas sin autorización antes de consultar datos", async () => {
  let llamadas = 0;
  const { GET } = cargar("app/exportar/route.ts", {
    "@/lib/datos": {
      usuarioActual: async () => ({ id: "sin-acceso" }),
      tieneAcceso: async () => false,
    },
    "@/lib/reportes": {
      construirReporte: async () => {
        llamadas++;
      },
    },
    "@/lib/exportar": {},
  });
  const r = await GET({
    nextUrl: new URL(
      "https://dashboard.local/exportar?tipo=ventas&formato=xlsx",
    ),
  });
  assert.equal(r.status, 403);
  assert.equal(llamadas, 0);
});
test("servidor valida metas y costos antes de llamar a la base", async () => {
  let llamadas = 0;
  const mocks = {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/operativo": {
      rpc: async () => {
        llamadas++;
      },
    },
  };
  const { guardarCosto, guardarMeta } = cargar(
    "app/(dash)/configurar.ts",
    mocks,
  );
  for (const costo of ["", "-1", "NaN", "Infinity", "1e3", "0"]) {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      producto: "1",
      desde: "2026-10-01",
      costo,
    }))
      f.set(k, v);
    assert.equal((await guardarCosto({}, f)).ok, false);
  }
  const f = new FormData();
  for (const [k, v] of Object.entries({
    mes: "2026-10-02",
    ventas: "100",
    cobranza: "100",
  }))
    f.set(k, v);
  assert.equal((await guardarMeta({}, f)).ok, false);
  assert.equal(llamadas, 0);
});
