import { Kpi, Panel } from "./piezas";
import type {
  CuentaCobranza as DatosCuenta,
  PagoCuenta,
} from "@/lib/operativo";
import {
  dineroWholesale as dinero,
  fechaWholesale as fecha,
} from "@/lib/wholesale";
import { nombre } from "@/lib/formato";

const ESTADOS: Record<string, { texto: string; tono: string }> = {
  CONFIRMADO: { texto: "Confirmado", tono: "verde" },
  ACREDITADO: { texto: "Acreditado", tono: "verde" },
  PROPUESTO: { texto: "Por verificar", tono: "ambar" },
  RECHAZADO: { texto: "Rechazado", tono: "rojo" },
  ANULADO: { texto: "Anulado", tono: "rojo" },
};

function IconoMedio({ medio }: { medio: string }) {
  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {medio === "QR" ? (
        <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6v-3M12 12h3m6 0v3m-9 3v3" />
      ) : medio === "EFECTIVO" ? (
        <>
          <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 12h.01M18 12h.01" />
        </>
      ) : (
        <path d="M4 8h15m-4-4 4 4-4 4m5 4H5m4-4-4 4 4 4" />
      )}
    </svg>
  );
}

function TarjetaPago({ pago }: { pago: PagoCuenta }) {
  const estado = ESTADOS[pago.estado] ?? {
    texto: "Estado no disponible",
    tono: "gris",
  };
  const contabilizado =
    pago.estado === "CONFIRMADO" || pago.estado === "ACREDITADO";
  return (
    <article className="cuenta-pago">
      <header className="cuenta-pago-cabecera">
        <span className={`cuenta-medio vista-${estado.tono}`}>
          <IconoMedio medio={pago.medio} />
        </span>
        <div>
          <strong>{nombre(pago.medio)}</strong>{" "}
          <span className={`vista-insignia vista-${estado.tono}`}>
            {estado.texto}
          </span>
        </div>
        <strong className="mono cuenta-pago-monto">{dinero(pago.monto)}</strong>
      </header>
      <dl>
        {contabilizado || pago.estado === "PROPUESTO" ? (
          <div>
            <dt>
              {contabilizado ? "Aplicado a partidas" : "Reparto en revisión"}
            </dt>
            <dd className="mono">{dinero(pago.aplicado)}</dd>
          </div>
        ) : null}
        {contabilizado && (pago.sin_asignar ?? 0) > 0 ? (
          <div>
            <dt>Anticipo sin imputar</dt>
            <dd className="mono">{dinero(pago.sin_asignar)}</dd>
          </div>
        ) : null}
        {pago.devuelto > 0 ? (
          <div>
            <dt>Devuelto</dt>
            <dd className="mono">{dinero(pago.devuelto)}</dd>
          </div>
        ) : null}
      </dl>
      <footer>
        <span>
          Registro · {pago.registrado_por || "Sin responsable"} ·{" "}
          {fecha(pago.creado_en)}
        </span>
        {pago.confirmado_por || pago.confirmado_en ? (
          <span>
            Confirmación · {pago.confirmado_por || "Sin responsable"} ·{" "}
            {fecha(pago.confirmado_en)}
          </span>
        ) : null}
      </footer>
    </article>
  );
}

export function SaldosCuenta({
  cuenta,
  partidas,
}: {
  cuenta: DatosCuenta;
  partidas: number;
}) {
  return (
    <section className="cuenta-saldos" aria-label="Saldos de la cuenta">
      <Kpi
        nombre={
          cuenta.saldo !== null && cuenta.saldo < 0
            ? "Saldo a favor del cliente"
            : "Saldo total del cliente"
        }
        valor={
          cuenta.saldo === null
            ? "No disponible"
            : dinero(Math.abs(cuenta.saldo))
        }
        nota="Saldo confirmado en Hermes"
        color="var(--pedidos)"
      />
      <Kpi
        nombre="Saldo de partidas mostradas"
        valor={dinero(partidas)}
        nota="Total con los filtros de la tabla"
        color="var(--cartera)"
      />
      <Kpi
        nombre="Pagos en revisión"
        valor={
          cuenta.en_revision === null
            ? "No disponible"
            : dinero(cuenta.en_revision)
        }
        nota="Importe pendiente de confirmación"
        color="var(--aviso)"
      />
    </section>
  );
}

export function PagosCuenta({ pagos }: { pagos: PagoCuenta[] }) {
  const [reciente, ...anteriores] = pagos;
  return (
    <Panel
      titulo="Pagos recientes"
      sub="Medio, estado y aplicación según Hermes"
    >
      {reciente ? (
        <TarjetaPago pago={reciente} />
      ) : (
        <p className="apagado">Sin pagos registrados en esta cuenta.</p>
      )}
      {anteriores.length ? (
        <details className="cuenta-pagos-anteriores">
          <summary>Ver pagos anteriores ({anteriores.length})</summary>
          {anteriores.map((pago) => (
            <TarjetaPago key={pago.id} pago={pago} />
          ))}
        </details>
      ) : null}
    </Panel>
  );
}
