import { hoyLaPaz } from "./formato";

export type ClavePeriodo = "hoy" | "7d" | "mes" | "30d" | "rango";

export type Periodo = {
  clave: ClavePeriodo;
  desde: string;
  hasta: string;
  etiqueta: string;
  aviso?: string;
};

export const OPCIONES: {
  clave: Exclude<ClavePeriodo, "rango">;
  texto: string;
}[] = [
  { clave: "hoy", texto: "Hoy" },
  { clave: "7d", texto: "Semana" },
  { clave: "mes", texto: "Mes" },
  { clave: "30d", texto: "30 días" },
];

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function fechaValida(valor: string): boolean {
  if (!ISO.test(valor) || valor < "2000-01-01" || valor > "2100-12-31")
    return false;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return (
    Number.isFinite(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor
  );
}

/** Lee ?p=…&desde=…&hasta=… y devuelve un rango en días de La Paz. Por defecto, 30 días. */
export function leerPeriodo(
  params: Record<string, string | string[] | undefined>,
): Periodo {
  const hoy = hoyLaPaz();
  const p = typeof params.p === "string" ? params.p : "30d";
  const desde = typeof params.desde === "string" ? params.desde : "";
  const hasta = typeof params.hasta === "string" ? params.hasta : "";

  if (
    p === "rango" &&
    fechaValida(desde) &&
    fechaValida(hasta) &&
    desde <= hasta
  ) {
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000 + 1;
    if (dias <= 400) return { clave: "rango", desde, hasta, etiqueta: "Rango" };
  }
  if (p === "hoy")
    return { clave: "hoy", desde: hoy, hasta: hoy, etiqueta: "Hoy" };
  if (p === "7d")
    return {
      clave: "7d",
      desde: sumarDias(hoy, -6),
      hasta: hoy,
      etiqueta: "Últimos 7 días",
    };
  if (p === "mes")
    return {
      clave: "mes",
      desde: `${hoy.slice(0, 8)}01`,
      hasta: hoy,
      etiqueta: "Este mes",
    };
  return {
    clave: "30d",
    desde: sumarDias(hoy, -29),
    hasta: hoy,
    etiqueta: "Últimos 30 días",
    aviso:
      p === "rango"
        ? "El rango debe contener fechas válidas, ordenadas y un máximo de 400 días. Se muestran los últimos 30 días."
        : undefined,
  };
}
