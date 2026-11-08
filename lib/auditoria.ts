import type { Parametros } from "./filtros";
import { enlaceOrigen } from "./enlaces";
import { enlaceRetail } from "./retail";
import { enlaceWholesale, type Etapa } from "./wholesale";

export const AREAS_AUDITORIA = [
  "Cobranza",
  "Caja",
  "Almacén",
  "Pedidos",
  "Datos",
] as const;
export type AreaAuditoria = (typeof AREAS_AUDITORIA)[number];
export type VistaAuditoria = "pendientes" | "eventos";
export const LIMITE_AUDITORIA = 25;

export type FilaAuditoria = {
  id: string;
  area: AreaAuditoria;
  caso: string;
  motivo: string;
  fecha: string | null;
  responsable: string | null;
  origen:
    | "CUENTA"
    | "RETAIL"
    | "TRASLADO"
    | "PEDIDO"
    | "PEDIDO_ALMACEN"
    | "ALISTADO"
    | "VERIFICACION"
    | "SALIDA"
    | "PAGO"
    | "DATOS";
  referencia_id: string | null;
  monto: number | null;
};

export type Auditoria = { total: number; filas: FilaAuditoria[] };

export function enlaceAuditoria(
  params: Parametros,
  cambios: Record<string, string> = {},
) {
  const q = new URLSearchParams();
  for (const clave of ["vista", "p", "desde", "hasta", "area", "pagina"]) {
    if (typeof params[clave] === "string") q.set(clave, params[clave]);
  }
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor) q.set(clave, valor);
    else q.delete(clave);
  }
  return `/auditoria${q.size ? `?${q}` : ""}`;
}

const ETAPAS_ORIGEN: Partial<Record<FilaAuditoria["origen"], Etapa>> = {
  PEDIDO: "pedido",
  ALISTADO: "alistado",
  VERIFICACION: "verificacion",
  SALIDA: "salida",
  PAGO: "pago",
};

export function accionAuditoria(fila: FilaAuditoria, vista: VistaAuditoria) {
  const id = fila.referencia_id;
  if (fila.origen === "DATOS")
    return {
      href: "/detalle?tipo=alertas&alerta=salidas_sin_enlace",
      texto: "Ver alerta",
    };
  if (!id || !/^[1-9]\d{0,14}$/.test(id)) return null;
  const etapa = ETAPAS_ORIGEN[fila.origen];
  if (etapa)
    return {
      href: enlaceWholesale({}, { pedido: id, etapa, vista: "pagina" }),
      texto: etapa === "pago" ? "Ver cobro" : "Ver expediente",
    };
  if (fila.origen === "RETAIL")
    return {
      href: enlaceRetail({}, { venta: id }),
      texto: vista === "pendientes" ? "Ver cobro" : "Ver venta",
    };
  if (fila.origen === "CUENTA")
    return {
      href:
        enlaceOrigen("CUENTA", id)?.href ??
        `/detalle?tipo=cartera&cliente=${id}`,
      texto: "Ver cuenta",
    };
  if (fila.origen === "PEDIDO_ALMACEN" || fila.origen === "TRASLADO") {
    const traslado = fila.origen === "TRASLADO";
    const destino = enlaceOrigen(traslado ? "TRASLADO" : "PEDIDO", id);
    return (
      destino && {
        href: destino.href,
        texto: traslado ? "Ver traslado" : "Ver pedido",
      }
    );
  }
  return null;
}
