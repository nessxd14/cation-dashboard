import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Cabecera } from "@/components/Cabecera";
import { Panel } from "@/components/piezas";
import { Paginacion } from "@/components/Paginacion";
import { enlace, leerFiltros, type Parametros } from "@/lib/filtros";
import { leerPeriodo } from "@/lib/periodo";
import { obtenerDetalle, paginaValida } from "@/lib/operativo";
import { bs, diaMes, entero } from "@/lib/formato";
import { enlaceOrigen } from "@/lib/enlaces";

const TITULOS: Record<string, string> = {
  ventas: "Detalle de ventas",
  cobros: "Detalle de cobros",
  salidas: "Detalle de salidas",
  cartera: "Partidas por cobrar",
  alertas: "Detalle de alerta",
};
const ALERTAS = [
  "lineas_rechazadas_cobradas",
  "qr_sin_verificar",
  "salidas_sin_enlace",
  "traslados_en_transito",
  "productos_sin_precio",
  "turnos_abiertos_24h",
  "kardex_vs_stock",
];
export default async function DetallePage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams;
  const tipo = typeof params.tipo === "string" ? params.tipo : "ventas";
  if (!Object.hasOwn(TITULOS, tipo)) notFound();
  const alerta =
    typeof params.alerta === "string" && ALERTAS.includes(params.alerta)
      ? params.alerta
      : "";
  if (tipo === "alertas" && !alerta) notFound();
  const p = leerPeriodo(params),
    pagina = paginaValida(params.pagina);
  const d = await obtenerDetalle(
    tipo,
    p.desde,
    p.hasta,
    { ...leerFiltros(params), ...(alerta ? { alerta } : {}) },
    pagina,
  );
  if (pagina > 1 && (pagina - 1) * 50 >= d.total)
    redirect(
      enlace("/detalle", params, { tipo, ...(alerta ? { alerta } : {}) }),
    );
  return (
    <>
      <Cabecera
        titulo={TITULOS[tipo]}
        sub={
          tipo === "alertas"
            ? `${alerta.replaceAll("_", " ")} · alcance general, sin filtro de fechas o comerciales`
            : tipo === "cartera"
              ? "Saldo actual por documento · no depende del período"
              : `${p.desde} a ${p.hasta} · documentos que explican la cifra`
        }
        ruta="/detalle"
        params={{ ...params, tipo }}
        tipos={[tipo]}
      />
      <nav className="enlaces-seccion">
        {Object.entries(TITULOS)
          .filter(([t]) => t !== "alertas")
          .map(([t, n]) => (
            <Link
              aria-current={t === tipo ? "page" : undefined}
              key={t}
              href={enlace("/detalle", params, { tipo: t })}
            >
              {n}
            </Link>
          ))}
      </nav>
      <Panel
        titulo={`${entero(d.total)} registros · ${bs(d.monto)}`}
        sub={
          tipo === "cartera"
            ? "El saldo de partidas puede diferir de la cartera total por anticipos y saldos sin documento."
            : "El total corresponde a todos los registros filtrados, no solo a esta página."
        }
      >
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Documento / cliente</th>
                <th>Concepto</th>
                <th className="der">Cantidad</th>
                <th className="der">Monto</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {d.filas.map((f) => {
                const origen = enlaceOrigen(
                  f.origen,
                  f.referencia_id,
                  f.producto_id,
                );
                return (
                  <tr key={f.id}>
                    <td className="mono">
                      {f.fecha ? diaMes(f.fecha) : "Sin plazo"}
                    </td>
                    <td>
                      {f.documento}
                      <span className="fila-sub">{f.cliente}</span>
                    </td>
                    <td>{f.concepto}</td>
                    <td className="mono der">{entero(f.cantidad)}</td>
                    <td className="mono der">{bs(f.monto)}</td>
                    <td>
                      {origen ? (
                        <a href={origen.href} target="_blank" rel="noreferrer">
                          {origen.texto} ↗
                        </a>
                      ) : (
                        <span className="apagado">{f.origen}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {d.total === 0 ? (
                <tr>
                  <td colSpan={6}>No hay registros para estos filtros.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Paginacion
          total={d.total}
          pagina={pagina}
          ruta="/detalle"
          params={params}
          extras={{ tipo, ...(alerta ? { alerta } : {}) }}
        />
      </Panel>
    </>
  );
}
