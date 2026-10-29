import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "./supabase/server";
import type {
  Almacen,
  Finanzas,
  IndicadorSalud,
  Resumen,
  Ventas,
} from "./tipos";
import type { Filtros } from "./filtros";

/** Error con un mensaje que se puede mostrar tal cual en pantalla. */
export class ErrorDatos extends Error {
  constructor(
    message: string,
    public tipo: "sin_acceso" | "sin_migracion" | "tiempo_agotado" | "otro",
  ) {
    super(message);
  }
}

export function traducirErrorDatos(error: {
  code?: string;
  message: string;
}): ErrorDatos {
  if (error.code === "57014" || /statement timeout/i.test(error.message)) {
    return new ErrorDatos(
      "La consulta tardó más de lo permitido. Vuelve a intentarlo o selecciona un período más corto.",
      "tiempo_agotado",
    );
  }
  if (error.code === "42501") {
    return new ErrorDatos(
      "Tu cuenta no tiene acceso al dashboard.",
      "sin_acceso",
    );
  }
  // PGRST202: la función no existe en el schema cache → la migración no está aplicada.
  if (
    error.code === "PGRST202" ||
    /could not find the function/i.test(error.message)
  ) {
    return new ErrorDatos(
      "Falta aplicar una migración del dashboard en la base (carpeta supabase/migrations).",
      "sin_migracion",
    );
  }
  console.error("Dashboard: error de consulta", error.code, error.message);
  return new ErrorDatos(
    "No se pudo completar la consulta. Inténtalo de nuevo.",
    "otro",
  );
}

/** ¿El usuario actual puede ver el dashboard? (Ness y el gerente). */
export const tieneAcceso = cache(async (): Promise<boolean> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("dash_acceso");
  if (error) throw traducirErrorDatos(error);
  return data === true;
});

export const usuarioActual = cache(async () => {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function obtenerResumen(
  desde: string,
  hasta: string,
  filtros: Filtros = {},
): Promise<Resumen> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("dash_resumen", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
  });
  if (error) throw traducirErrorDatos(error);
  return data as Resumen;
}

export async function obtenerVentas(
  desde: string,
  hasta: string,
  filtros: Filtros = {},
): Promise<Ventas> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("dash_ventas", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
  });
  if (error) throw traducirErrorDatos(error);
  return data as Ventas;
}

export async function obtenerAlmacen(
  desde: string,
  hasta: string,
  filtros: Filtros = {},
): Promise<Almacen> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("dash_almacen", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
  });
  if (error) throw traducirErrorDatos(error);
  return data as Almacen;
}

export async function obtenerFinanzas(
  desde: string,
  hasta: string,
  filtros: Filtros = {},
): Promise<Finanzas> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("dash_finanzas", {
    p_desde: desde,
    p_hasta: hasta,
    p_filtros: filtros,
  });
  if (error) throw traducirErrorDatos(error);
  return data as Finanzas;
}

export const obtenerSalud = cache(async (): Promise<IndicadorSalud[]> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("dash_salud");
  if (error) throw traducirErrorDatos(error);
  return (data ?? []) as IndicadorSalud[];
});
