import { Suspense } from "react";
import { Panel } from "./piezas";
import { TablaActividadDia } from "./TablaActividadDia";
import { ErrorDatos } from "@/lib/datos";
import { obtenerActividadDia } from "@/lib/operativo";
import { diaLargo } from "@/lib/formato";
import { enlaceOrigen } from "@/lib/enlaces";
import { enlaceRetail } from "@/lib/retail";
import { enlaceWholesale } from "@/lib/wholesale";

export function ActividadDia({ fecha }: { fecha: string }) {
  return (
    <Panel
      titulo="Actividad del día"
      sub={`${diaLargo(fecha)}/${fecha.slice(0, 4)} · Hora de Bolivia`}
      id="actividad-del-dia"
    >
      <Suspense
        fallback={
          <p className="apagado" role="status">
            Cargando actividad…
          </p>
        }
      >
        <Eventos fecha={fecha} />
      </Suspense>
    </Panel>
  );
}

async function Eventos({ fecha }: { fecha: string }) {
  const rango = { p: "rango", desde: fecha, hasta: fecha };
  const retail = enlaceRetail(rango);
  try {
    const eventos = (await obtenerActividadDia(fecha)).map((e) => ({
      ...e,
      href:
        e.tipo === "pedidos"
          ? enlaceWholesale(rango, {
              pedido: e.referencia_id,
              etapa: e.etapa ?? "pedido",
              vista: "pagina",
            })
          : e.tipo === "vtd"
            ? enlaceRetail(rango, {
                venta: e.referencia_id,
                retail_tipo: "VTD",
              })
            : (enlaceOrigen("TRASLADO", e.referencia_id)?.href ?? "/almacen"),
    }));
    return <TablaActividadDia eventos={eventos} retail={retail} />;
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
