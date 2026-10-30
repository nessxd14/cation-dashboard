import type { EstadoEtapa, IconoEtapa } from "@/lib/wholesale-estados";

export function IconoEstadoEtapa({ icono }: { icono: IconoEtapa }) {
  return (
    <svg
      className="ws-estado-icono"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icono === "alerta" ? (
        <>
          <path d="M10.3 4.5 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4m0 4h.01" />
        </>
      ) : (
        <>
          <circle
            cx="12"
            cy="12"
            r="9"
            strokeDasharray={icono === "vacio" ? "3 3" : undefined}
          />
          {icono === "check" && <path d="m8 12 3 3 5-6" />}
          {icono === "reloj" && <path d="M12 7v5l3 2" />}
          {icono === "parcial" && (
            <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
          )}
          {icono === "cancelado" && <path d="m9 9 6 6m0-6-6 6" />}
        </>
      )}
    </svg>
  );
}

export function EstadoEtapaWholesale({ estado }: { estado: EstadoEtapa }) {
  return (
    <span className={`ws-estado ws-estado-${estado.tono}`} title={estado.ayuda}>
      <IconoEstadoEtapa icono={estado.icono} />
      <span>{estado.texto}</span>
    </span>
  );
}

export function LeyendaEtapasWholesale() {
  return (
    <div className="ws-leyenda" aria-label="Guía de indicadores de las etapas">
      <span>
        <i className="ws-estado-verde">
          <IconoEstadoEtapa icono="check" />
        </i>
        Con registro / completo
      </span>
      <span>
        <i className="ws-estado-azul">
          <IconoEstadoEtapa icono="parcial" />
        </i>
        En proceso / parcial
      </span>
      <span>
        <i className="ws-estado-ambar">
          <IconoEstadoEtapa icono="reloj" />
        </i>
        Por verificar
      </span>
      <span>
        <i className="ws-estado-rojo">
          <IconoEstadoEtapa icono="alerta" />
        </i>
        Pendiente / revisar
      </span>
      <span>
        <i className="ws-estado-gris">
          <IconoEstadoEtapa icono="vacio" />
        </i>
        Sin registro
      </span>
      <p>
        Preparado y verificación indican marcas registradas. Abre la etapa para
        revisar cada tanda.
      </p>
    </div>
  );
}
