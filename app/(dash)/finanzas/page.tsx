import { Periodos } from "@/components/Periodos";
import {
  SerieDiaria,
  TRAMO_CUENTA,
  TRAMO_RETAIL,
} from "@/components/SerieDiaria";
import { Kpi, ListaBarras, Panel } from "@/components/piezas";
import { obtenerFinanzas } from "@/lib/datos";
import {
  bs,
  bsConSigno,
  diaMes,
  entero,
  nombre,
  pct,
  titulo,
} from "@/lib/formato";
import { leerPeriodo } from "@/lib/periodo";
import { enlace, leerFiltros } from "@/lib/filtros";
import { Herramientas } from "@/components/Herramientas";

const fechaLaPaz = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(
    new Date(iso),
  );

/** Una nota de revisión de 1–3 letras ("u", "gh") no explica una diferencia de caja. */
const notaVacia = (nota: string | null) =>
  !nota || nota.replace(/\s/g, "").length < 4;

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const f = await obtenerFinanzas(
    periodo.desde,
    periodo.hasta,
    leerFiltros(params),
  );
  const { cobranza: c, cartera: k, caja } = f;

  const cargaCuentas = c.prev > 0 && c.cuenta > c.prev * 5;
  const diferenciaNeta = caja.sobrante + caja.faltante;
  const sinExplicar = caja.lista.filter(
    (t) =>
      t.diferencia !== null &&
      Math.abs(t.diferencia) >= 100 &&
      t.estado === "CERRADA" &&
      notaVacia(t.nota),
  ).length;
  const faltantePendiente = f.faltantes.find((x) => x.estado === "PENDIENTE");
  const condonado = f.faltantes.find((x) => x.estado === "CONDONADO");

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Finanzas</h1>
          <div className="subtitulo">
            {diaMes(periodo.desde)} – {diaMes(periodo.hasta)}/
            {periodo.hasta.slice(0, 4)} · {periodo.etiqueta.toLowerCase()}
          </div>
        </div>
        <Periodos periodo={periodo} ruta="/finanzas" params={params} />
      </header>
      <Herramientas
        actualizado={new Date().toISOString()}
        tipos={["cobros", "cartera", "cobranza"]}
      />

      <section aria-label="Indicadores" className="kpis">
        <Kpi
          nombre="Cobrado"
          href={enlace("/detalle", params, { tipo: "cobros" })}
          color="var(--cobrado)"
          valor={bs(c.total)}
          nota={`Retail ${bs(c.retail)} · cuenta ${bs(c.cuenta)}`}
          etiqueta={
            cargaCuentas ? (
              <span className="etiqueta etiqueta-aviso">
                incluye carga de cuentas
              </span>
            ) : undefined
          }
          actual={cargaCuentas ? undefined : c.total}
          anterior={cargaCuentas ? undefined : c.prev}
        />
        <Kpi
          nombre="Por cobrar"
          href={enlace("/cobranza", params)}
          color="var(--cartera)"
          valor={bs(k.total)}
          nota={`${k.clientes} clientes · ${pct(k.total > 0 ? k.sin_reloj / k.total : null)} todavía sin plazo corriendo`}
        />
        <Kpi
          nombre="Diferencias de caja (general)"
          color={diferenciaNeta < 0 ? "var(--critico)" : "var(--aviso)"}
          valor={`${diferenciaNeta > 0 ? "+" : diferenciaNeta < 0 ? "−" : ""}${bs(Math.abs(diferenciaNeta))}`}
          nota={`${caja.con_diferencia} de ${caja.turnos} turnos con diferencia · faltó ${bs(-caja.faltante)}, sobró ${bs(caja.sobrante)}`}
        />
        <Kpi
          nombre="Salió de caja (general)"
          color="var(--retail)"
          valor={bs(caja.remesas + caja.gastos.aprobado)}
          nota={`Remesas ${bs(caja.remesas)} · gastos ${bs(caja.gastos.aprobado)}${caja.gastos.n_pendiente ? ` · ${caja.gastos.n_pendiente} gastos por aprobar` : ""}`}
        />
      </section>

      <SerieDiaria
        titulo="Cobrado por día"
        tramos={[TRAMO_CUENTA, TRAMO_RETAIL]}
        dias={c.serie.map((d) => ({
          fecha: d.fecha,
          valores: [d.cuenta, d.retail],
        }))}
      />

      <div className="rejilla">
        <Panel titulo="Cobrado por medio">
          <ListaBarras
            color="#5BD6A0"
            filas={c.por_medio.map((m) => ({
              nombre: `${nombre(m.medio)} · ${entero(m.n)}`,
              valor: m.monto,
            }))}
          />
          {c.por_verificar.n > 0 ? (
            <div className="aviso">
              {c.por_verificar.n} pagos de cuenta por verificar (
              {bs(c.por_verificar.monto)})
            </div>
          ) : null}
        </Panel>

        <Panel
          titulo="Antigüedad de la cartera"
          sub="Días desde la entrega de cada partida pendiente"
        >
          <ListaBarras
            color="#B794FF"
            filas={k.antiguedad.map((a) => ({
              nombre: `${a.tramo} días · ${a.partidas} ${a.partidas === 1 ? "partida" : "partidas"}`,
              valor: a.monto,
              color:
                a.tramo === "+90"
                  ? "#FF7A6B"
                  : a.tramo === "61–90"
                    ? "#FFC857"
                    : "#B794FF",
            }))}
          />
          <div className="fila">
            <span className="fila-nombre">
              Sin plazo corriendo
              <span className="fila-sub">
                Partidas que esperan factura o entrega para arrancar el reloj
              </span>
            </span>
            <span className="mono">{bs(k.sin_reloj)}</span>
          </div>
          <div className="fila">
            <span className="fila-nombre">
              Saldo sin partida
              <span className="fila-sub">
                Deuda cargada a la cuenta sin documento asociado
              </span>
            </span>
            <span className="mono">{bs(k.sin_partida)}</span>
          </div>
          <div className="fila">
            <span className="fila-nombre">Vencido</span>
            <span className={`mono ${k.vencido > 0 ? "alerta" : ""}`}>
              {bs(k.vencido)}
            </span>
          </div>
        </Panel>

        <Panel titulo="Clientes con más saldo">
          <div>
            {k.clientes_top.map((x) => (
              <div key={x.cliente} className="fila">
                <span className="fila-nombre">
                  {titulo(x.cliente)}
                  <span className="fila-sub">
                    {x.ultimo_pago
                      ? `Último pago ${diaMes(x.ultimo_pago)}`
                      : "Sin pagos registrados"}
                    {x.vencido > 0
                      ? ` · vencido ${bs(x.vencido)} (${x.dias_vencido} días)`
                      : ""}
                  </span>
                </span>
                <span className="mono" style={{ whiteSpace: "nowrap" }}>
                  {bs(x.saldo)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Faltantes de caja"
          sub="Todos los registrados, no solo el período"
        >
          <div>
            {f.faltantes.map((x) => (
              <div key={x.estado} className="fila">
                <span className="fila-nombre">
                  {nombre(x.estado)}
                  <span className="fila-sub">
                    {x.n} {x.n === 1 ? "registro" : "registros"}
                  </span>
                </span>
                <span
                  className={`mono ${x.estado === "PENDIENTE" ? "alerta" : ""}`}
                >
                  {bs(x.monto)}
                </span>
              </div>
            ))}
          </div>
          {condonado && condonado.monto >= 1000 ? (
            <div className="aviso">
              Se condonaron {bs(condonado.monto)} en faltantes de arqueo
              {faltantePendiente
                ? ` y quedan ${bs(faltantePendiente.monto)} pendientes`
                : ""}
              .
            </div>
          ) : null}
        </Panel>

        <Panel
          titulo="Comisiones"
          sub="Alcance general · documentos del período"
        >
          <ListaBarras
            color="#6EA8FE"
            filas={f.comisiones.por_vendedor.map((x) => ({
              nombre: `${x.vendedor} · ${x.docs} docs`,
              valor: x.monto,
            }))}
          />
          <div className="fila">
            <span className="fila-nombre">Devengado</span>
            <span className="mono">{bs(f.comisiones.devengadas)}</span>
          </div>
          <div className="fila">
            <span className="fila-nombre">
              Potencial (falta cobrar el documento)
            </span>
            <span className="mono">{bs(f.comisiones.potenciales)}</span>
          </div>
          <div className="fila">
            <span className="fila-nombre">Liquidado en el período</span>
            <span className="mono">{bs(f.comisiones.liquidadas)}</span>
          </div>
        </Panel>
      </div>

      <Panel
        titulo="Turnos de caja"
        sub={
          sinExplicar > 0
            ? `${sinExplicar} turnos cerrados con diferencia de Bs 100 o más tienen una nota de revisión que no explica nada`
            : "Diferencia del conteo contra lo esperado y quién la revisó"
        }
      >
        <div className="tabla-scroll">
          <table className="tabla-tarjetas">
            <thead>
              <tr>
                <th scope="col">Turno</th>
                <th scope="col">Cajero</th>
                <th scope="col">Estado</th>
                <th scope="col" className="der">
                  Diferencia
                </th>
                <th scope="col">Revisión</th>
              </tr>
            </thead>
            <tbody>
              {caja.lista.map((t) => {
                const grande =
                  t.diferencia !== null && Math.abs(t.diferencia) >= 100;
                const chip =
                  t.estado === "ABIERTA"
                    ? "etiqueta-info"
                    : t.estado === "EN_REVISION"
                      ? "etiqueta-aviso"
                      : "";
                return (
                  <tr key={t.id}>
                    <td className="mono celda-titulo">
                      #{t.id} · {diaMes(fechaLaPaz(t.abierta))}
                    </td>
                    <td data-etiqueta="Cajero">{t.cajero}</td>
                    <td data-etiqueta="Estado">
                      <span className={`etiqueta ${chip}`}>
                        {nombre(t.estado)}
                      </span>
                    </td>
                    <td
                      data-etiqueta="Diferencia"
                      className={`der mono ${grande ? "alerta" : t.diferencia === null ? "apagado" : ""}`}
                    >
                      {t.diferencia === null ? "—" : bsConSigno(t.diferencia)}
                    </td>
                    <td data-etiqueta="Revisión" className="celda-ancha">
                      {t.revisada_por ? (
                        <>
                          {t.revisada_por}
                          {t.nota ? (
                            <span
                              className={`fila-sub ${grande && notaVacia(t.nota) ? "nota-debil" : ""}`}
                            >
                              “{t.nota}”
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="apagado">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <footer className="pie">
        Cobrado = pagos de ventas retail + pagos confirmados a cuenta de
        clientes (Hermes). Diferencia de caja = conteo real − esperado: negativo
        es faltante.
      </footer>
    </>
  );
}
