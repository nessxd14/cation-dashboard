import { bs, diaMes } from "@/lib/formato";

const ALTO = 210;

export type Tramo = { nombre: string; clase: string; color: string };
export type DiaSerie = { fecha: string; valores: [number, number] };

/** Escala "redonda" para el eje: 100k, 50k, 20k… */
function techo(max: number): number {
  if (max <= 0) return 1000;
  const pasos = [1, 2, 2.5, 5, 10];
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const p of pasos) if (p * mag >= max) return p * mag;
  return 10 * mag;
}

function corto(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`.replace(".0k", "k");
  return String(n);
}

/**
 * Barras apiladas por día con dos tramos: el primero arriba, el segundo en la base.
 * Resumen: pedidos / retail. Almacén: despacho / retail.
 */
export function SerieDiaria({
  titulo,
  dias,
  tramos,
}: {
  titulo: string;
  dias: DiaSerie[];
  tramos: [Tramo, Tramo];
}) {
  const totalDia = (d: DiaSerie) => d.valores[0] + d.valores[1];
  const max = techo(Math.max(0, ...dias.map(totalDia)));
  const marcas = [1, 0.75, 0.5, 0.25, 0].map((f) => corto(max * f));
  const cadaCuanto = dias.length > 45 ? 7 : dias.length > 20 ? 2 : 1;

  // El día que más pesó, para el titular del gráfico.
  const pico = dias.reduce<DiaSerie | null>((a, d) => (!a || totalDia(d) > totalDia(a) ? d : a), null);
  const total = dias.reduce((s, d) => s + totalDia(d), 0);
  const share = pico && total > 0 ? (totalDia(pico) / total) * 100 : 0;

  return (
    <section aria-label={titulo} className="vidrio panel" style={{ gap: 18 }}>
      <div className="panel-cabeza">
        <div>
          <h2>{titulo}</h2>
          {pico && total > 0 ? (
            <div className="panel-sub">
              El día más fuerte fue el {diaMes(pico.fecha)}: {bs(totalDia(pico))}, el {Math.round(share)}% del período
            </div>
          ) : (
            <div className="panel-sub">Sin movimiento en el período</div>
          )}
        </div>
        <div className="leyenda">
          {tramos.map((t) => (
            <span key={t.nombre}>
              <span aria-hidden="true" className="muestra" style={{ background: t.color }} />
              {t.nombre}
            </span>
          ))}
        </div>
      </div>
      <div className="grafico-scroll">
        <div className="grafico" style={dias.length > 45 ? { minWidth: dias.length * 9 + 60 } : undefined}>
          <div aria-hidden="true" className="eje mono">
            {marcas.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="area">
            <div
              className="columnas"
              role="img"
              aria-label={`${titulo}: barras apiladas del ${diaMes(dias[0]?.fecha ?? "")} al ${diaMes(dias.at(-1)?.fecha ?? "")}`}
            >
              {dias.map((d) => {
                const [a, b] = d.valores;
                const ha = a > 0 ? Math.max(2, Math.round((a / max) * ALTO)) : 0;
                const hb = b > 0 ? Math.max(2, Math.round((b / max) * ALTO)) : 0;
                return (
                  <div
                    key={d.fecha}
                    className="columna"
                    title={`${diaMes(d.fecha)} · ${tramos[0].nombre.toLowerCase()} ${bs(a)} · ${tramos[1].nombre.toLowerCase()} ${bs(b)}`}
                  >
                    {ha > 0 ? <div className={`tramo ${tramos[0].clase}`} style={{ height: ha }} /> : null}
                    {hb > 0 ? <div className={`tramo ${tramos[1].clase}`} style={{ height: hb }} /> : null}
                  </div>
                );
              })}
            </div>
            <div aria-hidden="true" className="fechas mono">
              {dias.map((d, i) => (
                <span key={d.fecha} className={i % 5 === 0 ? undefined : "fecha-menor"}>
                  {i % cadaCuanto === 0 ? d.fecha.slice(8, 10) : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const TRAMO_PEDIDOS: Tramo = { nombre: "Pedidos", clase: "tramo-pedidos", color: "var(--pedidos)" };
export const TRAMO_DESPACHO: Tramo = { nombre: "Despacho de pedidos", clase: "tramo-pedidos", color: "var(--pedidos)" };
export const TRAMO_RETAIL: Tramo = { nombre: "Retail (mostrador + VTD)", clase: "tramo-retail", color: "var(--retail)" };
export const TRAMO_CUENTA: Tramo = { nombre: "Cuenta de clientes", clase: "tramo-cuenta", color: "var(--cobrado)" };
