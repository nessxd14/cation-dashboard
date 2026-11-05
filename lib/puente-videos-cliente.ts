"use client";
import { accesoPuente } from "@/app/(dash)/videos/acciones";
import {
  PUENTE_LOCAL,
  esEquipoVideo,
  esClaveVideo,
  type IdentidadPuente,
} from "./videos-locales";
export type ConexionLocal = {
  identidad: IdentidadPuente;
  ticket: string;
  expira: number;
};
async function consultaLocal<T>(
  ruta: string,
  init: RequestInit = {},
): Promise<T> {
  if (!ruta.startsWith("/v1/")) throw new Error("Ruta local inválida.");
  let r: Response;
  try {
    r = await fetch(PUENTE_LOCAL + ruta, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      targetAddressSpace: "loopback",
    } as RequestInit);
  } catch {
    throw new Error(
      "No se pudo conectar con los videos de esta PC. Inicia CATION Videos y permite el acceso local si el navegador lo solicita.",
    );
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok)
    throw new Error(
      typeof datos?.error === "string"
        ? datos.error
        : "No se pudo leer el servicio de esta PC.",
    );
  return datos as T;
}
export async function identidadLocal(): Promise<IdentidadPuente> {
  const i = await consultaLocal<IdentidadPuente>("/v1/identidad");
  if (
    !i ||
    i.version !== 1 ||
    !esEquipoVideo(i.id) ||
    !esClaveVideo(i.reto) ||
    typeof i.nombre !== "string"
  )
    throw new Error(
      "El servicio local no es compatible. Actualiza CATION Videos.",
    );
  return i;
}
export async function conectarPuente(): Promise<ConexionLocal> {
  const identidad = await identidadLocal(),
    r = await accesoPuente(identidad.id, identidad.reto);
  if (!r.ok) throw new Error(r.error);
  return { identidad, ...r.datos };
}
export async function consultarPuente<T>(
  c: ConexionLocal,
  ruta: string,
  datos?: unknown,
): Promise<T> {
  if (c.expira * 1000 < Date.now() + 10000) {
    const r = await accesoPuente(c.identidad.id, c.identidad.reto);
    if (!r.ok) throw new Error(r.error);
    c.ticket = r.datos.ticket;
    c.expira = r.datos.expira;
  }
  return consultaLocal<T>(ruta, {
    method: datos === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${c.ticket}`,
      ...(datos === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(datos === undefined ? {} : { body: JSON.stringify(datos) }),
  });
}
export async function permisoLocalConcedido(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.permissions) return false;
  for (const name of ["loopback-network", "local-network-access"]) {
    try {
      if (
        (await navigator.permissions.query({ name } as PermissionDescriptor))
          .state === "granted"
      )
        return true;
    } catch {}
  }
  return false;
}
export async function reproducirLocal(
  c: ConexionLocal,
  clave: string,
): Promise<{ url: string; reproducible: boolean }> {
  if (!esClaveVideo(clave)) throw new Error("Referencia inválida.");
  const r = await consultarPuente<{ ruta: string; reproducible: boolean }>(
    c,
    "/v1/reproduccion",
    { clave },
  );
  if (!new RegExp(`^/v1/media/${clave}\\?ticket=[a-f0-9]{64}$`).test(r.ruta))
    throw new Error("El enlace local no es válido.");
  return { url: PUENTE_LOCAL + r.ruta, reproducible: r.reproducible };
}
