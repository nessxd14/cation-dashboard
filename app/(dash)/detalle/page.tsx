import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Cabecera } from "@/components/Cabecera";
import { Panel } from "@/components/piezas";
import { Paginacion } from "@/components/Paginacion";
import { PagosCuenta, SaldosCuenta } from "@/components/CuentaCobranza";
import { enlace, leerFiltros, type Parametros } from "@/lib/filtros";
import { leerPeriodo } from "@/lib/periodo";
import { ErrorDatos } from "@/lib/datos";
import {
  obtenerCuentaCobranza,
  obtenerDetalle,
  paginaValida,
} from "@/lib/operativo";
import { bs, diaMes, entero } from "@/lib/formato";
import { enlaceOrigen } from "@/lib/enlaces";
import { dineroWholesale as dinero } from "@/lib/wholesale";

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
  const cartera = tipo === "cartera";
  const filtros = leerFiltros(params);
  const cliente = cartera ? filtros.cliente : undefined;
  const [d, cuenta] = await Promise.all([
    obtenerDetalle(
      tipo,
      p.desde,
      p.hasta,
      { ...filtros, ...(alerta ? { alerta } : {}) },
      pagina,
    ),
    cliente
      ? obtenerCuentaCobranza(cliente).catch((error: unknown) => {
          if (error instanceof ErrorDatos) return error;
          throw error;
        })
      : null,
  ]);
  const datosCuenta = cuenta instanceof ErrorDatos ? null : cuenta;
  const nombreCliente = cliente
    ? (datosCuenta?.nombre ?? d.filas[0]?.cliente)
    : null;
  const cuentaHermes = cliente ? enlaceOrigen("CUENTA", cliente) : null;
  if (pagina > 1 && (pagina - 1) * 50 >= d.total)
    redirect(
      enlace("/detalle", params, { tipo, ...(alerta ? { alerta } : {}) }),
    );
  return (
    <>
      <Cabecera
        titulo={nombreCliente ? `Cuenta de ${nombreCliente}` : TITULOS[tipo]}
        sub={
          tipo === "alertas"
            ? `${alerta.replaceAll("_", " ")} · alcance general, sin filtro de fechas o comerciales`
            : cartera
              ? "Hermes · saldo actual por documento"
              : `${p.desde} a ${p.hasta} · documentos que explican la cifra`
        }
        ruta="/detalle"
        params={{ ...params, tipo }}
        tipos={[tipo]}
      />
      {cliente ? (
        <nav className="enlaces-seccion" aria-label="Navegación de la cuenta">
          <Link href={enlace("/cobranza", { ...params, cliente: undefined })}>
            ← Volver a Cobranza
          </Link>
          {cuentaHermes ? (
            <a href={cuentaHermes.href} target="_blank" rel="noreferrer">
              Ver cuenta en Hermes ↗
            </a>
          ) : null}
        </nav>
      ) : (
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
      )}
      {datosCuenta ? (
        <SaldosCuenta cuenta={datosCuenta} partidas={d.monto} />
      ) : null}
      {cuenta instanceof ErrorDatos ? (
        <p className="aviso" role="status">
          Resumen de la cuenta no disponible. {cuenta.message}
        </p>
      ) : null}
      <Panel
        titulo={
          cartera
            ? `Partidas por cobrar · ${entero(d.total)} · ${dinero(d.monto)}`
            : `${entero(d.total)} registros · ${bs(d.monto)}`
        }
        sub={
          tipo === "cartera"
            ? "El saldo de partidas puede diferir de la cartera total por anticipos y saldos sin documento."
            : "El total corresponde a todos los registros filtrados, no solo a esta página."
        }
      >
        <div
          className={cartera ? "tabla-scroll tabla-operativa" : "tabla-scroll"}
        >
          <table>
            <thead>
              <tr>
                <th>{cartera ? "Vencimiento" : "Fecha"}</th>
                <th>{cliente ? "Partida" : "Documento / cliente"}</th>
                <th>{cartera ? "Estado" : "Concepto"}</th>
                {!cartera ? <th className="der">Cantidad</th> : null}
                <th className="der">{cartera ? "Saldo" : "Monto"}</th>
                {!cliente ? <th>{cartera ? "Acción" : "Origen"}</th> : null}
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
                      {!cliente ? (
                        <span className="fila-sub">{f.cliente}</span>
                      ) : null}
                    </td>
                    <td>
                      {cartera ? nombreEstadoPartida(f.concepto) : f.concepto}
                    </td>
                    {!cartera ? (
                      <td className="mono der">{entero(f.cantidad)}</td>
                    ) : null}
                    <td className="mono der">
                      {cartera ? dinero(f.monto) : bs(f.monto)}
                    </td>
                    {!cliente ? (
                      <td>
                        {cartera && f.referencia_id ? (
                          <Link
                            className="boton-vidrio vista-accion"
                            href={enlace(
                              "/detalle",
                              { ...params, cliente: f.referencia_id },
                              { tipo: "cartera" },
                            )}
                          >
                            Ver cuenta
                          </Link>
                        ) : origen ? (
                          <a
                            href={origen.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {origen.texto} ↗
                          </a>
                        ) : (
                          <span className="apagado">{f.origen}</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {d.total === 0 ? (
                <tr>
                  <td colSpan={cliente ? 4 : cartera ? 5 : 6}>
                    {cartera
                      ? "No hay partidas pendientes para estos filtros."
                      : "No hay registros para estos filtros."}
                  </td>
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
      {datosCuenta ? <PagosCuenta pagos={datosCuenta.pagos} /> : null}
    </>
  );
}

function nombreEstadoPartida(estado: string) {
  const texto = estado.toLowerCase().replaceAll("_", " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
