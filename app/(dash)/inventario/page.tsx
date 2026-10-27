import { redirect } from "next/navigation";
import { Cabecera } from "@/components/Cabecera";
import { Kpi, Panel } from "@/components/piezas";
import { Paginacion } from "@/components/Paginacion";
import { enlace, leerFiltros, type Parametros } from "@/lib/filtros";
import { obtenerInventario, paginaValida } from "@/lib/operativo";
import { entero } from "@/lib/formato";
import { enlaceOrigen } from "@/lib/enlaces";

const ESTADOS: Record<string, string> = {
  SIN_STOCK: "Sin disponible",
  BAJO_MINIMO: "Bajo mínimo",
  RIESGO_7_DIAS: "Cobertura menor a 7 días",
  OK: "Disponible",
};
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams,
    pagina = paginaValida(params.pagina);
  const i = await obtenerInventario(leerFiltros(params), pagina);
  if (pagina > 1 && (pagina - 1) * 50 >= i.total)
    redirect(enlace("/inventario", params));
  return (
    <>
      <Cabecera
        titulo="Inventario disponible"
        sub="Estado actual · sucursal y producto · unidades base por producto"
        ruta="/inventario"
        params={params}
        tipos={["inventario"]}
      />
      <section className="kpis">
        <Kpi
          nombre="Productos activos"
          valor={entero(i.total)}
          nota="Incluye los que no tienen existencias"
          color="var(--pedidos)"
        />
        <Kpi
          nombre="Sin disponible"
          valor={entero(i.sin_stock)}
          nota="Físico agotado o comprometido por reservas"
          color="var(--critico)"
        />
        <Kpi
          nombre="Bajo mínimo"
          valor={entero(i.bajo_minimo)}
          nota="Menor al mínimo o punto de reorden configurado"
          color="var(--aviso)"
        />
        <Kpi
          nombre="Riesgo en 7 días"
          valor={entero(i.riesgo)}
          nota="Según salidas vigentes de los últimos 30 días"
          color="var(--cartera)"
        />
      </section>
      <Panel
        titulo="Productos y ubicaciones"
        sub="Disponible: físico vendible limitado por la reserva global. Se excluyen ubicaciones virtuales o no disponibles. Los mínimos son del catálogo general."
      >
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Estado</th>
                <th className="der">Físico</th>
                <th className="der">Reserva global</th>
                <th className="der">Disponible</th>
                <th className="der">Mín. / reorden</th>
                <th className="der">En tránsito</th>
                <th className="der">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {i.filas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a
                      href={enlaceOrigen("PRODUCTO", null, p.id)!.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.producto} ↗
                    </a>
                    <span className="fila-sub">{p.unidad}</span>
                    <details>
                      <summary>Ubicaciones</summary>
                      {p.ubicaciones.length ? (
                        p.ubicaciones.map((u, n) => (
                          <div className="fila-sub" key={n}>
                            {u.sucursal} · {u.ubicacion}: {entero(u.cantidad)}
                          </div>
                        ))
                      ) : (
                        <span className="fila-sub">
                          Sin existencias registradas.
                        </span>
                      )}
                    </details>
                  </td>
                  <td>
                    <span
                      className={`etiqueta ${p.estado === "OK" ? "" : "etiqueta-aviso"}`}
                    >
                      {ESTADOS[p.estado]}
                    </span>
                  </td>
                  <td className="der mono">{entero(p.fisico)}</td>
                  <td className="der mono">{entero(p.reservado_global)}</td>
                  <td className="der mono">{entero(p.disponible)}</td>
                  <td className="der mono">
                    {entero(p.minimo)} / {entero(p.reorden)}
                  </td>
                  <td className="der mono">{entero(p.transito)}</td>
                  <td className="der mono">
                    {p.cobertura_dias === null
                      ? "Sin consumo"
                      : `${p.cobertura_dias} días`}
                  </td>
                </tr>
              ))}
              {i.total === 0 ? (
                <tr>
                  <td colSpan={8}>No hay productos para estos filtros.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Paginacion
          total={i.total}
          pagina={pagina}
          ruta="/inventario"
          params={params}
        />
      </Panel>
      <p className="pie">
        Las reservas son compartidas entre sucursales; no se suman por
        ubicación. La cobertura es una estimación, no una fecha de entrega.
      </p>
    </>
  );
}
