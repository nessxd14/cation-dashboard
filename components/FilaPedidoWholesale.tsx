import { EstadoEtapaWholesale } from "./EstadoEtapaWholesale";
import { estadosEtapasWholesale } from "@/lib/wholesale-estados";
import {
  ETAPAS,
  TITULOS_ETAPA,
  categoriaWholesale,
  enlaceWholesale,
  type PedidoWholesale,
} from "@/lib/wholesale";
import type { Parametros } from "@/lib/filtros";
import { hoyLaPaz } from "@/lib/formato";

const ZONA = "America/La_Paz";
const dia = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));
const diaMesCorto = (iso: string) => {
  const [, m, d] = dia(iso).split("-");
  return `${d}/${m}`;
};
const horaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** "hoy HH:MM" / "ayer HH:MM" / "DD/MM HH:MM", en hora de La Paz. */
export function cuandoLaPaz(iso: string): string {
  const d = dia(iso);
  const hoy = hoyLaPaz();
  const ayer = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(
    new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000),
  );
  const prefijo = d === hoy ? "hoy" : d === ayer ? "ayer" : diaMesCorto(iso);
  return `${prefijo} ${horaCorta(iso)}`;
}

export function tonoActividad(tipo: string | null | undefined): string {
  const t = (tipo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/anulad|rechazad|cancelad|incidencia/.test(t)) return "rojo";
  if (/cobro|anticipo/.test(t)) return "violeta";
  if (/salida|retiro|despacho/.test(t)) return "verde";
  if (/edit|item|compra|restaurad/.test(t)) return "ambar";
  if (/alistad|verificaci|almacen/.test(t)) return "azul";
  return "gris";
}

export function FilaPedidoWholesale({
  pedido: p,
  params,
  seleccionado,
}: {
  pedido: PedidoWholesale;
  params: Parametros;
  seleccionado: boolean;
}) {
  const estados = estadosEtapasWholesale(p);
  return (
    <tr className={seleccionado ? "ws-seleccionado" : undefined}>
      <td>
        <a
          href={enlaceWholesale(params, { pedido: p.id })}
          data-abrir-detalle={p.id}
          aria-current={seleccionado ? "true" : undefined}
        >
          <strong>{p.numero}</strong>
        </a>
        <span className="fila-sub">{p.cliente}</span>
        <span className="fila-sub">
          {categoriaWholesale(p.categoria)} · {p.estado}
        </span>
      </td>
      <td data-etiqueta="Última actividad" className="ws-actividad">
        {p.actividad_en ? (
          <>
            <span
              className="ws-actividad-tipo"
              data-tono={tonoActividad(p.actividad_tipo)}
            >
              {p.actividad_tipo ?? "Actividad"}
            </span>
            <span className="fila-sub">
              <time dateTime={p.actividad_en}>{cuandoLaPaz(p.actividad_en)}</time>
              {dia(p.creado_en) !== dia(p.actividad_en)
                ? ` · creado ${diaMesCorto(p.creado_en)}`
                : ""}
            </span>
          </>
        ) : (
          "—"
        )}
      </td>
      {ETAPAS.map((etapa) => (
        <td key={etapa} data-etiqueta={TITULOS_ETAPA[etapa]}>
          <a
            className="ws-enlace-etapa"
            href={enlaceWholesale(params, { pedido: p.id, etapa })}
            data-abrir-detalle={p.id}
            aria-label={`${TITULOS_ETAPA[etapa]} de ${p.numero}: ${estados[etapa].texto}. Ver detalle`}
          >
            <EstadoEtapaWholesale estado={estados[etapa]} />
          </a>
          {estados[etapa].detalles.map((texto, i) => (
            <span key={i} className="fila-sub">
              {texto}
            </span>
          ))}
        </td>
      ))}
    </tr>
  );
}
