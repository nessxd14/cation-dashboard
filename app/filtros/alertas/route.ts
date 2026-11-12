import { ErrorDatos, obtenerSalud } from "@/lib/datos";

const headers = { "Cache-Control": "private, no-store" };

/** Cantidad de alertas de "Salud de datos" para la insignia del menú. */
export async function GET() {
  try {
    const alertas = (await obtenerSalud()).filter((i) => i.nivel !== "ok")
      .length;
    return Response.json({ alertas }, { headers });
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
