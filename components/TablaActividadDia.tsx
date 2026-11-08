"use client";

import { useState } from "react";
import type { ActividadDiaria } from "@/lib/operativo";

const TIPOS = {
  todas: "Todas",
  pedidos: "Pedidos",
  vtd: "VTD",
  traslados: "Traslados",
} as const;
const NOMBRES = {
  pedidos: "Pedido",
  vtd: "Venta directa",
  traslados: "Traslado",
};
const hora = new Intl.DateTimeFormat("es-BO", {
  timeZone: "America/La_Paz",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function TablaActividadDia({
  eventos,
  retail,
}: {
  eventos: (ActividadDiaria & { href: string })[];
  retail: string;
}) {
  const [tipo, setTipo] = useState<keyof typeof TIPOS>("todas");
  const filas = eventos
    .filter((evento) => tipo === "todas" || evento.tipo === tipo)
    .slice(0, 6);
  return (
    <>
      <div className="actividad-controles">
        <div
          className="actividad-filtros"
          role="group"
          aria-label="Tipo de actividad"
        >
          {Object.entries(TIPOS).map(([clave, texto]) => (
            <button
              key={clave}
              type="button"
              aria-pressed={tipo === clave}
              onClick={() => setTipo(clave as keyof typeof TIPOS)}
            >
              {texto}
            </button>
          ))}
        </div>
        <a className="boton-vidrio vista-accion" href={retail}>
          Abrir retail ↗
        </a>
      </div>
      <div
        className="tabla-scroll tabla-operativa"
        tabIndex={0}
        role="region"
        aria-label="Eventos seleccionados"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Documento</th>
              <th scope="col">Tipo</th>
              <th scope="col">Evento</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((evento) => (
              <tr key={evento.id}>
                <td className="mono">
                  <time dateTime={evento.fecha}>
                    {hora.format(new Date(evento.fecha))}
                  </time>
                </td>
                <th scope="row">
                  <a href={evento.href} target="_blank" rel="noreferrer">
                    {evento.documento} ↗
                  </a>
                </th>
                <td>{NOMBRES[evento.tipo]}</td>
                <td>
                  <span className={"vista-insignia vista-" + evento.tono}>
                    {evento.evento}
                  </span>
                </td>
              </tr>
            ))}
            {!filas.length ? (
              <tr>
                <td colSpan={4}>
                  Sin eventos de este tipo para el día consultado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="panel-sub">La hora corresponde al evento.</p>
    </>
  );
}
