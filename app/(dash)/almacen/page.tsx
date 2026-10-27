import { Periodos } from "@/components/Periodos";
import {
  SerieDiaria,
  TRAMO_DESPACHO,
  TRAMO_RETAIL,
} from "@/components/SerieDiaria";
import { Kpi, Panel } from "@/components/piezas";
import { obtenerAlmacen } from "@/lib/datos";
import { bs, diaMes, entero, nombre, titulo } from "@/lib/formato";
import { leerPeriodo } from "@/lib/periodo";
import { enlace, leerFiltros } from "@/lib/filtros";
import { Herramientas } from "@/components/Herramientas";
import Link from "next/link";

function horas(h: number | null): string {
  if (h === null) return "—";
  if (h < 48)
    return `${h.toLocaleString("es-BO", { maximumFractionDigits: 1 })} h`;
  return `${Math.round(h / 24)} días`;
}

function Dias({ n }: { n: number }) {
  const clase = n >= 30 ? "alerta" : n >= 7 ? "" : "apagado";
  return (
    <span className={`mono ${clase}`} style={{ whiteSpace: "nowrap" }}>
      {n} {n === 1 ? "día" : "días"}
    </span>
  );
}

export default async function AlmacenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const a = await obtenerAlmacen(
    periodo.desde,
    periodo.hasta,
    leerFiltros(params),
  );

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Almacén</h1>
          <div className="subtitulo">
            {diaMes(periodo.desde)} – {diaMes(periodo.hasta)}/
            {periodo.hasta.slice(0, 4)} · {periodo.etiqueta.toLowerCase()}
          </div>
        </div>
        <Periodos periodo={periodo} ruta="/almacen" params={params} />
      </header>
      <Herramientas
        actualizado={new Date().toISOString()}
        tipos={["salidas", "inventario"]}
      />
      <Link
        href={enlace("/inventario", params)}
        className="boton-vidrio acceso-modulo"
      >
        Ver inventario disponible, reservas y faltantes →
      </Link>

      <section aria-label="Indicadores" className="kpis">
        <Kpi
          nombre="Salió de almacén"
          href={enlace("/detalle", params, { tipo: "salidas" })}
          color="var(--retail)"
          valor={bs(a.salidas_valor)}
          nota={`${entero(a.salidas_movimientos)} movimientos · a precio de venta`}
        />
        <Kpi
          nombre="Pedido a despacho completo"
          color="var(--pedidos)"
          valor={horas(a.despacho.horas_mediana)}
          nota={`Mediana de ${entero(a.despacho.pedidos_completados)} pedidos completados en el período`}
        />
        <Kpi
          nombre="Por despachar"
          color="var(--aviso)"
          valor={`${entero(a.despacho.lineas_por_despachar)} líneas`}
          nota={`En ${entero(a.despacho.pedidos_abiertos)} pedidos abiertos, al día de hoy`}
        />
        <Kpi
          nombre="Por comprar"
          color="var(--cartera)"
          valor={`${entero(a.por_comprar.total)} ítems`}
          nota="Solicitudes de compra sin recibir"
        />
      </section>

      <SerieDiaria
        titulo="Salidas por día (Bs a precio de venta)"
        tramos={[TRAMO_DESPACHO, TRAMO_RETAIL]}
        dias={a.serie.map((d) => ({
          fecha: d.fecha,
          valores: [d.despacho, d.retail],
        }))}
      />

      <div className="rejilla">
        <Panel
          titulo="Salidas por origen"
          sub="Unidades en unidad base; mezclan hojas sueltas y cajas"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Origen</th>
                <th scope="col" className="der">
                  Mov.
                </th>
                <th scope="col" className="der">
                  Unidades
                </th>
                <th scope="col" className="der">
                  Bs (venta)
                </th>
              </tr>
            </thead>
            <tbody className="mono">
              {a.por_origen.map((s) => {
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
                    <td className="der">{entero(s.movimientos)}</td>
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
              })}
            </tbody>
          </table>
          <div className="fila">
            <span className="fila-nombre">Entradas por compra o alta</span>
            <span className="mono">{entero(a.entradas_unidades)} u.</span>
          </div>
          <div className="fila">
            <span className="fila-nombre">Ajustes (neto)</span>
            <span className="mono">
              {a.ajustes_neto > 0 ? "+" : ""}
              {entero(a.ajustes_neto)} u.
            </span>
          </div>
        </Panel>

        <Panel titulo="Lo que más salió" sub="Por valor de venta">
          <div>
            {a.top_salidas.map((p) => (
              <div key={p.producto} className="fila">
                <span className="fila-nombre">
                  {titulo(p.producto)}
                  <span className="fila-sub">{entero(p.unidades)} u.</span>
                </span>
                <span className="mono" style={{ whiteSpace: "nowrap" }}>
                  {bs(p.valor)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Pedidos esperando despacho"
          sub="Los más antiguos primero"
        >
          <div>
            {a.despacho.atrasados.length === 0 ? (
              <p className="apagado" style={{ margin: 0, fontSize: 13 }}>
                Nada pendiente.
              </p>
            ) : (
              a.despacho.atrasados.map((p) => (
                <div key={p.numero} className="fila">
                  <span className="fila-nombre">
                    {p.numero} · {titulo(p.cliente)}
                    <span className="fila-sub">
                      {p.lineas} {p.lineas === 1 ? "línea" : "líneas"} por
                      despachar
                    </span>
                  </span>
                  <Dias n={p.dias} />
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          titulo="Por comprar"
          sub={`${entero(a.por_comprar.total)} solicitudes · las más antiguas primero`}
        >
          <div>
            {a.por_comprar.items.map((c, i) => (
              <div key={`${c.descripcion}-${i}`} className="fila">
                <span className="fila-nombre">
                  {titulo(c.descripcion)}
                  <span className="fila-sub">
                    {entero(c.cantidad)} u.
                    {c.origen ? ` · ${c.origen.toLowerCase()}` : ""}
                  </span>
                </span>
                <Dias n={c.dias} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Traslados en tránsito"
          sub={`${entero(a.traslados_en_transito.total)} despachados sin recibir`}
        >
          <div>
            {a.traslados_en_transito.items.map((t) => (
              <div key={t.numero} className="fila">
                <span className="fila-nombre">
                  {t.numero}
                  <span className="fila-sub">
                    {t.lineas} {t.lineas === 1 ? "línea" : "líneas"}
                    {t.despachado
                      ? ` · despachado el ${diaMes(t.despachado)}`
                      : ""}
                  </span>
                </span>
                <Dias n={t.dias} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Sin salidas en 60 días"
          sub={`${entero(a.sin_movimiento.total)} productos con stock que no se movieron`}
        >
          <div>
            {a.sin_movimiento.items.map((p) => (
              <div key={p.producto} className="fila">
                <span className="fila-nombre">{titulo(p.producto)}</span>
                <span className="mono" style={{ whiteSpace: "nowrap" }}>
                  {entero(p.stock)} u.
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <footer className="pie">
        Sin costo de compra cargado, los montos van a precio de venta. Los
        pedidos a Tienda son reposición interna y no cuentan como salida.
      </footer>
    </>
  );
}
