import { bs, entero, variacion } from "@/lib/formato";
import Link from "next/link";

/** Tarjeta de cifra principal. */
export function Kpi({
  nombre,
  color,
  valor,
  nota,
  actual,
  anterior,
  etiqueta,
  href,
}: {
  nombre: string;
  color: string;
  valor: string;
  nota: React.ReactNode;
  actual?: number;
  anterior?: number;
  etiqueta?: React.ReactNode;
  href?: string;
}) {
  const v =
    actual !== undefined && anterior !== undefined
      ? variacion(actual, anterior)
      : null;
  return (
    <div className="vidrio kpi">
      <div className="kpi-cabeza">
        <span className="kpi-nombre">
          <span
            aria-hidden="true"
            className="punto"
            style={{ background: color, boxShadow: `0 0 12px ${color}` }}
          />
          {nombre}
        </span>
        {etiqueta}
      </div>
      <div className="mono kpi-valor">{valor}</div>
      <div className="kpi-nota">
        {nota}
        {v !== null ? (
          <>
            {" · "}
            <span className={v >= 0 ? "delta-sube" : "delta-baja"}>
              {v >= 0 ? "▲" : "▼"} {entero(Math.abs(v))}% vs. período anterior
            </span>
          </>
        ) : null}
      </div>
      {href ? (
        <Link href={href} className="kpi-detalle">
          Ver detalle →
        </Link>
      ) : null}
    </div>
  );
}

/** Lista de barras horizontales (canales, medios de pago). */
export function ListaBarras({
  filas,
  color,
}: {
  filas: { nombre: string; valor: number; color?: string }[];
  color: string;
}) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  if (filas.length === 0)
    return (
      <p className="apagado" style={{ margin: 0, fontSize: 13 }}>
        Sin movimientos en el período.
      </p>
    );
  return (
    <>
      {filas.map((f) => {
        const c = f.color ?? color;
        return (
          <div key={f.nombre} className="barra-item">
            <div className="barra-cabeza">
              <span className="fila-nombre">{f.nombre}</span>
              <span className="mono">{bs(f.valor)}</span>
            </div>
            <div className="barra-pista">
              <div
                className="barra"
                style={{
                  width: `${Math.max(1, Math.round((f.valor / max) * 100))}%`,
                  background: c,
                  boxShadow: `0 0 12px ${c}66`,
                }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Panel de vidrio con título. */
export function Panel({
  titulo,
  sub,
  accion,
  id,
  className = "",
  children,
}: {
  titulo: string;
  sub?: string;
  accion?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className={`vidrio panel ${className}`}
    >
      <div className="panel-cabeza">
        <div>
          <h2>{titulo}</h2>
          {sub ? <div className="panel-sub">{sub}</div> : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}
