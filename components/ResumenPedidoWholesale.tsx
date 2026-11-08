import { EstadoEtapaWholesale } from "./EstadoEtapaWholesale";
import { estadosEtapasWholesale } from "@/lib/wholesale-estados";
import {
  ETAPAS,
  TITULOS_ETAPA,
  dineroWholesale,
  enlaceTelegram,
  enlaceWholesale,
  fechaWholesale,
  type Etapa,
  type ExpedienteWholesale,
} from "@/lib/wholesale";
import type { Parametros } from "@/lib/filtros";

type Registro = { fecha: string | null; responsable: string | null };

export function ResumenPedidoWholesale({
  datos: d,
  params,
}: {
  datos: ExpedienteWholesale;
  params: Parametros;
}) {
  const p = d.pedido;
  const estados = estadosEtapasWholesale(p);
  const preparaciones = d.preparaciones.filter((a) => a.estado !== "ANULADO");
  const registros: Record<Etapa, Registro[]> = {
    cotizacion: d.cotizacion
      ? [
          {
            fecha: d.cotizacion.creado_en,
            responsable: d.cotizacion.creado_por,
          },
        ]
      : [],
    pedido: [{ fecha: p.creado_en, responsable: p.vendedor }],
    alistado: preparaciones.map((a) => ({
      fecha: a.preparado_en,
      responsable: a.preparador,
    })),
    verificacion: preparaciones.map((a) => ({
      fecha: a.verificado_en,
      responsable: a.verificador,
    })),
    salida: d.salidas
      .filter((s) => !s.revertido)
      .map((s) => ({ fecha: s.creado_en, responsable: s.actor })),
    pago: d.cobros.pagos
      .filter((pago) => !["ANULADO", "RECHAZADO"].includes(pago.estado))
      .map((pago) => ({
        fecha: pago.creado_en,
        responsable: pago.cobrado_por.nombre,
      })),
  };
  return (
    <section className="ws-resumen" aria-labelledby="ws-resumen-titulo">
      <header>
        <h2 id="ws-resumen-titulo">{p.numero} · Resumen por etapa</h2>
        <p>
          {p.cliente} · {dineroWholesale(p.total)}
        </p>
      </header>
      <div className="tabla-scroll">
        <table role="table" aria-labelledby="ws-resumen-titulo">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                Etapa
              </th>
              <th role="columnheader" scope="col">
                Estado
              </th>
              <th role="columnheader" scope="col">
                Responsables y última fecha
              </th>
              <th role="columnheader" scope="col">
                Accesos
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {ETAPAS.map((etapa) => {
              const responsables = [
                ...new Set(
                  registros[etapa].map((r) => r.responsable).filter(Boolean),
                ),
              ];
              const ultima = registros[etapa].reduce<string | null>(
                (fecha, r) => {
                  if (!r.fecha || !Number.isFinite(Date.parse(r.fecha)))
                    return fecha;
                  return !fecha || Date.parse(r.fecha) > Date.parse(fecha)
                    ? r.fecha
                    : fecha;
                },
                null,
              );
              const etapaEvidencia =
                etapa === "alistado"
                  ? "PREPARACION"
                  : etapa === "salida"
                    ? "SALIDA"
                    : null;
              const telegram = [
                ...new Set(
                  d.evidencias
                    .filter((e) => e.etapa === etapaEvidencia)
                    .map(enlaceTelegram)
                    .filter((href) => href !== null),
                ),
              ];
              return (
                <tr key={etapa} role="row">
                  <th role="rowheader" scope="row">
                    {TITULOS_ETAPA[etapa]}
                  </th>
                  <td role="cell">
                    <EstadoEtapaWholesale estado={estados[etapa]} />
                    {etapa === "cotizacion" && d.cotizacion ? (
                      <span className="fila-sub">{d.cotizacion.numero}</span>
                    ) : null}
                    {etapa === "pago"
                      ? estados.pago.detalles.map((texto) => (
                          <span className="fila-sub" key={texto}>
                            {texto}
                          </span>
                        ))
                      : null}
                  </td>
                  <td role="cell">
                    {responsables.join(", ") || "Sin responsable registrado"}
                    {ultima ? (
                      <span className="fila-sub">{fechaWholesale(ultima)}</span>
                    ) : null}
                  </td>
                  <td role="cell">
                    <a
                      className="ws-resumen-enlace"
                      href={enlaceWholesale(params, {
                        pedido: p.id,
                        etapa,
                        vista: "pagina",
                      })}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir ${TITULOS_ETAPA[etapa]} en otra pestaña`}
                    >
                      Ver detalle ↗
                    </a>
                    {telegram.map((href, i) => (
                      <a
                        className="ws-resumen-enlace"
                        key={href}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Telegram
                        {telegram.length > 1 ? ` · evidencia ${i + 1}` : ""} ↗
                      </a>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
