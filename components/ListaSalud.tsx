import { bs, entero } from "@/lib/formato";
import type { IndicadorSalud } from "@/lib/tipos";
import Link from "next/link";

export function ListaSalud({ indicadores }: { indicadores: IndicadorSalud[] }) {
  return (
    <div>
      {indicadores.map((s) => (
        <div
          key={s.clave}
          className="fila"
          style={{ alignItems: "flex-start" }}
        >
          <span aria-hidden="true" className={`salud-punto nivel-${s.nivel}`} />
          <span style={{ flex: 1 }}>
            <Link
              href={`/detalle?tipo=alertas&alerta=${encodeURIComponent(s.clave)}`}
            >
              {s.titulo}
            </Link>
            <span className="fila-sub">{s.detalle}</span>
          </span>
          <span className="mono" style={{ whiteSpace: "nowrap" }}>
            <span className="visually-hidden">
              {s.nivel === "ok"
                ? "Bien: "
                : s.nivel === "alto"
                  ? "Grave: "
                  : "Revisar: "}
            </span>
            {s.unidad === "Bs" ? bs(s.valor) : entero(s.valor)}
          </span>
        </div>
      ))}
    </div>
  );
}
