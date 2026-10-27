"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "@/lib/operativo";
import { fechaValida } from "@/lib/periodo";
export type EstadoConfiguracion = { error: string | null; ok: boolean };

function numero(form: FormData, clave: string): number | null {
  const valor = form.get(clave);
  if (typeof valor !== "string" || !/^\d+(\.\d{1,6})?$/.test(valor))
    return null;
  const n = Number(valor);
  return Number.isFinite(n) && n <= 1e12 ? n : null;
}
export async function guardarMeta(
  _prev: EstadoConfiguracion,
  form: FormData,
): Promise<EstadoConfiguracion> {
  const mes = String(form.get("mes") ?? ""),
    sucursal = String(form.get("sucursal") ?? "");
  const ventas = numero(form, "ventas"),
    cobranza = numero(form, "cobranza");
  if (
    !fechaValida(mes) ||
    !mes.endsWith("-01") ||
    ventas === null ||
    cobranza === null ||
    (sucursal && !/^[1-9]\d{0,14}$/.test(sucursal))
  )
    return {
      error: "Revisa el mes y los objetivos. Usa montos positivos o cero.",
      ok: false,
    };
  try {
    await rpc("dash_guardar_meta", {
      p_mes: mes,
      p_sucursal: sucursal,
      p_ventas: ventas,
      p_cobranza: cobranza,
    });
  } catch {
    return {
      error:
        "No se pudo guardar la meta. Comprueba tu acceso e inténtalo de nuevo.",
      ok: false,
    };
  }
  revalidatePath("/metas");
  return { error: null, ok: true };
}
export async function guardarCosto(
  _prev: EstadoConfiguracion,
  form: FormData,
): Promise<EstadoConfiguracion> {
  const producto = String(form.get("producto") ?? ""),
    desde = String(form.get("desde") ?? ""),
    nota = String(form.get("nota") ?? "").trim(),
    costo = numero(form, "costo");
  if (
    !/^[1-9]\d{0,14}$/.test(producto) ||
    !fechaValida(desde) ||
    costo === null ||
    costo <= 0 ||
    nota.length > 500
  )
    return {
      error:
        "Selecciona un producto, fecha válida y costo por unidad base mayor a cero.",
      ok: false,
    };
  try {
    await rpc("dash_guardar_costo", {
      p_producto: producto,
      p_desde: desde,
      p_costo: costo,
      p_nota: nota,
    });
  } catch {
    return {
      error:
        "No se pudo guardar el costo. Comprueba tu acceso e inténtalo de nuevo.",
      ok: false,
    };
  }
  revalidatePath("/margen");
  return { error: null, ok: true };
}
