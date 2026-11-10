"use client";

import { useState } from "react";
import type { Novedad, TipoNovedad } from "@/lib/operativo";
import { bs, bsConSigno, titulo } from "@/lib/formato";

type ConEnlace = Novedad & { href: string | null };

const FILTROS = {
  todas: { texto: "Todas", tipos: null },
  ventas: { texto: "Pedidos y VTD", tipos: ["pedido", "vtd"] },
  cotizaciones: { texto: "Cotizaciones", tipos: ["cotizacion"] },
  cobros: { texto: "Cobros", tipos: ["cobro"] },
  anulaciones: { texto: "Anulaciones", tipos: ["anulacion"] },
  otros: { texto: "Caja y otros", tipos: ["caja", "cliente", "traslado"] },
} as const satisfies Record<
  string,
  { texto: string; tipos: readonly TipoNovedad[] | null }
>;
type Filtro = keyof typeof FILTROS;

const hora = new Intl.DateTimeFormat("es-BO", {
  timeZone: "America/La_Paz",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Solo los nombres de cliente se normalizan; códigos y motivos van tal cual.
const nombreDocumento = (n: Novedad) =>
  n.tipo === "cobro" || n.tipo === "cliente"
    ? titulo(n.documento)
    : n.documento;
const detalleVisible = (n: Novedad) =>
  n.detalle &&
  (n.tipo === "pedido" || n.tipo === "cotizacion" || n.tipo === "vtd")
    ? titulo(n.detalle)
    : n.detalle;

export function ListaNovedades({ novedades }: { novedades: ConEnlace[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const cuenta = (clave: Filtro) => {
    const tipos: readonly TipoNovedad[] | null = FILTROS[clave].tipos;
    return tipos
      ? novedades.filter((n) => tipos.includes(n.tipo)).length
      : novedades.length;
  };
  const tipos: readonly TipoNovedad[] | null = FILTROS[filtro].tipos;
  const filas = tipos
    ? novedades.filter((n) => tipos.includes(n.tipo))
    : novedades;

  return (
    <>
      <div className="actividad-controles">
        <div
          className="actividad-filtros novedades-filtros"
          role="group"
          aria-label="Tipo de novedad"
        >
          {(Object.keys(FILTROS) as Filtro[]).map((clave) => (
            <button
              key={clave}
              type="button"
              aria-pressed={filtro === clave}
              onClick={() => setFiltro(clave)}
            >
              {FILTROS[clave].texto} · {cuenta(clave)}
            </button>
          ))}
        </div>
      </div>
      {filas.length ? (
        <ol className="novedades" aria-label="Novedades seleccionadas">
          {filas.map((n) => {
            const documento = nombreDocumento(n);
            const secundaria = [
              detalleVisible(n),
              n.origen ? `desde ${n.origen}` : null,
              n.usuario,
            ].filter(Boolean);
            return (
              <li key={n.id} className="novedad">
                <time className="novedad-hora mono" dateTime={n.fecha}>
                  {hora.format(new Date(n.fecha))}
                </time>
                <span className={"vista-insignia novedad-evento vista-" + n.tono}>
                  {n.evento}
                </span>
                <div className="novedad-cuerpo">
                  {n.href ? (
                    <a
                      className="novedad-doc"
                      href={n.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {documento} ↗
                    </a>
                  ) : (
                    <span className="novedad-doc">{documento}</span>
                  )}
                  {secundaria.length ? (
                    <span className="novedad-detalle">
                      {secundaria.join(" · ")}
                    </span>
                  ) : null}
                </div>
                <span className="novedad-monto mono">
                  {n.monto === null
                    ? ""
                    : n.con_signo
                      ? bsConSigno(n.monto)
                      : bs(n.monto)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="apagado" role="status">
          Sin novedades de este tipo para el día consultado.
        </p>
      )}
    </>
  );
}
