/** Lugar reservado para La Chismosa (video de caja y almacén). Se conecta cuando exista el esquema `chismosa`. */
export function Chismosa() {
  return (
    <section id="auditoria" aria-label="Auditoría La Chismosa" className="vidrio panel punteado" style={{ gap: 14 }}>
      <div className="panel-cabeza">
        <div>
          <h2>Auditoría · La Chismosa</h2>
          <div className="panel-sub">Video de caja y almacén cruzado con el sistema</div>
        </div>
        <span className="etiqueta etiqueta-violeta">en pruebas</span>
      </div>
      <div className="mini-kpis">
        <div className="mini-kpi"><span className="mono">—</span>Cajón abierto sin cobro</div>
        <div className="mini-kpi"><span className="mono">—</span>Salida física sin registro</div>
        <div className="mini-kpi"><span className="mono">—</span>Eventos con clip</div>
      </div>
      <p className="panel-sub" style={{ margin: 0 }}>
        Cuando La Chismosa esté conectada, cada cobro, entrega y despacho tendrá su botón “Ver clip”.
      </p>
    </section>
  );
}
