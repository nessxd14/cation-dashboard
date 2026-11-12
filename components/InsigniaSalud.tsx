"use client";

import { useEffect, useState } from "react";

/**
 * Número de alertas de "Salud de datos" en el menú.
 * Se pide DESPUÉS de mostrar la página (no la frena) y se guarda 5 minutos:
 * en memoria entre navegaciones y en sessionStorage entre recargas completas.
 */
const CLAVE = "dash-alertas-salud";
const VIGENCIA_MS = 5 * 60 * 1000;
let enMemoria: { n: number; en: number } | null = null;
let enCurso: Promise<number | null> | null = null;

function leerGuardado(): number | null {
  const ahora = Date.now();
  if (enMemoria && ahora - enMemoria.en < VIGENCIA_MS) return enMemoria.n;
  try {
    const g = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null");
    if (g && typeof g.n === "number" && ahora - g.en < VIGENCIA_MS) {
      enMemoria = g;
      return g.n;
    }
  } catch {
    // sessionStorage no disponible: se pide al servidor
  }
  return null;
}

function pedir(): Promise<number | null> {
  enCurso ??= fetch("/filtros/alertas", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { alertas?: unknown } | null) => {
      const n = typeof d?.alertas === "number" ? d.alertas : null;
      if (n !== null) {
        enMemoria = { n, en: Date.now() };
        try {
          sessionStorage.setItem(CLAVE, JSON.stringify(enMemoria));
        } catch {
          // sin almacenamiento: queda solo en memoria
        }
      }
      return n;
    })
    .catch(() => null)
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

export function InsigniaSalud() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const g = leerGuardado();
    if (g !== null) {
      setN(g);
      return;
    }
    let vivo = true;
    pedir().then((v) => {
      if (vivo) setN(v);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return n && n > 0 ? (
    <span className="insignia mono" aria-label={`${n} alertas`}>
      {n}
    </span>
  ) : null;
}
