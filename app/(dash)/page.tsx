import Link from "next/link";
import { Periodos } from "@/components/Periodos";
import {
  SerieDiaria,
  TRAMO_PEDIDOS,
  TRAMO_RETAIL,
} from "@/components/SerieDiaria";
import { Kpi, ListaBarras, Panel } from "@/components/piezas";
import { ListaSalud } from "@/components/ListaSalud";
import { Chismosa } from "@/components/Chismosa";
import { ErrorDatos, obtenerResumen, obtenerSalud } from "@/lib/datos";
import { ErrorConsulta } from "@/components/ErrorConsulta";
import {
  bs,
  bsConSigno,
  diaLargo,
  diaMes,
  entero,
  nombre,
  titulo,
} from "@/lib/formato";
import { leerPeriodo } from "@/lib/periodo";
import { enlace, leerFiltros } from "@/lib/filtros";
import { Herramientas } from "@/components/Herramientas";

const RETAIL = new Set(["MOSTRADOR", "VTD"]);

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return await ContenidoResumen({ searchParams });
  } catch (error) {
    // Los errores conocidos se convierten en contenido antes de que Next oculte
    // las excepciones de Server Components en los builds de producción.
    if (error instanceof ErrorDatos)
      return <ErrorConsulta mensaje={error.message} />;
    throw error;
  }
}

async function ContenidoResumen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const [r, salud] = await Promise.all([
    obtenerResumen(periodo.desde, periodo.hasta, leerFiltros(params)),
    obtenerSalud(),
  ]);

  // Los pagos de cuenta cargados en la actualización de octubre inflan el "cobrado".
  const cobradoDistorsionado =
    r.cobrado.prev > 0 && r.cobrado.cuenta > r.cobrado.prev * 5;
  const salidasConValor = r.salidas.por_origen;

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Resumen</h1>
          <div className="subtitulo">
            {diaMes(r.periodo.desde)}/{r.periodo.desde.slice(0, 4)} –{" "}
            {diaMes(r.periodo.hasta)}/{r.periodo.hasta.slice(0, 4)} · comparado
            con los {r.periodo.dias} días anteriores
          </div>
        </div>
        <Periodos periodo={periodo} ruta="/" params={params} />
      </header>
      <Herramientas actualizado={new Date().toISOString()} />

      <section aria-label="Hoy" className="pildoras">
        <span className="pildora pildora-principal">
          Hoy · {diaLargo(r.hoy.fecha)}
        </span>
        <span className="pildora">
          Vendido <strong className="mono">{bs(r.hoy.vendido)}</strong>
        </span>
        <span className="pildora">
          {r.hoy.turno_abierto
            ? `Turno #${r.hoy.turno_abierto.id} abierto · ${r.hoy.turno_abierto.cajero}`
            : "Sin turno de caja abierto"}
        </span>
        <span className="pildora">
          {r.hoy.pedidos_abiertos} pedidos abiertos ·{" "}
          {r.hoy.lineas_por_despachar} líneas por despachar
        </span>
        <span className="pildora">{r.hoy.por_comprar} ítems por comprar</span>
      </section>

      <section aria-label="Indicadores" className="kpis">
        <Kpi
          nombre="Vendido"
          href={enlace("/detalle", params, { tipo: "ventas" })}
          color="var(--pedidos)"
          valor={bs(r.vendido.total)}
          nota={`${entero(r.vendido.pedidos)} pedidos · ${entero(r.vendido.ventas_retail)} ventas retail`}
          actual={r.vendido.total}
          anterior={r.vendido.prev}
        />
        <Kpi
          nombre="Cobrado"
          href={enlace("/detalle", params, { tipo: "cobros" })}
          color="var(--cobrado)"
          valor={bs(r.cobrado.total)}
          nota={`Retail ${bs(r.cobrado.retail)} · cuenta ${bs(r.cobrado.cuenta)}`}
          etiqueta={
            cobradoDistorsionado ? (
              <span className="etiqueta etiqueta-aviso">
                incluye carga de cuentas
              </span>
            ) : undefined
          }
          actual={cobradoDistorsionado ? undefined : r.cobrado.total}
          anterior={cobradoDistorsionado ? undefined : r.cobrado.prev}
        />
        <Kpi
          nombre="Por cobrar (cartera)"
          href={enlace("/cobranza", params)}
          color="var(--cartera)"
          valor={bs(r.cartera.total)}
          nota={`${r.cartera.clientes} clientes con saldo · al día de hoy`}
        />
        <Kpi
          nombre="Salió de almacén"
          href={enlace("/detalle", params, { tipo: "salidas" })}
          color="var(--retail)"
          valor={bs(r.salidas.valor_total)}
          nota="A precio de venta · sin costo cargado"
        />
      </section>

      <SerieDiaria
        titulo="Vendido por día"
        tramos={[TRAMO_PEDIDOS, TRAMO_RETAIL]}
        dias={r.serie.map((d) => ({
          fecha: d.fecha,
          valores: [d.pedidos, d.retail],
        }))}
      />

      <div className="rejilla">
        <Panel titulo="Vendido por canal" id="ventas">
          <ListaBarras
            color="var(--pedidos)"
            filas={r.vendido.por_canal.map((c) => ({
              nombre: nombre(c.canal),
              valor: c.monto,
              color: RETAIL.has(c.canal) ? "#FFB45C" : "#6EA8FE",
            }))}
          />
        </Panel>

        <Panel titulo="Cobrado por medio">
          <ListaBarras
            color="#5BD6A0"
            filas={r.cobrado.por_medio.map((m) => ({
              nombre: nombre(m.medio),
              valor: m.monto,
            }))}
          />
          {r.cobrado.qr_sin_verificar > 0 ? (
            <div className="aviso">
              {entero(r.cobrado.qr_sin_verificar)} cobros QR del período aún sin
              verificar contra el banco
            </div>
          ) : null}
        </Panel>

        <Panel titulo="Salidas de almacén">
          <table>
            <thead>
              <tr>
                <th scope="col">Origen</th>
                <th scope="col" className="der">
                  Unidades
                </th>
                <th scope="col" className="der">
                  Bs (venta)
                </th>
              </tr>
            </thead>
            <tbody className="mono">
              {salidasConValor.length === 0 ? (
                <tr>
                  <td colSpan={3} className="apagado">
                    Sin salidas en el período.
                  </td>
                </tr>
              ) : (
                salidasConValor.map((s) => {
                  const clase =
                    s.origen === "OTRO"
                      ? "alerta"
                      : s.origen === "REPOSICION_TIENDA"
                        ? "apagado"
                        : undefined;
                  return (
                    <tr key={s.origen} className={clase}>
                      <td style={{ fontFamily: "var(--fuente-texto)" }}>
                        {nombre(s.origen)}
                      </td>
                      <td className="der">{entero(s.unidades)}</td>
                      <td className="der">
                        {s.valor === null ? (
                          <span className="apagado">—</span>
                        ) : (
                          entero(s.valor)
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Panel>

        <Panel
          titulo="Mayores saldos por cobrar"
          accion={
            <Link
              href={enlace("/cobranza", params)}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              Priorizar cobranza
            </Link>
          }
        >
          <div>
            {r.cartera.top.map((d) => (
              <div key={d.cliente} className="fila">
                <span className="fila-nombre">{titulo(d.cliente)}</span>
                <span className="mono">{bs(d.saldo)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Turnos de caja"
          sub="Diferencia del conteo contra lo esperado"
        >
          <div>
            {r.turnos.map((t) => {
              const chip =
                t.estado === "ABIERTA"
                  ? "etiqueta-info"
                  : t.estado === "EN_REVISION"
                    ? "etiqueta-aviso"
                    : "";
              const grande =
                t.diferencia !== null && Math.abs(t.diferencia) >= 100;
              return (
                <div key={t.id} className="fila">
                  <span>
                    Turno #{t.id} ·{" "}
                    {diaMes(
                      new Intl.DateTimeFormat("en-CA", {
                        timeZone: "America/La_Paz",
                      }).format(new Date(t.abierta_en)),
                    )}
                    <span className="fila-sub">{t.cajero}</span>
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span className={`etiqueta ${chip}`}>
                      {nombre(t.estado)}
                    </span>
                    <span
                      className={`mono ${grande ? "alerta" : t.diferencia === null ? "apagado" : ""}`}
                      style={{ minWidth: 104, textAlign: "right" }}
                    >
                      {t.diferencia === null ? "—" : bsConSigno(t.diferencia)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel titulo="Productos más vendidos">
          <div>
            {r.top_productos.map((p) => (
              <div key={p.descripcion} className="fila">
                <span className="fila-nombre">{titulo(p.descripcion)}</span>
                <span className="mono" style={{ whiteSpace: "nowrap" }}>
                  {bs(p.monto)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="rejilla">
        <Panel
          titulo="Salud de datos"
          sub="Qué tan confiables son los números de arriba"
          accion={
            <Link href="/salud" style={{ fontSize: 13, fontWeight: 600 }}>
              Ver todo
            </Link>
          }
        >
          <ListaSalud indicadores={salud} />
        </Panel>
        <Chismosa />
      </div>

      <footer className="pie">
        Montos en bolivianos a precio de venta. Fechas en hora de La Paz.
      </footer>
    </>
  );
}
