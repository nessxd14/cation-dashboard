import "server-only";
import { crearClienteServidor } from "./supabase/server";
import { traducirErrorDatos } from "./datos";
import type { Filtros } from "./filtros";
import type {
  EstadoRetail,
  ExpedienteRetail,
  ListaRetail,
  TipoRetail,
} from "./retail";

export async function obtenerListaRetail(
  desde: string,
  hasta: string,
  filtros: Filtros,
  tipo: TipoRetail,
  estado: EstadoRetail,
  pagina: number,
): Promise<ListaRetail> {
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("dash_retail_lista", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
    p_tipo: tipo,
    p_estado: estado,
    p_pagina: pagina,
  });
  if (error) throw traducirErrorDatos(error);
  return data as ListaRetail;
}
export async function obtenerExpedienteRetail(
  venta: string,
): Promise<ExpedienteRetail | null> {
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("dash_retail_expediente", {
    p_venta: venta,
  });
  if (error?.code === "P0002") return null;
  if (error) throw traducirErrorDatos(error);
  return data as ExpedienteRetail;
}
