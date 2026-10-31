import {
  cobroRetail,
  dineroRetail,
  enlaceRetail,
  fechaRetail,
  type ExpedienteRetail,
} from "@/lib/retail";
import type { Parametros } from "@/lib/filtros";
import { nombre } from "@/lib/formato";

function detalleEvento(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor;
  if (typeof valor !== "object" || Array.isArray(valor)) return null;
  const detalle = valor as Record<string, unknown>;
  return (
    ["motivo", "referencia"]
      .flatMap((k) => (typeof detalle[k] === "string" ? [detalle[k]] : []))
      .join(" · ") || null
  );
}
const ACCIONES: Record<string, string> = {
  SOLICITUD_CREADA: "Solicitud registrada",
  VINCULADO: "Vinculada a Caja + Almacén",
  ESCANEADO: "Material verificado en Almacén",
  ENVIAR: "Material enviado a Caja",
  COMPLETAR: "Entrega confirmada por Caja",
  COMPLETADA_AUTO: "Operación completada",
  CERRADA_AUTO: "Operación cerrada",
  CERRAR_RECHAZO: "Rechazo cerrado",
  RECHAZADO: "Entrega rechazada",
  AJUSTADO: "Documento ajustado",
  AJUSTE_MANUAL: "Cantidad ajustada",
  ANULADA: "Venta anulada",
  COBRADA: "Cobro registrado",
  LINEA_CAMBIADA: "Producto cambiado",
};
export function ExpedienteRetail({
  d,
  params,
}: {
  d: ExpedienteRetail;
  params: Parametros;
}) {
  const cobro = cobroRetail(d);
  return (
    <section
      className="vidrio rt-expediente"
      aria-label={`Detalle de ${d.numero}`}
      id="documento-retail"
    >
      <header className="rt-seccion-cabeza">
        <div>
          <span className={`rt-tipo rt-${d.tipo.toLowerCase()}`}>
            {d.tipo} · {d.modo}
          </span>
          <h2>{d.numero}</h2>
          <p className="rt-sub">
            {d.cliente} · {d.sucursal}
          </p>
        </div>
        <a href={enlaceRetail(params)}>Cerrar detalle</a>
      </header>
      <div className="rt-estados">
        <span className={cobro.clase}>{cobro.texto}</span>
        <span
          className={
            d.entrega_pendiente || d.retorno_pendiente
              ? "rt-aviso"
              : "rt-neutro"
          }
        >
          {d.entrega}
        </span>
      </div>
      {d.anulada ? (
        <p className="rt-nota">
          Documento anulado: su importe se excluye de los indicadores vigentes.
          Los pagos conservados aquí son su historial, no una confirmación de
          devolución.
        </p>
      ) : null}
      <div className="rt-detalle-rejilla">
        <div>
          <h3>Cobro y responsables</h3>
          <dl className="rt-datos">
            <dt>Vendedor / responsable</dt>
            <dd>{d.vendedor}</dd>
            <dt>Cajero del cobro</dt>
            <dd>{d.cajero || "Sin registro de cobro"}</dd>
            <dt>Registrado</dt>
            <dd>{fechaRetail(d.creado_en)}</dd>
            <dt>Importe del documento</dt>
            <dd>{dineroRetail(d.total)}</dd>
            <dt>Descuento</dt>
            <dd>{dineroRetail(d.descuento)}</dd>
            <dt>Pago confirmado</dt>
            <dd>{dineroRetail(d.cobrado)}</dd>
            <dt>En revisión</dt>
            <dd>{dineroRetail(d.en_revision)}</dd>
            <dt>Saldo a favor aplicado</dt>
            <dd>{dineroRetail(d.saldo_favor)}</dd>
            <dt>Saldo sin pago registrado</dt>
            <dd>{dineroRetail(d.pendiente)}</dd>
          </dl>
          {d.pago_posterior ? (
            <p className="rt-nota">
              <strong>Pago posterior autorizado</strong>
              <br />
              {d.pago_posterior_motivo || "Sin motivo disponible"}
              {d.pago_posterior_en ? (
                <>
                  <br />
                  {fechaRetail(d.pago_posterior_en)}
                </>
              ) : null}
            </p>
          ) : null}
          {d.notas ? (
            <p className="rt-nota">
              <strong>Notas de la venta</strong>
              <br />
              {d.notas}
            </p>
          ) : null}
        </div>
        <div>
          <h3>Seguimiento de la operación</h3>
          <ol className="rt-cronologia">
            {[...d.eventos]
              .sort(
                (a, b) =>
                  Date.parse(a.fecha) - Date.parse(b.fecha) ||
                  (a.id.startsWith("venta:")
                    ? -1
                    : b.id.startsWith("venta:")
                      ? 1
                      : a.id.startsWith("completada:")
                        ? 1
                        : b.id.startsWith("completada:")
                          ? -1
                          : 0),
              )
              .map((e) => (
                <li key={e.id}>
                  <time dateTime={e.fecha}>{fechaRetail(e.fecha)}</time>
                  <div>
                    <strong>
                      {ACCIONES[e.accion] ||
                        nombre(e.accion.replaceAll("_", " "))}
                    </strong>
                    {e.actor ? <span className="rt-sub">{e.actor}</span> : null}
                    {detalleEvento(e.detalle) ? (
                      <p>{detalleEvento(e.detalle)}</p>
                    ) : null}
                  </div>
                </li>
              ))}
          </ol>
          {!d.entrega_estado ? (
            <p className="rt-nota">
              Este documento no tiene una confirmación de entrega independiente
              en Caja + Almacén. “Venta completada” corresponde al estado
              registrado de la venta.
            </p>
          ) : null}
        </div>
      </div>
      <h3>Productos</h3>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Producto / presentación</th>
              <th className="der">Cantidad</th>
              <th className="der">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {d.lineas.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.descripcion}
                  <span className="fila-sub">
                    {l.presentacion || l.unidad || "Unidad base"}
                  </span>
                </td>
                <td className="der mono">
                  {l.cantidad_presentacion ?? l.cantidad}
                </td>
                <td className="der mono">
                  {l.subtotal === null
                    ? "Sin registro"
                    : dineroRetail(l.subtotal)}
                </td>
              </tr>
            ))}
            {!d.lineas.length ? (
              <tr>
                <td colSpan={3}>Sin líneas disponibles.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="rt-nota">
        El total del documento conserva su descuento. Los subtotales de líneas
        pueden corresponder a importes anteriores al descuento general.
      </p>
      <h3>Pagos de este documento</h3>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha / medio</th>
              <th>Verificación</th>
              <th className="der">Aplicado</th>
            </tr>
          </thead>
          <tbody>
            {d.pagos.map((p) => (
              <tr key={p.id}>
                <td>
                  {nombre(p.metodo)}
                  <span className="fila-sub">
                    {fechaRetail(p.creado_en)} · pago #{p.id}
                  </span>
                  {p.referencia ? (
                    <span className="fila-sub">{p.referencia}</span>
                  ) : null}
                </td>
                <td
                  className={
                    p.estado === "PENDIENTE" || p.estado === "RECHAZADO"
                      ? "rt-aviso"
                      : "rt-ok"
                  }
                >
                  {p.estado === "NO_APLICA"
                    ? "No requiere verificación"
                    : nombre(p.estado)}
                </td>
                <td className="der mono">{dineroRetail(p.monto)}</td>
              </tr>
            ))}
            {d.usos_saldo.map((s) => (
              <tr key={`saldo:${s.id}`}>
                <td>
                  Saldo a favor
                  <span className="fila-sub">
                    {fechaRetail(s.creado_en)} · uso #{s.id}
                  </span>
                </td>
                <td>
                  {s.anulado_en
                    ? `Revertido · ${fechaRetail(s.anulado_en)}`
                    : "Aplicado"}
                </td>
                <td className="der mono">{dineroRetail(s.monto)}</td>
              </tr>
            ))}
            {!d.pagos.length && !d.usos_saldo.length ? (
              <tr>
                <td colSpan={3}>No hay pagos ni usos de saldo registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {d.cobro_conjunto ? (
        <section
          className="rt-conjunto"
          aria-label="Comprobante de caja vinculado"
        >
          <h3>
            {d.cobro_conjunto.documentos.length > 1
              ? "Cobro conjunto"
              : "Comprobante de caja"}{" "}
            · {d.cobro_conjunto.numero}
          </h3>
          <p className="rt-sub">
            Total del comprobante: {dineroRetail(d.cobro_conjunto.total)} ·{" "}
            {fechaRetail(d.cobro_conjunto.creado_en)}
          </p>
          <ul>
            {d.cobro_conjunto.documentos.map((v) => (
              <li key={v.id}>
                {v.id === d.id ? (
                  <strong>{v.numero}</strong>
                ) : (
                  <a href={enlaceRetail(params, { venta: v.id })}>{v.numero}</a>
                )}
                <span>
                  {dineroRetail(v.total)}
                  {v.estado === "ANULADA" ? " · anulada" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="rt-nota">
            El comprobante vincula los documentos. Los indicadores suman
            únicamente los pagos y usos de saldo aplicados a cada venta, sin
            repetir el total del comprobante. Cada documento conserva su
            entrega.
          </p>
        </section>
      ) : null}
    </section>
  );
}
