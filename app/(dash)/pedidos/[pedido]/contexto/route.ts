import { NextResponse } from "next/server";
import { usuarioActual, tieneAcceso } from "@/lib/datos";
import { obtenerExpedienteWholesale } from "@/lib/wholesale-servidor";
import { comandoOpenClaw, idWholesale } from "@/lib/wholesale";

export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (!(await usuarioActual()) || !(await tieneAcceso()))
    return new NextResponse("Sin acceso", { status: 403, headers });
  const id = idWholesale((await params).pedido);
  if (!id) return new NextResponse("Pedido inválido", { status: 400, headers });
  const d = await obtenerExpedienteWholesale(id);
  return new NextResponse(comandoOpenClaw(d), {
    headers: {
      ...headers,
      "Content-Disposition": `attachment; filename="openclaw-pedido-${id}.txt"`,
    },
  });
}
