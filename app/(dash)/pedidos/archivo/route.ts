import { NextRequest, NextResponse } from "next/server";
import { tieneAcceso, usuarioActual } from "@/lib/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { idWholesale } from "@/lib/wholesale";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (!(await usuarioActual()) || !(await tieneAcceso()))
    return new NextResponse("Sin acceso", { status: 403, headers });
  const q = req.nextUrl.searchParams,
    pedido = idWholesale(q.get("pedido")),
    tipo = q.get("tipo"),
    id = q.get("id"),
    indice = q.get("indice") ?? "0";
  if (
    !pedido ||
    !tipo ||
    !["operacion", "pago", "clip"].includes(tipo) ||
    !id ||
    id.length > 40 ||
    !/^\d$/.test(indice)
  )
    return new NextResponse("Referencia inválida", { status: 400, headers });
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("dash_wholesale_archivo", {
    p_pedido: pedido,
    p_tipo: tipo,
    p_id: id,
    p_indice: Number(indice),
  });
  if (
    error ||
    !data ||
    typeof data.bucket !== "string" ||
    typeof data.ruta !== "string"
  )
    return new NextResponse("Archivo no disponible", {
      status: error ? 503 : 404,
      headers,
    });
  const { data: archivo, error: fallo } = await db.storage
    .from(data.bucket)
    .createSignedUrl(data.ruta, 300);
  if (fallo || !archivo)
    return new NextResponse("No se pudo abrir el archivo", {
      status: 503,
      headers,
    });
  return NextResponse.redirect(archivo.signedUrl, { status: 307, headers });
}
