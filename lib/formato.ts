const ZONA = "America/La_Paz";

/** 393569.4 → "393.569" (miles con punto, sin decimales). */
export function entero(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "−" : "") + s;
}

/** 393569.4 → "Bs 393.569" */
export function bs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `Bs ${entero(n)}`;
}

/** 1018.4 → "+Bs 1.018,40" (con signo y centavos, para diferencias de caja). */
export function bsConSigno(n: number): string {
  const abs = Math.abs(n);
  const [ent, dec] = abs.toFixed(2).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}Bs ${miles},${dec}`;
}

/** 0.6612 → "66%" */
export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Variación porcentual contra el período anterior; null si no hay base. */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** "2026-10-05" → "05/10" */
export function diaMes(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** "2026-10-12" → "lunes 12/10" */
export function diaLargo(iso: string): string {
  const fecha = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const dia = new Intl.DateTimeFormat("es-BO", { weekday: "long", timeZone: ZONA }).format(fecha);
  return `${dia} ${diaMes(iso)}`;
}

/** Hora actual en La Paz, "11:26". */
export function horaLaPaz(): string {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  }).format(new Date());
}

/** Fecha de hoy en La Paz como "YYYY-MM-DD". */
export function hoyLaPaz(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

const NOMBRES: Record<string, string> = {
  MAYOR: "Mayor",
  INSTITUCIONAL: "Institucional",
  MUNICIPAL: "Municipal",
  CORPORATIVO: "Corporativo",
  MOSTRADOR: "Mostrador",
  VTD: "VTD",
  EFECTIVO: "Efectivo",
  QR: "QR",
  TRANSFERENCIA: "Transferencia",
  DEPOSITO: "Depósito",
  SIGEP: "SIGEP",
  CHEQUE: "Cheque",
  DESPACHO_PEDIDO: "Despacho de pedidos",
  VENTA_RETAIL: "Venta retail",
  AJUSTE: "Ajustes",
  OTRO: "Sin enlace (Otro)",
  REPOSICION_TIENDA: "Reposición a Tienda (interno)",
  PENDIENTE: "Pendiente",
  REPUESTO: "Repuesto",
  CONDONADO: "Condonado",
  ABIERTA: "Abierto",
  CERRADA: "Cerrado",
  EN_REVISION: "En revisión",
};

/** Nombre legible de un código de la base. */
export function nombre(codigo: string): string {
  return NOMBRES[codigo] ?? codigo.charAt(0) + codigo.slice(1).toLowerCase();
}

/** "GOBIERNO AUTONOMO MUNICIPAL DE REYES" → "Gobierno Autonomo Municipal De Reyes", siglas intactas. */
export function titulo(texto: string): string {
  return texto
    .split(" ")
    .map((p) => (p.length <= 4 && p === p.toUpperCase() ? p : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(" ");
}
