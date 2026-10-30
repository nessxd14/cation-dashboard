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
          href={enlaceWholesale(params, { pedido: p.id, etapa: "pedido" })}
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
