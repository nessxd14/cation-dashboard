import { ErrorDatos } from "@/lib/datos";
import { obtenerCatalogos } from "@/lib/operativo";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    return Response.json(await obtenerCatalogos(), { headers });
  } catch (error) {
    if (error instanceof ErrorDatos) {
      return Response.json(
        { mensaje: error.message },
        { headers, status: error.tipo === "sin_acceso" ? 403 : 503 },
      );
    }
    throw error;
  }
}
