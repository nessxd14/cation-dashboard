"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function Herramientas({
  actualizado,
  tipos = ["ventas", "cobros", "salidas", "cartera"],
}: {
  actualizado: string;
  tipos?: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const [intervalo, setIntervalo] = useState(0);
  const [tipo, setTipo] = useState(tipos[0]);
  useEffect(() => {
    const v = Number(localStorage.getItem("dashboard-actualizar"));
    if ([0, 60, 300].includes(v)) setIntervalo(v);
  }, []);
  useEffect(() => {
    if (!intervalo) return;
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector("form:focus-within") &&
        !pendiente
      )
        iniciar(() => router.refresh());
    }, intervalo * 1000);
    return () => window.clearInterval(timer);
  }, [intervalo, router, pendiente]);
  const exportUrl = (formato: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("tipo", tipos.includes(tipo) ? tipo : tipos[0]);
    q.set("formato", formato);
    return `/exportar?${q}`;
  };
  return (
    <div className="herramientas no-imprimir">
      <span className="apagado">
        Consultado{" "}
        <time dateTime={actualizado}>
          {new Intl.DateTimeFormat("es-BO", {
            timeZone: "America/La_Paz",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).format(new Date(actualizado))}
        </time>{" "}
        · La Paz
      </span>
      <button
        className="boton-vidrio"
        disabled={pendiente}
        onClick={() => iniciar(() => router.refresh())}
      >
        {pendiente ? "Actualizando…" : "Actualizar"}
      </button>
      <label>
        Automático{" "}
        <select
          aria-label="Frecuencia de actualización"
          value={intervalo}
          onChange={(e) => {
            const v = Number(e.target.value);
            setIntervalo(v);
            localStorage.setItem("dashboard-actualizar", String(v));
          }}
        >
          <option value={0}>Apagado</option>
          <option value={60}>Cada minuto</option>
          <option value={300}>Cada 5 minutos</option>
        </select>
      </label>
      {tipos.length > 0 ? (
        <>
          <label>
            Reporte{" "}
            <select
              aria-label="Datos a exportar"
              value={tipos.includes(tipo) ? tipo : tipos[0]}
              onChange={(e) => setTipo(e.target.value)}
            >
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {
                    (
                      {
                        ventas: "Ventas",
                        cobros: "Cobros",
                        salidas: "Salidas",
                        cartera: "Partidas por cobrar",
                        inventario: "Inventario",
                        margen: "Márgenes",
                        cobranza: "Prioridades de cobranza",
                        metas: "Metas",
                        alertas: "Detalle de alerta",
                      } as Record<string, string>
                    )[t]
                  }
                </option>
              ))}
            </select>
          </label>
          <a href={exportUrl("xlsx")} className="boton-vidrio">
            Excel
          </a>
          <a href={exportUrl("pdf")} className="boton-vidrio">
            PDF
          </a>
        </>
      ) : null}
      <span role="status" className="visually-hidden">
        {pendiente ? `Actualizando ${ruta}` : "Datos consultados"}
      </span>
    </div>
  );
}
