import { NextResponse, type NextRequest } from "next/server";
import { tieneAcceso, usuarioActual } from "@/lib/datos";
import { construirReporte } from "@/lib/reportes";
import { crearExcel, crearPDF } from "@/lib/exportar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    if (!(await usuarioActual()) || !(await tieneAcceso()))
      return NextResponse.json(
        { error: "Sin acceso" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    const params = Object.fromEntries(request.nextUrl.searchParams.entries()),
      formato = params.formato;
    if (!["xlsx", "pdf"].includes(formato))
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
    const reporte = await construirReporte(params);
    const bytes =
      formato === "xlsx" ? await crearExcel(reporte) : await crearPDF(reporte);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type":
          formato === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="${reporte.archivo}.${formato}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Exportación del dashboard:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        error:
          "No se pudo generar el reporte. Reduce el rango o vuelve a intentarlo.",
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
