import { Periodos } from "./Periodos";
import { Herramientas } from "./Herramientas";
import { leerPeriodo } from "@/lib/periodo";
import type { Parametros } from "@/lib/filtros";

export async function Cabecera({
  titulo,
  sub,
  ruta,
  params,
  tipos,
}: {
  titulo: string;
  sub: string;
  ruta: string;
  params: Parametros;
  tipos: string[];
}) {
  return (
    <>
      <header className="encabezado">
        <div>
          <h1>{titulo}</h1>
          <p className="subtitulo">{sub}</p>
        </div>
        <Periodos periodo={leerPeriodo(params)} ruta={ruta} params={params} />
      </header>
      <Herramientas actualizado={new Date().toISOString()} tipos={tipos} />
    </>
  );
}
