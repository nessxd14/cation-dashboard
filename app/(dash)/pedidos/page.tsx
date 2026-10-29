import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Cabecera } from "@/components/Cabecera";
import { Panel } from "@/components/piezas";
import { ExpedientePedido } from "@/components/ExpedientePedido";
import { leerFiltros, consultaComun, type Parametros } from "@/lib/filtros";
import { leerPeriodo } from "@/lib/periodo";
import { paginaValida } from "@/lib/operativo";
import {
  obtenerPedidosWholesale,
  obtenerExpedienteWholesale,
} from "@/lib/wholesale-servidor";
import {
  ETAPAS,
  categoriaWholesale,
  fechaWholesale,
  dineroWholesale,
  idWholesale,
  enlaceWholesale,
  type Etapa,
} from "@/lib/wholesale";
import { enlaceOrigen } from "@/lib/enlaces";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params),
    pagina = paginaValida(params.pagina);
  const buscar =
    typeof params.buscar === "string" ? params.buscar.trim().slice(0, 120) : "";
  const filtros = leerFiltros(params);
  const lista = await obtenerPedidosWholesale(
    periodo.desde,
    periodo.hasta,
    filtros,
    buscar,
    pagina,
  );
  if (pagina > 1 && (pagina - 1) * 25 >= lista.total)
    redirect(enlaceWholesale(params, { pagina: "" }));
  if (params.pedido !== undefined && !idWholesale(params.pedido)) notFound();
  const pedido = idWholesale(params.pedido) ?? lista.filas[0]?.id;
  const antes = idWholesale(params.antes);
  const d = pedido ? await obtenerExpedienteWholesale(pedido, antes) : null;
  const etapa =
    typeof params.etapa === "string" && ETAPAS.includes(params.etapa as Etapa)
      ? (params.etapa as Etapa)
      : "pedido";
  const paginas = Math.max(1, Math.ceil(lista.total / 25));
  const comun = consultaComun(params);
  return (
    <>
      <Cabecera
        titulo="Consolidado WholeSale"
        sub="Mayoreo · Institucional · Corporativo · expediente por pedido · solo lectura"
        ruta="/pedidos"
        params={params}
        tipos={[]}
      />
      <Panel
        titulo="Seguimiento por pedido"
        sub="El período filtra la fecha de creación del pedido. El expediente incluye todo su historial. Los filtros seleccionan pedidos completos, no recortan sus líneas."
      >
        <form className="ws-buscar" action="/pedidos" method="get">
          {Array.from(comun.entries()).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label>
            Pedido o cliente
            <input
              name="buscar"
              maxLength={120}
              defaultValue={buscar}
              placeholder="Número del pedido o nombre del cliente"
            />
          </label>
          <button className="boton-vidrio" type="submit">
            Buscar
          </button>
          {buscar ? (
            <Link href={enlaceWholesale(params, { buscar: "", pagina: "" })}>
              Limpiar búsqueda
            </Link>
          ) : null}
        </form>
        {filtros.canal &&
        !["MAYOR", "INSTITUCIONAL", "CORPORATIVO"].includes(filtros.canal) ? (
          <p className="ws-aviso">
            El canal seleccionado no pertenece a WholeSale. Cambia el filtro
            comercial.
          </p>
        ) : null}
        <div className="tabla-scroll">
          <table className="ws-tabla">
            <thead>
              <tr>
                <th>Pedido / cliente</th>
                <th>Cotización</th>
                <th>Pedido</th>
                <th>Alistado</th>
                <th>Verificación</th>
                <th>Salida</th>
                <th>Aplicado / saldo de partidas</th>
              </tr>
            </thead>
            <tbody>
              {lista.filas.map((p) => {
                const link = (e: Etapa) =>
                  enlaceWholesale(params, { pedido: p.id, etapa: e });
                return (
                  <tr
                    key={p.id}
                    className={pedido === p.id ? "ws-seleccionado" : undefined}
                  >
                    <td>
                      <Link
                        href={link("pedido")}
                        aria-current={pedido === p.id ? "true" : undefined}
                      >
                        <strong>{p.numero}</strong>
                      </Link>
                      <span className="fila-sub">{p.cliente}</span>
                      <span className="fila-sub">
                        {categoriaWholesale(p.categoria)} · {p.estado}
                      </span>
                    </td>
                    <td>
                      <Link href={link("cotizacion")}>
                        {p.cotizacion || "Sin vínculo"}
                      </Link>
                      <span className="fila-sub">
                        {p.cotizacion_en
                          ? fechaWholesale(p.cotizacion_en)
                          : "Sin registro"}
                      </span>
                    </td>
                    <td>
                      <Link href={link("pedido")}>Registrado</Link>
                      <span className="fila-sub">
                        {fechaWholesale(p.creado_en)}
                      </span>
                    </td>
                    <td>
                      <Link href={link("alistado")}>
                        {p.preparaciones
                          ? `${p.preparaciones} preparaciones`
                          : "Sin registro"}
                      </Link>
                      <span className="fila-sub">
                        {p.preparado_en
                          ? `Última marca: ${fechaWholesale(p.preparado_en)}`
                          : p.ultima_preparacion_estado ||
                            "Sin marca de preparado"}
                      </span>
                    </td>
                    <td>
                      <Link href={link("verificacion")}>
                        {p.verificado_en ? "Con registro" : "Sin marca"}
                      </Link>
                      <span className="fila-sub">
                        {p.verificado_en
                          ? `Última: ${fechaWholesale(p.verificado_en)}`
                          : "Ver detalle de cada tanda"}
                      </span>
                    </td>
                    <td>
                      <Link href={link("salida")}>
                        {p.salidas
                          ? p.lineas_vigentes > 0 &&
                            p.lineas_entregadas === p.lineas_vigentes
                            ? "Completa"
                            : "Parcial"
                          : "Sin salidas vigentes"}
                      </Link>
                      <span className="fila-sub">
                        {p.salidas} movimientos
                        {p.salida_en ? ` · ${fechaWholesale(p.salida_en)}` : ""}
                      </span>
                    </td>
                    <td>
                      <Link href={link("pago")}>
                        {dineroWholesale(p.aplicado)} aplicado
                      </Link>
                      <span className="fila-sub">
                        Saldo: {dineroWholesale(p.saldo)}
                      </span>
                      {Number(p.en_revision) > 0 ? (
                        <span className="ws-aviso">
                          En revisión: {dineroWholesale(p.en_revision)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!lista.filas.length ? (
                <tr>
                  <td colSpan={7}>
                    No hay pedidos WholeSale con estos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <nav aria-label="Paginación de pedidos" className="paginacion">
          <span>
            {lista.total} pedidos · página {pagina} de {paginas}
          </span>
          <div>
            {pagina > 1 ? (
              <Link
                href={enlaceWholesale(params, { pagina: String(pagina - 1) })}
              >
                ← Anterior
              </Link>
            ) : null}
            {pagina < paginas ? (
              <Link
                href={enlaceWholesale(params, { pagina: String(pagina + 1) })}
              >
                Siguiente →
              </Link>
            ) : null}
          </div>
        </nav>
      </Panel>
      {d ? (
        <>
          <p className="ws-alcance">
            Expediente completo de {d.pedido.numero}
            {!lista.filas.some((p) => p.id === d.pedido.id)
              ? " · abierto por enlace directo, fuera de esta página de resultados"
              : ""}
            . Las horas de preparado y verificación son marcas registradas;
            consulta cada preparación para conocer su estado actual.
          </p>
          <ExpedientePedido
            key={`${d.pedido.id}:${antes ?? ""}:${etapa}`}
            datos={d}
            inicial={etapa}
            origen={enlaceOrigen("PEDIDO", d.pedido.id)?.href ?? null}
            historialAnterior={
              d.cobros.siguiente
                ? enlaceWholesale(params, {
                    pedido: d.pedido.id,
                    etapa: "pago",
                    antes: String(d.cobros.siguiente),
                  })
                : null
            }
          />
        </>
      ) : null}
    </>
  );
}
