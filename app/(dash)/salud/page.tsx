import { Panel } from "@/components/piezas";
import { ListaSalud } from "@/components/ListaSalud";
import { obtenerSalud } from "@/lib/datos";

export default async function SaludPage() {
  const salud = await obtenerSalud();
  const pendientes = salud.filter((s) => s.nivel !== "ok").length;

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Salud de datos</h1>
          <div className="subtitulo">
            {pendientes === 0 ? "Todo en orden" : `${pendientes} puntos por revisar`} · se calcula en vivo sobre toda la base
          </div>
        </div>
      </header>
      <Panel titulo="Indicadores" sub="Cada punto rojo o ámbar resta confianza a alguna cifra del dashboard">
        <ListaSalud indicadores={salud} />
      </Panel>
      <Panel titulo="Dónde se corrige cada uno">
        <div>
          <div className="fila"><span className="fila-nombre">Líneas rechazadas cobradas</span><span className="apagado">Conciliador (Hermes) · partir o ajustar la partida</span></div>
          <div className="fila"><span className="fila-nombre">Cobros QR sin verificar</span><span className="apagado">Seller · Caja (vínculo con el scraper BNB)</span></div>
          <div className="fila"><span className="fila-nombre">Salidas sin enlace</span><span className="apagado">Almacén · Kardex</span></div>
          <div className="fila"><span className="fila-nombre">Traslados en tránsito</span><span className="apagado">Almacén · Traslados</span></div>
          <div className="fila"><span className="fila-nombre">Productos sin precio</span><span className="apagado">Almacén · Catálogo</span></div>
          <div className="fila"><span className="fila-nombre">Turnos abiertos más de 24 h</span><span className="apagado">Seller · Caja</span></div>
        </div>
      </Panel>
    </>
  );
}
