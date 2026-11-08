import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Paginacion } from "@/components/Paginacion";
import { ErrorDatos } from "@/lib/datos";
import { obtenerAuditoria, paginaValida } from "@/lib/operativo";
import { bsConSigno, diaLargo, hoyLaPaz } from "@/lib/formato";
import { fechaWholesale } from "@/lib/wholesale";
import { leerPeriodo, OPCIONES, type Periodo } from "@/lib/periodo";
import type { Parametros } from "@/lib/filtros";
import {
  accionAuditoria,
  AREAS_AUDITORIA,
  enlaceAuditoria,
  LIMITE_AUDITORIA,
  type AreaAuditoria,
  type VistaAuditoria,
} from "@/lib/auditoria";
import "./auditoria.css";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams;
  const vista = params.vista === "eventos" ? "eventos" : "pendientes";
  const eventos = vista === "eventos";
  const area = AREAS_AUDITORIA.find((opcion) => opcion === params.area) ?? "";
  const periodo = leerPeriodo(params);
  const pagina = paginaValida(params.pagina);
  const seleccion = { ...params, vista, area };
  const hoy = hoyLaPaz();
  return (
    <section className="auditoria">
      <header className="encabezado auditoria-cabecera">
        <div>
          <h1>{eventos ? "Auditoría de eventos" : "Requiere atención"}</h1>
          <p className="subtitulo">
            {eventos
              ? "Actividad registrada · fechas y horas de Bolivia"
              : `Pendientes de la operación · Consulta ${diaLargo(hoy)}/${hoy.slice(0, 4)}`}
          </p>
        </div>
      </header>

      <nav className="auditoria-vistas" aria-label="Vistas de auditoría">
        <Link
          href={enlaceAuditoria(seleccion, { vista: "pendientes", pagina: "" })}
          aria-current={!eventos ? "page" : undefined}
        >
          Pendientes actuales
        </Link>
        <Link
          href={enlaceAuditoria(seleccion, { vista: "eventos", pagina: "" })}
          aria-current={eventos ? "page" : undefined}
        >
          Eventos del período
        </Link>
      </nav>

      <div className="auditoria-controles">
        {eventos ? (
          <nav className="periodos-opciones" aria-label="Períodos rápidos">
            {OPCIONES.map((opcion) => (
              <Link
                key={opcion.clave}
                href={enlaceAuditoria(seleccion, {
                  p: opcion.clave,
                  desde: "",
                  hasta: "",
                  pagina: "",
                })}
                aria-current={
                  periodo.clave === opcion.clave ? "true" : undefined
                }
              >
                {opcion.texto}
              </Link>
            ))}
          </nav>
        ) : null}
        <form action="/auditoria" method="get" className="auditoria-filtros">
          <input type="hidden" name="vista" value={vista} />
          {eventos ? (
            <>
              <input type="hidden" name="p" value="rango" />
              <label>
                Desde
                <input
                  type="date"
                  name="desde"
                  defaultValue={periodo.desde}
                  min="2000-01-01"
                  max="2100-12-31"
                  required
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  name="hasta"
                  defaultValue={periodo.hasta}
                  min="2000-01-01"
                  max="2100-12-31"
                  required
                />
              </label>
            </>
          ) : null}
          <label>
            Área
            <select name="area" defaultValue={area}>
              <option value="">Todas</option>
              {AREAS_AUDITORIA.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </label>
          <button className="boton-vidrio" type="submit">
            Ver
          </button>
        </form>
      </div>
      {eventos && periodo.aviso ? (
        <p className="aviso" role="alert">
          {periodo.aviso}
        </p>
      ) : null}

      <Suspense
        fallback={
          <div className="vidrio panel" role="status">
            Consultando registros…
          </div>
        }
      >
        <ResultadosAuditoria
          params={seleccion}
          vista={vista}
          area={area}
          periodo={periodo}
          pagina={pagina}
        />
      </Suspense>
    </section>
  );
}

async function ResultadosAuditoria({
  params,
  vista,
  area,
  periodo,
  pagina,
}: {
  params: Parametros;
  vista: VistaAuditoria;
  area: AreaAuditoria | "";
  periodo: Periodo;
  pagina: number;
}) {
  const eventos = vista === "eventos";
  const datos = await obtenerAuditoria(
    vista,
    periodo.desde,
    periodo.hasta,
    area,
    pagina,
  ).catch((error: unknown) => {
    if (error instanceof ErrorDatos) return error;
    throw error;
  });
  if (datos instanceof ErrorDatos)
    return (
      <div className="vidrio panel" role="alert">
        <h2>No se pudo cargar Auditoría</h2>
        <p>{datos.message}</p>
        <a href={enlaceAuditoria(params)}>Reintentar</a>
      </div>
    );
  if (pagina > 1 && (pagina - 1) * LIMITE_AUDITORIA >= datos.total)
    redirect(enlaceAuditoria(params, { pagina: "" }));
  return (
    <div className="vidrio auditoria-resultados">
      <div
        className="tabla-scroll"
        tabIndex={0}
        role="region"
        aria-label={eventos ? "Tabla de eventos" : "Tabla de pendientes"}
      >
        <table className="auditoria-tabla">
          <thead>
            <tr>
              {eventos ? <th scope="col">Fecha y hora</th> : null}
              <th scope="col">Caso</th>
              <th scope="col">{eventos ? "Evento" : "Motivo"}</th>
              {eventos ? <th scope="col">Responsable</th> : null}
              <th scope="col">Área</th>
              <th scope="col">Acción</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => {
              const accion = accionAuditoria(fila, vista);
              return (
                <tr key={fila.id}>
                  {eventos ? (
                    <td className="mono">
                      {fila.fecha
                        ? fechaWholesale(fila.fecha)
                        : "Sin fecha registrada"}
                    </td>
                  ) : null}
                  <th scope="row">{fila.caso}</th>
                  <td className={!eventos ? "auditoria-motivo" : undefined}>
                    {fila.motivo}
                    {fila.monto !== null
                      ? ` · ${bsConSigno(fila.monto).replace(/^\+/, "")}`
                      : null}
                  </td>
                  {eventos ? (
                    <td>{fila.responsable || "Sin responsable registrado"}</td>
                  ) : null}
                  <td>{fila.area}</td>
                  <td>
                    {accion ? (
                      <a
                        className="auditoria-accion"
                        href={accion.href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${accion.texto} · ${fila.caso} (otra pestaña)`}
                      >
                        {accion.texto} ↗
                      </a>
                    ) : (
                      <span className="apagado">Sin enlace</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!datos.total ? (
              <tr>
                <td colSpan={eventos ? 6 : 4}>
                  {eventos
                    ? "No hay eventos para este período y área."
                    : "No hay pendientes para esta área."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <footer className="auditoria-pie">
        <span>
          {eventos
            ? "Los eventos se ordenan del más reciente al más antiguo."
            : "Los pendientes pueden venir de días anteriores."}
        </span>
        {datos.total > 0 ? (
          <Paginacion
            total={datos.total}
            pagina={pagina}
            ruta="/auditoria"
            params={{
              p: params.p,
              desde: params.desde,
              hasta: params.hasta,
            }}
            extras={{ vista, area }}
            limite={LIMITE_AUDITORIA}
          />
        ) : null}
      </footer>
    </div>
  );
}
