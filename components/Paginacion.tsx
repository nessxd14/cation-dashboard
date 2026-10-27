import Link from "next/link";
import { enlace, type Parametros } from "@/lib/filtros";

export function Paginacion({
  total,
  pagina,
  ruta,
  params,
  extras = {},
  limite = 50,
}: {
  total: number;
  pagina: number;
  ruta: string;
  params: Parametros;
  extras?: Record<string, string>;
  limite?: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / limite));
  return (
    <nav aria-label="Paginación" className="paginacion">
      <span>
        {total === 0
          ? "Sin registros"
          : `${(pagina - 1) * limite + 1}–${Math.min(pagina * limite, total)} de ${total}`}
      </span>
      <div>
        {pagina > 1 ? (
          <Link
            href={enlace(ruta, params, {
              ...extras,
              pagina: String(pagina - 1),
            })}
          >
            ← Anterior
          </Link>
        ) : null}
        <span>
          Página {pagina} de {paginas}
        </span>
        {pagina < paginas ? (
          <Link
            href={enlace(ruta, params, {
              ...extras,
              pagina: String(pagina + 1),
            })}
          >
            Siguiente →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
