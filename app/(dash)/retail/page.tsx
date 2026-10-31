import { notFound, redirect } from "next/navigation";
import { Cabecera } from "@/components/Cabecera";
import { Kpi } from "@/components/piezas";
import { ExpedienteRetail } from "@/components/ExpedienteRetail";
import { ErrorConsulta } from "@/components/ErrorConsulta";
import { ErrorDatos } from "@/lib/datos";
import { leerPeriodo } from "@/lib/periodo";
import { consultaComun, leerFiltros, type Parametros } from "@/lib/filtros";
import { paginaValida } from "@/lib/operativo";
import {
  obtenerListaRetail,
  obtenerExpedienteRetail,
} from "@/lib/retail-servidor";
import {
  TIPOS_RETAIL,
  ESTADOS_RETAIL,
  tipoRetail,
  estadoRetail,
  idRetail,
  enlaceRetail,
  dineroRetail,
  fechaRetail,
  cobroRetail,
} from "@/lib/retail";

export default async function RetailPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  try {
    return await Contenido({ params: await searchParams });
  } catch (e) {
    if (e instanceof ErrorDatos) return <ErrorConsulta mensaje={e.message} />;
    throw e;
  }
}
async function Contenido({ params }: { params: Parametros }) {
  const periodo = leerPeriodo(params),
    tipo = tipoRetail(params.retail_tipo),
    estado = estadoRetail(params.retail_estado),
    pagina = paginaValida(params.pagina);
  if (params.venta !== undefined && !idRetail(params.venta)) notFound();
  const venta = idRetail(params.venta);
  const [lista, d] = await Promise.all([
    obtenerListaRetail(
      periodo.desde,
      periodo.hasta,
      leerFiltros(params),
      tipo,
      estado,
      pagina,
    ),
    venta ? obtenerExpedienteRetail(venta) : Promise.resolve(null),
  ]);
  if (venta && !d) notFound();
  if (pagina > 1 && (pagina - 1) * 25 >= lista.total)
    redirect(enlaceRetail(params, { pagina: "" }));
  const r = lista.resumen,
    paginas = Math.max(1, Math.ceil(lista.total / 25));
  return (
    <div className="retail-reportes">
      <Cabecera
        titulo="Ventas retail"
        sub="VTD · Almacén / VTA · Mostrador · del documento al cobro y la entrega"
        ruta="/retail"
        params={params}
        tipos={[]}
      />
      <nav className="rt-tabs" aria-label="Tipo de documento">
        {TIPOS_RETAIL.map((t) => (
          <a
            key={t}
            href={enlaceRetail(params, { retail_tipo: t, pagina: "" })}
            aria-current={tipo === t ? "page" : undefined}
          >
            {t === "TODAS"
              ? "Todas"
              : t === "VTD"
                ? "VTD · Almacén"
                : "VTA · Mostrador"}
            <span className="mono">{lista.tipos[t]}</span>
          </a>
        ))}
      </nav>
      <section
        className="rt-kpis"
        aria-label="Indicadores del tipo seleccionado"
      >
        <Kpi
          nombre="Importe vigente"
          color="var(--pedidos)"
          valor={dineroRetail(r.importe)}
          nota={`${r.vigentes} documentos · incluye ventas abiertas`}
        />
        <Kpi
          nombre="Cobrado aplicado"
          color="var(--cobrado)"
          valor={dineroRetail(r.cobrado)}
          nota="Pagos confirmados de estos documentos"
        />
        <Kpi
          nombre="Saldo pendiente"
          color="var(--retail)"
          valor={dineroRetail(r.pendiente)}
          nota={`${r.por_cobrar} ${r.por_cobrar === 1 ? "documento" : "documentos"} sin pago completo`}
        />
      </section>
      <div className="rt-cola">
        <span>
          <strong>{r.entregas}</strong> entregas pendientes
        </span>
        <span>
          <strong>{r.posteriores}</strong> pagos posteriores autorizados
        </span>
        <span>
          <strong>{r.retornos}</strong> retornos pendientes
        </span>
        <span>
          <strong>{r.anulados}</strong> anulaciones
        </span>
        {r.en_revision > 0 ? (
          <span className="rt-aviso">
            {dineroRetail(r.en_revision)} en revisión
          </span>
        ) : null}
        {r.saldo_favor > 0 ? (
          <span>{dineroRetail(r.saldo_favor)} de saldo a favor aplicado</span>
        ) : null}
      </div>
      <section className="vidrio rt-lista" aria-label="Documentos retail">
        <header className="rt-seccion-cabeza">
          <h2>Documentos</h2>
          <form action="/retail" method="get" className="rt-filtro">
            {Array.from(consultaComun(params)).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <input type="hidden" name="retail_tipo" value={tipo} />
            <label>
              Ver{" "}
              <select name="retail_estado" defaultValue={estado}>
                {Object.entries(ESTADOS_RETAIL).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="boton-vidrio">
              Aplicar
            </button>
          </form>
        </header>
        <p className="rt-sub rt-alcance">
          El período y los filtros comerciales seleccionan documentos completos.
          Los indicadores corresponden al tipo seleccionado; el filtro de estado
          limita la lista. Los pagos en revisión y el saldo a favor se muestran
          aparte.
        </p>
        <table className="rt-tabla">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Cliente / sucursal</th>
              <th className="der">Importe</th>
              <th>Cobro</th>
              <th>Entrega</th>
            </tr>
          </thead>
          <tbody>
            {lista.filas.map((v) => {
              const c = cobroRetail(v);
              return (
                <tr
                  key={v.id}
                  className={venta === v.id ? "rt-seleccionado" : undefined}
                >
                  <td>
                    <a
                      href={enlaceRetail(params, { venta: v.id })}
                      aria-current={venta === v.id ? "true" : undefined}
                    >
                      <strong>{v.numero}</strong>
                    </a>
                    <span className={`fila-sub rt-${v.tipo.toLowerCase()}`}>
                      {v.tipo} · {fechaRetail(v.creado_en)}
                    </span>
                  </td>
                  <td>
                    {v.cliente}
                    <span className="fila-sub">{v.sucursal}</span>
                  </td>
                  <td className="der mono">
                    {dineroRetail(v.total)}
                    {v.anulada ? (
                      <span className="fila-sub">Excluido del neto</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={c.clase}>{c.texto}</span>
                    {v.pendiente > 0 ? (
                      <span className="fila-sub">
                        Saldo: {dineroRetail(v.pendiente)}
                      </span>
                    ) : null}
                    {v.en_revision > 0 ? (
                      <span className="fila-sub">
                        En revisión: {dineroRetail(v.en_revision)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={
                        v.entrega_pendiente || v.retorno_pendiente
                          ? "rt-aviso"
                          : "rt-neutro"
                      }
                    >
                      {v.entrega}
                    </span>
                    <span className="fila-sub">{v.modo}</span>
                  </td>
                </tr>
              );
            })}
            {!lista.filas.length ? (
              <tr>
                <td colSpan={5}>No hay documentos con estos filtros.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <nav className="paginacion" aria-label="Paginación de ventas retail">
          <span>
            {lista.total
              ? `${(pagina - 1) * 25 + 1}–${Math.min(pagina * 25, lista.total)} de ${lista.total}`
              : "Sin registros"}
          </span>
          <div>
            {pagina > 1 ? (
              <a href={enlaceRetail(params, { pagina: String(pagina - 1) })}>
                ← Anterior
              </a>
            ) : null}
            <span>
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas ? (
              <a href={enlaceRetail(params, { pagina: String(pagina + 1) })}>
                Siguiente →
              </a>
            ) : null}
          </div>
        </nav>
      </section>
      {d ? (
        <ExpedienteRetail d={d} params={params} />
      ) : (
        <p className="rt-sub rt-sin-seleccion">
          Selecciona un documento para ver sus productos, pagos y seguimiento.
        </p>
      )}
    </div>
  );
}
