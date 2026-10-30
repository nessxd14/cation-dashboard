"use client";

import { useState } from "react";
import { EstadoEtapaWholesale } from "./EstadoEtapaWholesale";
import { estadosEtapasWholesale } from "@/lib/wholesale-estados";
import {
  ETAPAS,
  TITULOS_ETAPA,
  categoriaWholesale,
  fechaWholesale as fecha,
  dineroWholesale as dinero,
  cantidadWholesale as cantidad,
  historialWholesale,
  ventanaCamara,
  comandoOpenClaw,
  type Etapa,
  type EvidenciaWholesale,
  type ExpedienteWholesale,
} from "@/lib/wholesale";

function ImagenEvidencia({ url, texto }: { url: string; texto: string }) {
  const [fallo, setFallo] = useState(false);
  return fallo ? (
    <p className="ws-aviso">
      No se pudo abrir el archivo. Puede haberse eliminado o haber caducado su
      disponibilidad. Actualiza para volver a consultar.
    </p>
  ) : (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt={texto}
        loading="lazy"
        onError={() => setFallo(true)}
      />
    </a>
  );
}

export function ExpedientePedido({
  datos: d,
  inicial,
  origen,
  historialAnterior,
}: {
  datos: ExpedienteWholesale;
  inicial: Etapa;
  origen: string | null;
  historialAnterior: string | null;
}) {
  const [etapa, setEtapa] = useState<Etapa>(inicial);
  const [preparacion, setPreparacion] = useState(
    d.preparaciones.at(-1)?.id ?? "",
  );
  const [todos, setTodos] = useState(false);
  const [soloEtapa, setSoloEtapa] = useState(false);
  const [copia, setCopia] = useState("");
  const a = d.preparaciones.find((p) => p.id === preparacion);
  const p = d.pedido;
  const estados = estadosEtapasWholesale(p);
  const eventos = historialWholesale(d).filter(
    (e) =>
      !soloEtapa ||
      (e.etapa === etapa &&
        (!(etapa === "alistado" || etapa === "verificacion") ||
          !a ||
          e.preparacion === a.id)),
  );
  const visibles = todos ? eventos : eventos.slice(-12);
  const urlArchivo = (tipo: string, id: string, indice = 0) =>
    `/pedidos/archivo?${new URLSearchParams({ pedido: p.id, tipo, id, indice: String(indice) })}`;
  const evidencia = (e: EvidenciaWholesale) => (
    <section className="ws-evidencia" key={`${e.tipo}:${e.id}`}>
      <strong>
        {e.tipo === "pago"
          ? "Comprobante de pago"
          : `Evidencia de ${e.etapa === "SALIDA" ? "salida" : "preparación"}`}{" "}
        · #{e.id.slice(0, 8)}
      </strong>
      <p className="fila-sub">
        {fecha(e.creado_en)} · {e.estado}
        {e.preparacion_id ? ` · preparación #${e.preparacion_id}` : ""}
      </p>
      {e.descripcion ? (
        <details>
          <summary>Descripción de origen</summary>
          <p className="ws-prewrap">{e.descripcion}</p>
        </details>
      ) : null}
      <div className="ws-fotos">
        {e.archivos.map((f) =>
          !f.disponible ? (
            <p key={f.indice} className="ws-archivo-ausente">
              Archivo {f.indice + 1}: no disponible en Storage
              {e.eliminado_en ? ` · eliminado ${fecha(e.eliminado_en)}` : ""}
            </p>
          ) : e.mime && !e.mime.startsWith("image/") ? (
            <a
              key={f.indice}
              className="boton-vidrio"
              href={urlArchivo(e.tipo, e.id, f.indice)}
              target="_blank"
              rel="noreferrer"
            >
              Abrir documento {f.indice + 1} ↗
            </a>
          ) : (
            <ImagenEvidencia
              key={`${e.id}:${f.indice}`}
              url={urlArchivo(e.tipo, e.id, f.indice)}
              texto={`Evidencia ${e.etapa.toLowerCase()} de ${p.numero}, archivo ${f.indice + 1}`}
            />
          ),
        )}
      </div>
      {!e.archivos.length ? (
        <p className="apagado">Sin archivos asociados a este registro.</p>
      ) : null}
      {e.telegram?.length ? (
        <p className="fila-sub">
          Referencias en Telegram:{" "}
          {e.telegram
            .map((t) => t.message_id)
            .filter(Boolean)
            .join(", ") || "Registradas"}
          . El envío a Telegram no garantiza que el archivo siga en Storage.
        </p>
      ) : null}
    </section>
  );
  const evidencias = d.evidencias.filter((e) =>
    etapa === "pago"
      ? e.tipo === "pago"
      : etapa === "salida"
        ? e.tipo === "operacion" && e.etapa === "SALIDA"
        : etapa === "alistado" || etapa === "verificacion"
          ? e.tipo === "operacion" &&
            e.etapa !== "SALIDA" &&
            (!a || e.preparacion_id === a.id)
          : false,
  );
  const ventana = a ? ventanaCamara(a) : null;
  return (
    <section
      className="vidrio panel ws-expediente"
      aria-label={`Expediente ${p.numero}`}
    >
      <div className="ws-cabecera">
        <div>
          <span className="ws-kicker">Expediente · solo lectura</span>
          <h2>
            {p.numero}{" "}
            <span className="ws-insignia">
              {categoriaWholesale(p.categoria)}
            </span>
          </h2>
          <p>{p.cliente}</p>
          <p className="fila-sub">
            {p.vendedor} · {p.estado} · registrado {fecha(p.creado_en)}
          </p>
        </div>
        <div className="ws-importes">
          <strong>{dinero(p.total)}</strong>
          <span>Total comercial del pedido</span>
          <span>Aplicado a partidas: {dinero(p.aplicado)}</span>
          <span>Saldo de partidas vigentes: {dinero(p.saldo)}</span>
          {Number(p.en_revision) > 0 ? (
            <span className="ws-aviso">
              En revisión: {dinero(p.en_revision)}
            </span>
          ) : null}
        </div>
      </div>
      <nav className="ws-etapas" aria-label="Etapas del expediente">
        {ETAPAS.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => {
              setEtapa(e);
              setTodos(false);
            }}
            aria-pressed={etapa === e}
          >
            <span className="ws-etapa-titulo">{TITULOS_ETAPA[e]}</span>
            <EstadoEtapaWholesale estado={estados[e]} />
          </button>
        ))}
      </nav>
      <div className="ws-expediente-grid">
        <article className="ws-contenido" aria-label={TITULOS_ETAPA[etapa]}>
          <h3>{TITULOS_ETAPA[etapa]}</h3>
          {etapa === "cotizacion" ? (
            d.cotizacion ? (
              <>
                <p>
                  <strong>{d.cotizacion.numero}</strong> · {d.cotizacion.estado}{" "}
                  · versión {d.cotizacion.version}
                </p>
                <p className="fila-sub">
                  Creada {fecha(d.cotizacion.creado_en)} ·{" "}
                  {d.cotizacion.creado_por}
                </p>
                <p className="ws-aviso">
                  Se muestra la versión actual de la cotización vinculada. No
                  sustituye una copia histórica de la versión aceptada.
                </p>
                {p.cotizacion_vinculo_fuente === "REFERENCIA_HISTORICA" ? (
                  <p className="fila-sub">
                    Vínculo recuperado de la referencia histórica del pedido.
                  </p>
                ) : null}
                <div className="tabla-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad base</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.cotizacion.lineas.map((l) => (
                        <tr key={l.id}>
                          <td>{l.descripcion}</td>
                          <td>
                            {cantidad(l.cantidad)} {l.unidad}
                          </td>
                          <td className="mono">{dinero(l.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Total cotización:{" "}
                  <strong>{dinero(d.cotizacion.total)}</strong>
                </p>
                {d.cotizacion.notas ? (
                  <p className="ws-prewrap">{d.cotizacion.notas}</p>
                ) : null}
                {d.cotizacion.condiciones ? (
                  <p className="ws-prewrap">{d.cotizacion.condiciones}</p>
                ) : null}
              </>
            ) : (
              <p className="ws-vacio">
                Sin cotización vinculada. El resto del expediente permanece
                disponible.
              </p>
            )
          ) : null}
          {etapa === "pedido" ? (
            <>
              <p className="fila-sub">
                Cantidades base por producto. Se conservan líneas rechazadas,
                cambiadas o retiradas con su estado.
              </p>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Producto / línea</th>
                      <th>Estado</th>
                      <th>Pedido</th>
                      <th>Despachado</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lineas.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.descripcion}
                          <span className="fila-sub">
                            #{l.id} · {l.unidad}
                            {l.nota ? ` · ${l.nota}` : ""}
                          </span>
                        </td>
                        <td>{l.estado}</td>
                        <td className="mono">{cantidad(l.cantidad)}</td>
                        <td className="mono">{cantidad(l.despachada)}</td>
                        <td className="mono">{dinero(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {etapa === "alistado" || etapa === "verificacion" ? (
            <>
              {d.preparaciones.length ? (
                <label className="ws-selector">
                  Preparación / tanda
                  <select
                    aria-label="Preparación o tanda"
                    value={preparacion}
                    onChange={(e) => {
                      setPreparacion(e.target.value);
                      setTodos(false);
                    }}
                  >
                    {d.preparaciones.map((t, i) => (
                      <option key={t.id} value={t.id}>
                        {i + 1} · #{t.id} · {t.sucursal} · {t.estado}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="ws-vacio">
                  Sin preparación registrada. No se infiere el preparado ni la
                  verificación a partir de una salida.
                </p>
              )}
              {a ? (
                <>
                  <div className="ws-datos">
                    <div>
                      <span>Preparador</span>
                      <strong>{a.preparador || "Sin registrar"}</strong>
                    </div>
                    <div>
                      <span>Verificador</span>
                      <strong>{a.verificador || "Sin registrar"}</strong>
                    </div>
                    <div>
                      <span>Estado actual de la tanda</span>
                      <strong>
                        {a.estado} · versión {a.version}
                      </strong>
                    </div>
                    <div>
                      <span>
                        Marca de{" "}
                        {etapa === "alistado" ? "preparado" : "verificación"}
                      </span>
                      <strong>
                        {fecha(
                          etapa === "alistado"
                            ? a.preparado_en
                            : a.verificado_en,
                        )}
                      </strong>
                    </div>
                  </div>
                  {a.estado === "ANULADO" ? (
                    <p className="ws-aviso">
                      Preparación anulada: sus cantidades se muestran como
                      historial.
                    </p>
                  ) : null}
                  <div className="tabla-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Producto / línea</th>
                          <th>Preparado</th>
                          <th>Verificado</th>
                          <th>Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.lineas.map((l) => (
                          <tr key={l.linea_id}>
                            <td>
                              {l.descripcion ||
                                d.lineas.find((x) => x.id === l.linea_id)
                                  ?.descripcion ||
                                `Línea #${l.linea_id}`}
                              <span className="fila-sub">
                                #{l.linea_id} ·{" "}
                                {l.unidad ||
                                  d.lineas.find((x) => x.id === l.linea_id)
                                    ?.unidad ||
                                  "Unidad base"}
                                {!l.vigente ? " · no vigente" : ""}
                              </span>
                            </td>
                            <td className="mono">{cantidad(l.preparada)}</td>
                            <td className="mono">
                              {cantidad(l.verificada_en ? l.verificada : null)}
                              <span className="fila-sub">
                                {l.verificada_en
                                  ? fecha(l.verificada_en)
                                  : "Sin marca de revisión"}
                              </span>
                            </td>
                            <td>
                              {l.observacion_revision || l.observacion || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <section className="ws-camara" aria-label="Ventana de cámara">
                    <h4>La Chismosa · ventana solicitada</h4>
                    {ventana ? (
                      <>
                        <p className="mono">
                          {fecha(ventana.inicio)} →{" "}
                          {ventana.fin
                            ? fecha(ventana.fin)
                            : "fin pendiente de verificación"}
                        </p>
                        <p className="fila-sub">
                          Preparado −5 min → verificado +5 min · hora de Bolivia
                        </p>
                      </>
                    ) : (
                      <p>Sin marcas válidas para calcular el tramo.</p>
                    )}
                    <p className="fila-sub">
                      La marca de preparado es un cierre. El inicio del armado
                      está en el historial; el tramo propuesto puede no
                      incluirlo completo.
                    </p>
                    {d.clips
                      .filter((c) => c.preparacion_id === a.id)
                      .map((c) => (
                        <div key={c.id} className="ws-clip">
                          <strong>{c.camara}</strong>
                          <p>
                            {fecha(c.inicio)} → {fecha(c.fin)}
                          </p>
                          {c.disponible ? (
                            <>
                              <video
                                controls
                                preload="none"
                                src={urlArchivo("clip", c.id)}
                                aria-label={`Clip ${c.camara}`}
                              />
                              <a
                                href={urlArchivo("clip", c.id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir clip ↗
                              </a>
                            </>
                          ) : (
                            <p className="ws-aviso">
                              Clip registrado, archivo no disponible.
                            </p>
                          )}
                        </div>
                      ))}
                    {!d.clips.some((c) => c.preparacion_id === a.id) ? (
                      <p className="ws-vacio">
                        Sin clip vinculado a esta preparación. La conexión al
                        grabador está pendiente.
                      </p>
                    ) : null}
                  </section>
                </>
              ) : null}
            </>
          ) : null}
          {etapa === "salida" ? (
            <>
              <p className="fila-sub">
                Cada salida conserva su cantidad y responsable; las reversiones
                permanecen identificadas.
              </p>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha / responsable</th>
                      <th>Producto</th>
                      <th>Cantidad base</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.salidas.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {fecha(s.creado_en)}
                          <span className="fila-sub">
                            {s.actor || "Sin responsable"} · salida #{s.id}
                          </span>
                        </td>
                        <td>
                          {d.lineas.find((l) => l.id === s.linea_id)
                            ?.descripcion || `Línea #${s.linea_id}`}
                        </td>
                        <td className="mono">{cantidad(s.cantidad)}</td>
                        <td>
                          {s.revertido ? "REVERTIDA" : "Vigente"}
                          {s.revertido_en ? (
                            <span className="fila-sub">
                              {fecha(s.revertido_en)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!d.salidas.length ? (
                      <tr>
                        <td colSpan={4}>Sin salidas registradas.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {d.preparaciones
                .filter((t) => t.retiro)
                .map((t) => (
                  <div key={t.id} className="ws-registro">
                    <strong>Retiro · preparación #{t.id}</strong>
                    <p>
                      {t.retiro!.responsable || "Sin responsable"} ·{" "}
                      {fecha(t.retiro!.retirado_en)} · {t.retiro!.estado}
                    </p>
                    <p className="fila-sub">
                      Destino: {t.retiro!.destino || "Sin registrar"}
                    </p>
                  </div>
                ))}
              <p className="ws-vacio">
                Horas de llegada y salida de La Chismosa: sin integración
                vinculada a este pedido. La hora de despacho no se utiliza como
                hora de visita.
              </p>
            </>
          ) : null}
          {etapa === "pago" ? (
            <>
              <p className="fila-sub">
                Se muestra el importe total del pago y lo aplicado
                específicamente a este pedido. Los anticipos sin asignación no
                se descuentan de las partidas.
              </p>
              {d.cobros.pagos.map((v) => (
                <section key={v.id} className="ws-registro">
                  <div className="ws-registro-cabeza">
                    <strong>
                      Pago #{v.id} · {v.medio}
                    </strong>
                    <span className="ws-insignia">{v.estado}</span>
                  </div>
                  <p>
                    {fecha(v.creado_en)} · recibido por {v.cobrado_por.nombre}
                  </p>
                  <div className="ws-datos">
                    <div>
                      <span>Importe del pago completo</span>
                      <strong>{dinero(v.monto)}</strong>
                    </div>
                    <div>
                      <span>Aplicado a este pedido</span>
                      <strong>{dinero(v.aplicado_pedido)}</strong>
                    </div>
                    <div>
                      <span>Devuelto del pago</span>
                      <strong>{dinero(v.devuelto)}</strong>
                    </div>
                  </div>
                  <p className="fila-sub">
                    Referencia: {v.referencia || "Sin registrar"} · turno{" "}
                    {v.turno?.id ?? "sin registro"}
                    {v.turno?.caja ? ` · ${v.turno.caja}` : ""}
                  </p>
                  {v.verificado_por ? (
                    <p className="fila-sub">
                      Decisión: {v.verificado_por.nombre} ·{" "}
                      {fecha(v.verificado_en)}
                    </p>
                  ) : null}
                </section>
              ))}
              {!d.cobros.pagos.length ? (
                <p className="ws-vacio">Sin pagos vinculados a este pedido.</p>
              ) : null}
              {d.cobros.saldos.map((s) => (
                <div className="ws-registro" key={s.id}>
                  <strong>
                    Saldo a favor #{s.id} ·{" "}
                    {s.anulado_en ? "REVERTIDO" : "Aplicado"}
                  </strong>
                  <p>
                    {fecha(s.creado_en)} · {s.aplicado_por.nombre}
                  </p>
                  <p>
                    Asignado a las partidas de este pedido:{" "}
                    {dinero(
                      s.aplicaciones.reduce((n, x) => n + Number(x.monto), 0),
                    )}
                  </p>
                </div>
              ))}
              <h4>Partidas por cobrar</h4>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Total</th>
                      <th>Aplicado</th>
                      <th>En revisión</th>
                      <th>Pendiente</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.cobros.partidas.map((x) => (
                      <tr key={x.id}>
                        <td>{x.documento}</td>
                        <td>{dinero(x.total)}</td>
                        <td>{dinero(x.aplicado)}</td>
                        <td>{dinero(x.en_revision)}</td>
                        <td>{dinero(x.pendiente)}</td>
                        <td>
                          {x.estado}
                          {x.saldada ? " · saldada" : ""}
                        </td>
                      </tr>
                    ))}
                    {!d.cobros.partidas.length ? (
                      <tr>
                        <td colSpan={6}>
                          Sin partidas vinculadas. No se presume saldo cero.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <details className="ws-auditoria">
                <summary>
                  Auditoría de cobros · {d.cobros.historial_total} eventos
                </summary>
                {d.cobros.historial.map((e) => (
                  <p key={e.id}>
                    #{e.id} · {fecha(e.creado_en)} ·{" "}
                    {e.accion.replaceAll("_", " ")} · {e.actor.nombre}
                  </p>
                ))}
                {historialAnterior ? (
                  <a href={historialAnterior}>
                    Ver eventos de cobro anteriores →
                  </a>
                ) : null}
                <p className="fila-sub">
                  Captura de auditoría desde {fecha(d.cobros.captura_desde)}.
                  Los registros anteriores pueden carecer de horas auditadas.
                </p>
              </details>
            </>
          ) : null}
          {etapa !== "cotizacion" && etapa !== "pedido" ? (
            <section className="ws-adjuntos">
              <h4>Evidencias asociadas</h4>
              {evidencias.length ? (
                evidencias.map(evidencia)
              ) : (
                <p className="ws-vacio">
                  No hay archivos vinculados a esta etapa
                  {a && (etapa === "alistado" || etapa === "verificacion")
                    ? ` de la preparación #${a.id}`
                    : ""}
                  .
                </p>
              )}
              {etapa === "verificacion" && evidencias.length ? (
                <p className="fila-sub">
                  Estas fotos pertenecen a la preparación. No se presentan como
                  fotos tomadas por el verificador.
                </p>
              ) : null}
            </section>
          ) : null}
        </article>
        <aside className="ws-historial" aria-label="Secuencia cronológica">
          <h3>Secuencia cronológica</h3>
          <label className="ws-secuencia-filtro">
            <input
              type="checkbox"
              checked={soloEtapa}
              onChange={(e) => {
                setSoloEtapa(e.target.checked);
                setTodos(false);
              }}
            />
            Solo esta etapa / tanda
          </label>
          <p className="fila-sub">
            {eventos.length} eventos · fechas reales · La Paz
          </p>
          <ol>
            {visibles.map((e) => (
              <li key={e.id} className={e.anulado ? "ws-anulado" : ""}>
                <button
                  type="button"
                  className="ws-evento-enlace"
                  onClick={() => {
                    setEtapa(e.etapa);
                    if (e.preparacion) setPreparacion(e.preparacion);
                  }}
                >
                  {e.titulo}
                </button>
                <time dateTime={e.fecha}>{fecha(e.fecha)}</time>
                <span>
                  {e.actor || "Responsable no registrado"} · {e.origen}
                </span>
                {e.detalle ? <span>{e.detalle}</span> : null}
                {e.anulado ? (
                  <span className="ws-aviso">Anulado / revertido</span>
                ) : null}
              </li>
            ))}
          </ol>
          {!eventos.length ? (
            <p className="ws-vacio">
              Sin eventos registrados para esta selección.
            </p>
          ) : null}
          {eventos.length > 12 ? (
            <button
              className="boton-texto"
              type="button"
              onClick={() => setTodos(!todos)}
            >
              {todos ? "Mostrar últimos 12" : "Ver secuencia completa"}
            </button>
          ) : null}
        </aside>
      </div>
      <section className="ws-openclaw" aria-label="Lectura de OpenClaw">
        <div className="ws-registro-cabeza">
          <div>
            <span className="ws-kicker">Asistencia de IA</span>
            <h3>OpenClaw · lectura por pedido</h3>
          </div>
          <button
            className="boton-vidrio"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(comandoOpenClaw(d));
                setCopia("Comando y captura copiados para OpenClaw.");
              } catch {
                setCopia(
                  "No se pudo copiar. Usa Descargar contexto para OpenClaw.",
                );
              }
            }}
          >
            Copiar comando y contexto
          </button>
        </div>
        <a href={`/pedidos/${p.id}/contexto`} download>
          Descargar contexto para OpenClaw
        </a>
        <p role="status" className="fila-sub">
          {copia}
        </p>
        {d.lecturas_ia.length ? (
          d.lecturas_ia.map((l, i) => (
            <details key={l.id} open={i === 0}>
              <summary>
                {l.agente} · {fecha(l.generado_en)} · datos hasta{" "}
                {fecha(l.datos_hasta)}
              </summary>
              <p className="ws-prewrap">{l.resumen}</p>
              {l.observaciones.length ? (
                <pre>{JSON.stringify(l.observaciones, null, 2)}</pre>
              ) : null}
              <details>
                <summary>Referencias declaradas por el agente</summary>
                <pre>{JSON.stringify(l.fuentes, null, 2)}</pre>
              </details>
              <p className="fila-sub">
                Interpretación de IA; consultar las evidencias originales. Puede
                haber cambios posteriores a la captura.
              </p>
            </details>
          ))
        ) : (
          <p className="ws-vacio">
            Todavía no hay una lectura de OpenClaw guardada para este pedido.
          </p>
        )}
      </section>
      <div className="ws-pie">
        Consultado {fecha(d.consultado_en)} ·{" "}
        {origen ? (
          <a href={origen} target="_blank" rel="noreferrer">
            Abrir pedido en Almacén ↗
          </a>
        ) : null}
      </div>
    </section>
  );
}
