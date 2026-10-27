import Link from "next/link";
import { redirect } from "next/navigation";
import { Cabecera } from "@/components/Cabecera";
import { Kpi, Panel } from "@/components/piezas";
import { Paginacion } from "@/components/Paginacion";
import { FormCosto } from "@/components/Configuracion";
import { enlace, leerFiltros, type Parametros } from "@/lib/filtros";
import { leerPeriodo } from "@/lib/periodo";
import { obtenerCatalogos, obtenerMargen, paginaValida } from "@/lib/operativo";
import { bs, pct, entero, hoyLaPaz } from "@/lib/formato";

export default async function MargenPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams,
    p = leerPeriodo(params),
    f = leerFiltros(params),
    pagina = paginaValida(params.pagina);
  const [m, catalogos] = await Promise.all([
    obtenerMargen(p.desde, p.hasta, f),
    obtenerCatalogos(),
  ]);
  const dimension =
    typeof params.dimension === "string" &&
    ["producto", "canal", "vendedor"].includes(params.dimension)
      ? params.dimension
      : "producto";
  const grupos = m.grupos.filter((g) => g.dimension === dimension);
  if (pagina > 1 && (pagina - 1) * 50 >= grupos.length)
    redirect(enlace("/margen", params, { dimension }));
  return (
    <>
      <Cabecera
        titulo="Utilidad y margen"
        sub="Margen bruto estimado con costos de referencia por unidad base"
        ruta="/margen"
        params={params}
        tipos={["margen", "ventas"]}
      />
      <section className="kpis">
        <Kpi
          nombre="Vendido"
          valor={bs(m.vendido)}
          nota="Todas las líneas que coinciden con los filtros"
          color="var(--pedidos)"
        />
        <Kpi
          nombre="Cobertura de costos"
          valor={pct(m.vendido > 0 ? m.con_costo / m.vendido : null)}
          nota={`${entero(m.lineas_sin_costo)} líneas sin costo vigente`}
          color="var(--aviso)"
        />
        <Kpi
          nombre="Utilidad bruta estimada"
          valor={bs(m.utilidad)}
          nota={`Solo sobre ${bs(m.con_costo)} con costo registrado`}
          color="var(--cobrado)"
        />
        <Kpi
          nombre="Margen sobre ventas cubiertas"
          valor={pct(
            m.con_costo > 0 && m.utilidad !== null
              ? m.utilidad / m.con_costo
              : null,
          )}
          nota="Las ventas sin costo no se consideran ganancia"
          color="var(--cartera)"
        />
      </section>
      {m.lineas_sin_costo > 0 ? (
        <p className="aviso">
          El margen está incompleto. Carga costos vigentes para las fechas de
          venta; no se usa el precio de venta como costo. No incluye gastos
          operativos, impuestos ni comisiones.
        </p>
      ) : null}
      <Panel
        titulo="Rentabilidad por grupo"
        sub="Vendido incluye todas las líneas; costo y utilidad solo incluyen las cubiertas."
      >
        <nav className="enlaces-seccion">
          {["producto", "canal", "vendedor"].map((d) => (
            <Link
              aria-current={dimension === d ? "page" : undefined}
              key={d}
              href={enlace("/margen", params, { dimension: d })}
            >
              Por {d}
            </Link>
          ))}
        </nav>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Grupo</th>
                <th className="der">Vendido</th>
                <th className="der">Con costo</th>
                <th className="der">Costo</th>
                <th className="der">Utilidad</th>
                <th className="der">Margen</th>
              </tr>
            </thead>
            <tbody>
              {grupos.slice((pagina - 1) * 50, pagina * 50).map((g) => (
                <tr key={g.nombre}>
                  <td>{g.nombre}</td>
                  <td className="der mono">{bs(g.vendido)}</td>
                  <td className="der mono">{bs(g.con_costo)}</td>
                  <td className="der mono">{bs(g.costo)}</td>
                  <td className="der mono">
                    {bs(g.costo === null ? null : (g.con_costo ?? 0) - g.costo)}
                  </td>
                  <td className="der mono">
                    {pct(
                      g.costo !== null && g.con_costo && g.con_costo > 0
                        ? (g.con_costo - g.costo) / g.con_costo
                        : null,
                    )}
                  </td>
                </tr>
              ))}
              {!grupos.length ? (
                <tr>
                  <td colSpan={6}>No hay ventas para estos filtros.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Paginacion
          total={grupos.length}
          pagina={pagina}
          ruta="/margen"
          params={params}
          extras={{ dimension }}
        />
      </Panel>
      <Panel
        titulo="Costo de referencia"
        sub="Registra el costo de una unidad base, no de una presentación. La fecha define desde qué ventas se aplica. Guardar la misma fecha corrige ese valor; una nueva fecha conserva el histórico."
      >
        <FormCosto
          productos={catalogos.productos}
          seleccionado={f.producto}
          desde={hoyLaPaz()}
        />
      </Panel>
      <Panel titulo="Histórico de costos registrados">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Vigente desde</th>
                <th className="der">Costo por unidad base</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {m.costos.map((c) => (
                <tr key={`${c.producto_id}-${c.desde}`}>
                  <td>
                    {c.producto}
                    <span className="fila-sub">{c.unidad}</span>
                  </td>
                  <td>{c.desde}</td>
                  <td className="der mono">
                    {c.costo_base.toLocaleString("es-BO", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}
                  </td>
                  <td>{c.nota || "—"}</td>
                </tr>
              ))}
              {!m.costos.length ? (
                <tr>
                  <td colSpan={4}>
                    Todavía no hay costos de referencia registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
