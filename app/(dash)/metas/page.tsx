import { Cabecera } from "@/components/Cabecera";
import { Panel } from "@/components/piezas";
import { FormMeta } from "@/components/Configuracion";
import { consultaComun, leerFiltros, type Parametros } from "@/lib/filtros";
import { leerPeriodo, fechaValida } from "@/lib/periodo";
import { obtenerCatalogos, obtenerMetas } from "@/lib/operativo";
import { bs, pct } from "@/lib/formato";

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const params = await searchParams,
    p = leerPeriodo(params),
    f = leerFiltros(params);
  const solicitado = typeof params.mes === "string" ? `${params.mes}-01` : "";
  const mes = fechaValida(solicitado)
    ? solicitado
    : `${p.hasta.slice(0, 7)}-01`;
  const [m, catalogos] = await Promise.all([
    obtenerMetas(mes, f.sucursal),
    obtenerCatalogos(),
  ]);
  const sucursal = f.sucursal
    ? (catalogos.sucursales.find((s) => s.id === f.sucursal)?.nombre ??
      "Sucursal seleccionada")
    : "Todas las sucursales";
  const totalDias = new Date(`${m.hasta}T12:00:00Z`).getUTCDate();
  const transcurridos = Math.max(
    0,
    Math.min(
      totalDias,
      Math.floor((Date.parse(m.hoy) - Date.parse(m.mes)) / 86400000) + 1,
    ),
  );
  return (
    <>
      <Cabecera
        titulo="Metas mensuales"
        sub={`${sucursal} · mes completo · se aplican únicamente mes y sucursal`}
        ruta="/metas"
        params={params}
        tipos={["metas"]}
      />
      <form action="/metas" method="get" className="herramientas">
        {[...consultaComun(params)].map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label>
          Mes{" "}
          <input
            aria-label="Mes de las metas"
            type="month"
            name="mes"
            required
            min="2000-01"
            max="2100-12"
            defaultValue={mes.slice(0, 7)}
          />
        </label>
        <button className="boton-vidrio">Ver mes</button>
      </form>
      <div className="rejilla">
        {(
          [
            ["ventas", "Ventas"],
            ["cobranza", "Cobranza"],
          ] as const
        ).map(([clave, titulo]) => {
          const actual = m[clave],
            objetivo = m.meta?.[clave] ?? 0,
            avance = objetivo > 0 ? actual / objetivo : null,
            proyeccion =
              transcurridos > 0 ? (actual / transcurridos) * totalDias : null;
          return (
            <Panel
              key={clave}
              titulo={titulo}
              sub={
                objetivo > 0
                  ? `Objetivo ${bs(objetivo)}`
                  : "Objetivo sin definir"
              }
            >
              <strong className="mono cifra-grande">{bs(actual)}</strong>
              <div
                className="progreso"
                role="progressbar"
                aria-label={`Avance de ${titulo}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  avance === null ? 0 : Math.min(100, Math.round(avance * 100))
                }
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, (avance ?? 0) * 100))}%`,
                  }}
                />
              </div>
              <p>
                {avance === null
                  ? "Configura un objetivo para medir el avance."
                  : `${pct(avance)} alcanzado · ${actual >= objetivo ? "objetivo cumplido" : `faltan ${bs(objetivo - actual)}`}`}
              </p>
              {transcurridos > 0 && transcurridos < totalDias ? (
                <p className="panel-sub">
                  Al ritmo actual: {bs(proyeccion)} al cierre. Estimación con{" "}
                  {transcurridos} de {totalDias} días calendario.
                </p>
              ) : null}
            </Panel>
          );
        })}
      </div>
      <Panel
        titulo="Configurar objetivos"
        sub={`${mes.slice(0, 7)} · ${sucursal}. Se guardan para las cuentas autorizadas del dashboard. Cero deja ese objetivo sin definir.`}
      >
        <FormMeta
          key={`${mes}-${f.sucursal ?? ""}-${m.meta?.ventas}-${m.meta?.cobranza}`}
          mes={mes}
          sucursal={f.sucursal ?? ""}
          ventas={m.meta?.ventas}
          cobranza={m.meta?.cobranza}
        />
      </Panel>
      {f.sucursal ? (
        <p className="aviso">
          La cobranza por sucursal incluye retail atribuible. Los pagos
          generales a cuenta no tienen sucursal y quedan fuera.
        </p>
      ) : null}
    </>
  );
}
