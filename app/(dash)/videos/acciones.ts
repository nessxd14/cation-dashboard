"use server";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  codigoEquipoVideo,
  esClaveVideo,
  esEquipoVideo,
  fechaGrabacionBolivia,
} from "@/lib/videos-locales";
import { idWholesale } from "@/lib/wholesale";
type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };
export async function registrarPuente(
  codigo: string,
  nombre: string,
): Promise<Resultado<{ id: string; nombre: string }>> {
  const c = codigoEquipoVideo(codigo);
  if (!c || typeof nombre !== "string" || !nombre.trim() || nombre.length > 100)
    return { ok: false, error: "Revisa el código y el nombre del equipo." };
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("dash_video_registrar_equipo", {
    p_id: c.id,
    p_clave: c.clave,
    p_nombre: nombre.trim(),
  });
  return error
    ? {
        ok: false,
        error:
          "No se pudo vincular el equipo. Comprueba tu acceso y el código de configuración local.",
      }
    : { ok: true, datos: data };
}
export async function accesoPuente(
  equipo: string,
  reto: string,
): Promise<Resultado<{ ticket: string; expira: number }>> {
  if (!esEquipoVideo(equipo) || !esClaveVideo(reto))
    return {
      ok: false,
      error: "La respuesta del servicio local no es válida.",
    };
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("dash_video_acceso", {
    p_equipo: equipo,
    p_reto: reto,
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === "P0002"
          ? "Primero vincula esta PC en Videos locales."
          : "No se pudo autorizar el acceso a videos. Comprueba tu sesión del Dashboard.",
    };
  return { ok: true, datos: data };
}
export async function vincularVideoLocal(datos: {
  pedido: string;
  preparacion: string;
  archivo: string;
  nombre: string;
  bytes: number;
  camara: string;
  inicio: string;
  fin: string;
}): Promise<Resultado<{ id: string }>> {
  if (
    !datos ||
    !idWholesale(datos.pedido) ||
    !idWholesale(datos.preparacion) ||
    !esClaveVideo(datos.archivo) ||
    typeof datos.nombre !== "string" ||
    !datos.nombre ||
    datos.nombre.length > 255 ||
    /[/\\]/.test(datos.nombre) ||
    !Number.isSafeInteger(datos.bytes) ||
    datos.bytes <= 0 ||
    typeof datos.camara !== "string" ||
    !datos.camara.trim() ||
    datos.camara.length > 160
  )
    return {
      ok: false,
      error: "Revisa el archivo, la cámara y la preparación.",
    };
  const inicio = datos.inicio ? fechaGrabacionBolivia(datos.inicio) : null,
    fin = datos.fin ? fechaGrabacionBolivia(datos.fin) : null;
  if ((datos.inicio || datos.fin) && (!inicio || !fin || fin <= inicio))
    return {
      ok: false,
      error:
        "Indica inicio y fin válidos de la grabación, en hora de Bolivia, o deja ambos vacíos.",
    };
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("dash_vincular_video_local", {
    p_pedido: datos.pedido,
    p_preparacion: datos.preparacion,
    p_archivo: datos.archivo,
    p_nombre: datos.nombre,
    p_bytes: datos.bytes,
    p_camara: datos.camara.trim(),
    p_inicio: inicio,
    p_fin: fin,
  });
  if (error)
    return {
      ok: false,
      error:
        "No se pudo vincular el video. Comprueba tu acceso y la preparación del pedido.",
    };
  revalidatePath("/pedidos");
  return { ok: true, datos: { id: data } };
}
export async function desvincularVideoLocal(
  id: string,
): Promise<Resultado<null>> {
  if (!esEquipoVideo(id))
    return { ok: false, error: "Referencia de video inválida." };
  const db = await crearClienteServidor();
  const { error } = await db.rpc("dash_desvincular_video_local", {
    p_video: id,
  });
  if (error)
    return { ok: false, error: "No se pudo quitar la referencia del video." };
  revalidatePath("/pedidos");
  return { ok: true, datos: null };
}
