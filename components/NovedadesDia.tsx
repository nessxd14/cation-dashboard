import { Suspense } from "react";
import { Panel } from "./piezas";
import { ListaNovedades } from "./ListaNovedades";
import { ErrorDatos } from "@/lib/datos";
import { obtenerNovedadesDia, type Novedad } from "@/lib/operativo";
import { diaLargo } from "@/lib/formato";
import { enlace } from "@/lib/filtros";
import { enlaceOrigen } from "@/lib/enlaces";
import { enlaceRetail } from "@/lib/retail";
import { enlaceWholesale } from "@/lib/wholesale";

export function enlaceNovedad(n: Novedad, fecha: string): string | null {
  const rango = { p: "rango", desde: fecha, hasta: fecha };
  const id = n.referencia_id;
  if (!id) return n.tipo === "caja" ? "/finanzas" : null;
  switch (n.tipo) {
    case "pedido":
      return enlaceWholesale(rango, {
        pedido: id,
        etapa: "pedido",
        vista: "pagina",
      });
    case "vtd":
      return enlaceRetail(rango, { venta: id, retail_tipo: "VTD" });
    case "anulacion":
      return enlaceRetail(rango, {
        venta: id,
        retail_tipo: n.documento.toUpperCase().startsWith("VTA")
          ? "VTA"
          : "VTD",
      });
    case "cobro":
      // referencia_id es el id de cliente en Hermes.
      return enlace("/detalle", { ...rango, cliente: id }, { tipo: "cartera" });
    case "traslado":
      return enlaceOrigen("TRASLADO", id)?.href ?? "/almacen";
    case "caja":
      return "/finanzas";
    default:
      // Cotizaciones y clientes aún no tienen pantalla propia.
      return null;
  }
}

export function NovedadesDia({ fecha }: { fecha: string }) {
  return (
    <Panel
      titulo="Novedades del día"
      sub={`${diaLargo(fecha)}/${fecha.slice(0, 4)} · Hora de Bolivia`}
      id="novedades-del-dia"
    >
      <Suspense
        fallback={
          <p className="apagado" role="status">
            Cargando novedades…
          </p>
        }
      >
        <Novedades fecha={fecha} />
      </Suspense>
    </Panel>
  );
}

async function Novedades({ fecha }: { fecha: string }) {
  try {
    const novedades = (await obtenerNovedadesDia(fecha)).map((n) => ({
      ...n,
      href: enlaceNovedad(n, fecha),
    }));
    return <ListaNovedades novedades={novedades} />;
  } catch (error) {
    if (error instanceof ErrorDatos)
      return (
        <p className="aviso" role="status">
          {error.message}
        </p>
      );
    throw error;
  }
}
