import { consultaComun, type Parametros } from "./filtros";

export const TIPOS_RETAIL = ["TODAS", "VTD", "VTA"] as const;
export type TipoRetail = (typeof TIPOS_RETAIL)[number];
export const ESTADOS_RETAIL = {
  todos: "Todos los estados",
  entrega: "Entrega pendiente",
  cobro: "Saldo pendiente",
  revision: "Pago en revisión",
  retorno: "Retorno pendiente",
  anulados: "Anulados",
} as const;
export type EstadoRetail = keyof typeof ESTADOS_RETAIL;
export function tipoRetail(valor: unknown): TipoRetail {
  return TIPOS_RETAIL.includes(valor as TipoRetail)
    ? (valor as TipoRetail)
    : "TODAS";
}
export function estadoRetail(valor: unknown): EstadoRetail {
  return typeof valor === "string" && Object.hasOwn(ESTADOS_RETAIL, valor)
    ? (valor as EstadoRetail)
    : "todos";
}
export function idRetail(valor: unknown): string | null {
  return typeof valor === "string" && /^[1-9]\d{0,14}$/.test(valor)
    ? valor
    : null;
}
export function enlaceRetail(
  params: Parametros,
  extras: Record<string, string> = {},
): string {
  const q = consultaComun(params);
  q.set("retail_tipo", tipoRetail(params.retail_tipo));
  q.set("retail_estado", estadoRetail(params.retail_estado));
  if (typeof params.pagina === "string") q.set("pagina", params.pagina);
  for (const [k, v] of Object.entries(extras)) v ? q.set(k, v) : q.delete(k);
  return `/retail?${q}${q.has("venta") ? "#documento-retail" : ""}`;
}
export function dineroRetail(valor: number): string {
  return `Bs ${new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)}`;
}
export function fechaRetail(valor: string | null): string {
  if (!valor || !Number.isFinite(Date.parse(valor))) return "Sin registro";
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(valor));
}
export type DocumentoRetail = {
  id: string;
  numero: string;
  tipo: "VTD" | "VTA";
  estado: string;
  cliente: string;
  sucursal: string;
  vendedor: string;
  creado_en: string;
  completado_en: string | null;
  total: number;
  anulada: boolean;
  cobrado: number;
  en_revision: number;
  rechazado: number;
  saldo_favor: number;
  pendiente: number;
  pago_posterior: boolean;
  entrega_estado: string | null;
  entrega: string;
  entrega_pendiente: boolean;
  retorno_pendiente: boolean;
  operacion_id: string | null;
  modo: string;
};
export type ListaRetail = {
  total: number;
  tipos: Record<TipoRetail, number>;
  filas: DocumentoRetail[];
  resumen: {
    vigentes: number;
    importe: number;
    cobrado: number;
    en_revision: number;
    saldo_favor: number;
    pendiente: number;
    por_cobrar: number;
    entregas: number;
    retornos: number;
    posteriores: number;
    anulados: number;
  };
};
export type ExpedienteRetail = DocumentoRetail & {
  subtotal: number;
  descuento: number;
  notas: string | null;
  pago_posterior_motivo: string | null;
  pago_posterior_en: string | null;
  cajero: string | null;
  lineas: {
    id: string;
    producto_id: string | null;
    descripcion: string;
    presentacion: string | null;
    cantidad: number;
    cantidad_presentacion: number | null;
    unidad: string | null;
    subtotal: number | null;
    precio_unitario: number;
  }[];
  pagos: {
    id: string;
    metodo: string;
    monto: number;
    estado: string;
    creado_en: string;
    referencia: string | null;
    verificado_en: string | null;
  }[];
  usos_saldo: {
    id: string;
    monto: number;
    creado_en: string;
    anulado_en: string | null;
  }[];
  cobro_conjunto: {
    id: string;
    numero: string;
    total: number;
    creado_en: string;
    documentos: { id: string; numero: string; total: number; estado: string }[];
  } | null;
  eventos: {
    id: string;
    fecha: string;
    accion: string;
    actor: string | null;
    detalle: unknown;
  }[];
};
export function cobroRetail(d: DocumentoRetail): {
  texto: string;
  clase: string;
} {
  if (d.anulada)
    return { texto: "Anulada · ver historial", clase: "rt-neutro" };
  if (d.en_revision > 0)
    return { texto: "Pago en revisión", clase: "rt-aviso" };
  if (d.pendiente > 0)
    return {
      texto: d.pago_posterior
        ? "Pago posterior"
        : d.rechazado > 0
          ? "Pago rechazado"
          : "Por cobrar",
      clase: "rt-aviso",
    };
  return {
    texto: d.saldo_favor > 0 ? "Cubierta · incluye saldo" : "Cobrado",
    clase: "rt-ok",
  };
}
