import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "./supabase/server";
import { ErrorDatos } from "./datos";
import type { Catalogos, Filtros } from "./filtros";
import type { Auditoria, AreaAuditoria, VistaAuditoria } from "./auditoria";

export type FilaDetalle = {
  id: string;
  fecha: string | null;
  documento: string;
  cliente: string;
  concepto: string;
  cantidad: number | null;
  monto: number | null;
  origen: string;
  referencia_id: string | null;
  producto_id: string | null;
};
export type Detalle = { total: number; monto: number; filas: FilaDetalle[] };
export type ActividadDiaria = {
  id: string;
  tipo: "pedidos" | "vtd" | "traslados";
  documento: string;
  referencia_id: string;
  fecha: string;
  evento: string;
  tono: "verde" | "azul" | "ambar" | "rojo";
  etapa: "pedido" | "alistado" | "verificacion" | "salida" | null;
};
export type PagoCuenta = {
  id: string;
  medio: string;
  estado: string;
  monto: number;
  aplicado: number;
  sin_asignar: number | null;
  devuelto: number;
  creado_en: string;
  registrado_por: string | null;
  confirmado_en: string | null;
  confirmado_por: string | null;
};
export type CuentaCobranza = {
  id: string;
  nombre: string;
  saldo: number | null;
  en_revision: number | null;
  pagos: PagoCuenta[];
};
export type ProductoInventario = {
  id: string;
  producto: string;
  unidad: string;
  minimo: number;
  reorden: number;
  fisico: number;
  disponible: number;
  reservado_global: number;
  transito: number;
  cobertura_dias: number | null;
  estado: string;
  ubicaciones: { sucursal: string; ubicacion: string; cantidad: number }[];
};
export type Inventario = {
  total: number;
  sin_stock: number;
  bajo_minimo: number;
  riesgo: number;
  filas: ProductoInventario[];
};
export type Margen = {
  vendido: number;
  con_costo: number;
  costo: number | null;
  utilidad: number | null;
  lineas_sin_costo: number;
  grupos: {
    dimension: string;
    nombre: string;
    vendido: number;
    con_costo: number | null;
    costo: number | null;
  }[];
  costos: {
    producto_id: string;
    producto: string;
    unidad: string;
    desde: string;
    costo_base: number;
    nota: string;
  }[];
};
export type Cobranza = {
  clientes: {
    id: string;
    cliente: string;
    saldo: number;
    vencido: number;
    dias_vencido: number | null;
    ultimo_pago: string | null;
    sin_partida: number;
    por_verificar: number;
    prioridad: string;
  }[];
};
export type Metas = {
  mes: string;
  hasta: string;
  hoy: string;
  ventas: number;
  cobranza: number;
  meta: { ventas: number; cobranza: number } | null;
};

export async function rpc<T>(
  nombre: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc(nombre, args);
  if (error) {
    if (error.code === "42501")
      throw new ErrorDatos(
        "Tu cuenta no tiene acceso al dashboard.",
        "sin_acceso",
      );
    if (error.code === "PGRST202")
      throw new ErrorDatos(
        "Falta aplicar la migración del dashboard operativo.",
        "sin_migracion",
      );
    console.error(`Dashboard ${nombre}:`, error.code, error.message);
    throw new ErrorDatos(
      "No se pudo completar la consulta. Revisa los filtros e inténtalo de nuevo.",
      "otro",
    );
  }
  return data as T;
}

export const obtenerCatalogos = cache(() => rpc<Catalogos>("dash_catalogos"));
export const obtenerActividadDia = (fecha: string) =>
  rpc<ActividadDiaria[]>("dash_actividad_dia", { p_fecha: fecha });
export const obtenerCuentaCobranza = (cliente: string) =>
  rpc<CuentaCobranza | null>("dash_cuenta_cobranza", { p_cliente: cliente });
export const obtenerAuditoria = (
  vista: VistaAuditoria,
  desde: string,
  hasta: string,
  area: AreaAuditoria | "",
  pagina: number,
) =>
  rpc<Auditoria>("dash_auditoria", {
    p_vista: vista,
    p_desde: vista === "eventos" ? desde : null,
    p_hasta: vista === "eventos" ? hasta : null,
    p_area: area,
    p_pagina: pagina,
  });
export const obtenerDetalle = (
  tipo: string,
  desde: string,
  hasta: string,
  filtros: Filtros,
  pagina = 1,
  limite = 50,
) =>
  rpc<Detalle>("dash_detalle", {
    p_tipo: tipo,
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
    p_pagina: pagina,
    p_limite: limite,
  });
export const obtenerInventario = (filtros: Filtros, pagina = 1, limite = 50) =>
  rpc<Inventario>("dash_inventario", {
    p_filtros: filtros,
    p_pagina: pagina,
    p_limite: limite,
  });
export const obtenerMargen = (desde: string, hasta: string, filtros: Filtros) =>
  rpc<Margen>("dash_margen", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
  });
export const obtenerCobranza = (filtros: Filtros) =>
  rpc<Cobranza>("dash_cobranza", { p_filtros: filtros });
export const obtenerMetas = (mes: string, sucursal = "") =>
  rpc<Metas>("dash_metas", { p_mes: mes, p_sucursal: sucursal });

export function paginaValida(valor: unknown): number {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 && n <= 100000 ? n : 1;
}
