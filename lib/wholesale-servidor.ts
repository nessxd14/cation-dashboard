import "server-only";
import { rpc } from "./operativo";
import type { Filtros } from "./filtros";
import type {
  ExpedienteWholesale,
  OrdenWholesale,
  PedidoWholesale,
} from "./wholesale";
import type { VideoLocal } from "./videos-locales";

export const obtenerPedidosWholesale = (
  desde: string,
  hasta: string,
  filtros: Filtros,
  buscar: string,
  pagina: number,
  orden: OrdenWholesale = "actividad",
) =>
  rpc<{ total: number; filas: PedidoWholesale[] }>("dash_wholesale_lista", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: orden === "creacion" ? { ...filtros, orden } : filtros,
    p_buscar: buscar,
    p_pagina: pagina,
  });
export const obtenerExpedienteWholesale = async (
  pedido: string,
  antes: string | null = null,
) => {
  const [expediente, videos] = await Promise.all([
    rpc<ExpedienteWholesale>("dash_wholesale_expediente", {
      p_pedido: pedido,
      p_antes: antes,
    }),
    rpc<VideoLocal[]>("dash_videos_locales", { p_pedido: pedido }),
  ]);
  return { ...expediente, videos_locales: videos };
};
