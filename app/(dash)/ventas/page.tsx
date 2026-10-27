import { Periodos } from "@/components/Periodos";
import { Kpi, ListaBarras, Panel } from "@/components/piezas";
import { obtenerVentas } from "@/lib/datos";
import { bs, diaMes, entero, nombre, pct, titulo } from "@/lib/formato";
import { leerPeriodo } from "@/lib/periodo";
import { enlace, leerFiltros } from "@/lib/filtros";
import { Herramientas } from "@/components/Herramientas";

const RETAIL = new Set(["MOSTRADOR", "VTD"]);
// Cuentas que usa más de una persona: sus ventas no se pueden atribuir a alguien.
const COMPARTIDAS = new Set(["roari.2023.bo", "cajaroari1tdd"]);

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const v = await obtenerVentas(
    periodo.desde,
    periodo.hasta,
    leerFiltros(params),
  );

  const avanceEntrega =
    v.entrega.vendido > 0 ? v.entrega.entregado / v.entrega.vendido : null;
  const conversion =
    v.cotizaciones.creadas > 0
      ? v.cotizaciones.convertidas / v.cotizaciones.creadas
      : null;
  const hayCompartidas = v.por_vendedor.some((x) =>
    COMPARTIDAS.has(x.vendedor),
  );

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Ventas</h1>
          <div className="subtitulo">
            {diaMes(periodo.desde)} – {diaMes(periodo.hasta)}/
            {periodo.hasta.slice(0, 4)} · {periodo.etiqueta.toLowerCase()}
          </div>
        </div>
        <Periodos periodo={periodo} ruta="/ventas" params={params} />
      </header>
      <Herramientas
        actualizado={new Date().toISOString()}
        tipos={["ventas", "margen"]}
      />

      <section aria-label="Indicadores" className="kpis">
        <Kpi
          nombre="Vendido"
          href={enlace("/detalle", params, { tipo: "ventas" })}
          color="var(--pedidos)"
          valor={bs(v.total)}
          nota={`${entero(v.pedidos)} pedidos · ${entero(v.ventas_retail)} ventas retail`}
          actual={v.total}
          anterior={v.prev}
        />
        <Kpi
          nombre="Ticket promedio pedido"
          color="var(--pedidos)"
          valor={bs(v.ticket_pedido)}
          nota="Mayor, institucional y corporativo"
        />
        <Kpi
          nombre="Ticket promedio retail"
          color="var(--retail)"
          valor={bs(v.ticket_retail)}
          nota="Mostrador y VTD"
        />
        <Kpi
          nombre="Ya entregado"
          color="var(--cobrado)"
          valor={pct(avanceEntrega)}
          nota={`${bs(v.entrega.entregado)} de ${bs(v.entrega.vendido)} en pedidos · ${v.entrega.pedidos_completos} de ${v.entrega.pedidos} completos`}
        />
      </section>

      <div className="rejilla">
        <Panel titulo="Por canal">
          <table>
            <thead>
              <tr>
                <th scope="col">Canal</th>
                <th scope="col" className="der">
                  Documentos
                </th>
                <th scope="col" className="der">
                  Ticket
                </th>
                <th scope="col" className="der">
                  Bs
                </th>
              </tr>
            </thead>
            <tbody className="mono">
              {v.por_canal.map((c) => (
                <tr key={c.canal}>
                  <td style={{ fontFamily: "var(--fuente-texto)" }}>
                    <span
                      aria-hidden="true"
                      className="punto"
                      style={{
                        display: "inline-block",
                        marginRight: 8,
                        background: RETAIL.has(c.canal)
                          ? "var(--retail)"
                          : "var(--pedidos)",
                      }}
                    />
                    {nombre(c.canal)}
                  </td>
                  <td className="der">{entero(c.docs)}</td>
                  <td className="der">{entero(c.ticket)}</td>
                  <td className="der">{entero(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          titulo="Cotizaciones"
          sub="Alcance general · creadas en el período, sin filtros comerciales"
        >
          <div
            className="kpis"
            style={{
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <div className="mini-kpi">
              <span className="mono" style={{ color: "var(--texto)" }}>
                {pct(conversion)}
              </span>
              {v.cotizaciones.convertidas} de {v.cotizaciones.creadas}{" "}
              convertidas
            </div>
            <div className="mini-kpi">
              <span className="mono" style={{ color: "var(--texto)" }}>
                {pct(
                  v.cotizaciones.monto > 0
                    ? v.cotizaciones.monto_convertido / v.cotizaciones.monto
                    : null,
                )}
              </span>
              del monto cotizado
            </div>
          </div>
          <div className="fila">
            <span className="fila-nombre">Cotizado</span>
            <span className="mono">{bs(v.cotizaciones.monto)}</span>
          </div>
          <div className="fila">
            <span className="fila-nombre">Convertido a pedido</span>
            <span className="mono">{bs(v.cotizaciones.monto_convertido)}</span>
          </div>
        </Panel>

        <Panel
          titulo="Por vendedor"
          sub={
            hayCompartidas
              ? "Las cuentas marcadas las usa más de una persona"
              : undefined
          }
        >
          <ListaBarras
            color="#6EA8FE"
            filas={v.por_vendedor.map((x) => ({
              nombre: COMPARTIDAS.has(x.vendedor)
                ? `${x.vendedor} · compartida`
                : x.vendedor,
              valor: x.monto,
              color: COMPARTIDAS.has(x.vendedor)
                ? "rgba(243,245,250,0.45)"
                : "#6EA8FE",
            }))}
          />
        </Panel>

        <Panel titulo="Mejores clientes">
          <div>
            {v.top_clientes.map((c) => (
              <div key={c.cliente} className="fila">
                <span className="fila-nombre">
                  {titulo(c.cliente)}
                  <span className="fila-sub">
                    {c.docs} {c.docs === 1 ? "documento" : "documentos"}
                  </span>
                </span>
                <span className="mono">{bs(c.monto)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Productos más vendidos"
          sub="Por monto; la cantidad está en unidad base"
        >
          <div>
            {v.top_productos.map((p) => (
              <div key={p.descripcion} className="fila">
                <span className="fila-nombre">
                  {titulo(p.descripcion)}
                  <span className="fila-sub">{entero(p.cantidad)} u.</span>
                </span>
                <span className="mono" style={{ whiteSpace: "nowrap" }}>
                  {bs(p.monto)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Pedidos abiertos con más por entregar"
          sub="De cualquier fecha"
        >
          <div>
            {v.pendientes.length === 0 ? (
              <p className="apagado" style={{ margin: 0, fontSize: 13 }}>
                No hay pedidos abiertos.
              </p>
            ) : (
              v.pendientes.map((p) => (
                <div key={p.numero} className="fila">
                  <span className="fila-nombre">
                    {p.numero} · {titulo(p.cliente)}
                    <span className="fila-sub">
                      Creado el {diaMes(p.creado)} · vendido {bs(p.vendido)}
                    </span>
                  </span>
                  <span className="mono" style={{ whiteSpace: "nowrap" }}>
                    {bs(p.pendiente)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <footer className="pie">
        Vendido = pedidos (sin cancelados, sin reposición a Tienda, sin líneas
        rechazadas) + ventas retail completadas. Fechas en hora de La Paz.
      </footer>
    </>
  );
}
