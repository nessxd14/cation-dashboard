import Link from "next/link";
import { Cabecera } from "@/components/Cabecera";
import { Kpi, Panel } from "@/components/piezas";
import { Paginacion } from "@/components/Paginacion";
import { enlace, leerFiltros, type Parametros } from "@/lib/filtros";
import { obtenerCobranza, paginaValida } from "@/lib/operativo";
import { bs, diaMes, entero } from "@/lib/formato";
import { enlaceOrigen } from "@/lib/enlaces";
import { redirect } from "next/navigation";

export default async function CobranzaPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams,
    pagina = paginaValida(params.pagina);
  const { clientes } = await obtenerCobranza(leerFiltros(params));
  if (pagina > 1 && (pagina - 1) * 50 >= clientes.length)
    redirect(enlace("/cobranza", params));
  const fecha = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(
      new Date(iso),
    );
  return (
    <>
      <Cabecera
        titulo="Prioridades de cobranza"
        sub="Cartera actual · primero deuda vencida, luego antigüedad y saldo"
        ruta="/cobranza"
        params={params}
        tipos={["cobranza", "cartera"]}
      />
      <section className="kpis">
        <Kpi
          nombre="Saldo por cobrar"
          valor={bs(clientes.reduce((s, c) => s + c.saldo, 0))}
          nota={`${entero(clientes.length)} clientes`}
          color="var(--cartera)"
        />
        <Kpi
          nombre="Vencido"
          valor={bs(clientes.reduce((s, c) => s + c.vencido, 0))}
          nota="Documentos con fecha de vencimiento superada"
          color="var(--critico)"
        />
        <Kpi
          nombre="Prioridad alta"
          valor={entero(clientes.filter((c) => c.prioridad === "ALTA").length)}
          nota="Deuda vencida hace 30 días o más"
          color="var(--aviso)"
        />
      </section>
      <Panel
        titulo="A quién cobrar primero"
        sub="Alta: vencido ≥30 días. Media: otro vencido. Preventiva: saldo sin vencimiento superado. Esta lista no envía mensajes."
      >
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Prioridad</th>
                <th className="der">Saldo</th>
                <th className="der">Vencido</th>
                <th>Último pago</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {clientes.slice((pagina - 1) * 50, pagina * 50).map((c) => {
                const origen = enlaceOrigen("CUENTA", c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.cliente}
                      {c.sin_partida > 0 ? (
                        <span className="fila-sub">
                          Sin partida: {bs(c.sin_partida)}
                        </span>
                      ) : null}
                      {c.por_verificar > 0 ? (
                        <span className="fila-sub">
                          {c.por_verificar} pagos por verificar
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`etiqueta ${c.prioridad === "ALTA" ? "etiqueta-aviso" : ""}`}
                      >
                        {c.prioridad}
                      </span>
                    </td>
                    <td className="der mono">{bs(c.saldo)}</td>
                    <td className="der mono">
                      {bs(c.vencido)}
                      <span className="fila-sub">
                        {c.dias_vencido === null
                          ? "Sin plazo"
                          : `${c.dias_vencido} días`}
                      </span>
                    </td>
                    <td>
                      {c.ultimo_pago
                        ? diaMes(fecha(c.ultimo_pago))
                        : "Sin pagos"}
                    </td>
                    <td>
                      <Link
                        href={enlace(
                          "/detalle",
                          { ...params, cliente: c.id },
                          { tipo: "cartera" },
                        )}
                      >
                        Ver partidas
                      </Link>
                      {origen ? (
                        <a
                          className="fila-sub"
                          href={origen.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir Conciliador ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    No hay clientes con saldo en estos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Paginacion
          total={clientes.length}
          pagina={pagina}
          ruta="/cobranza"
          params={params}
        />
      </Panel>
    </>
  );
}
