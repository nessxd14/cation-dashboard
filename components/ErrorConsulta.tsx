"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function ErrorConsulta({
  mensaje,
  referencia,
  reintentar,
}: {
  mensaje: string;
  referencia?: string;
  reintentar?: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <section className="vidrio vacio" aria-label="Error de consulta">
      <h1>No se pudieron cargar los datos</h1>
      <p role="alert">{mensaje}</p>
      <div className="enlaces-seccion">
        <button
          type="button"
          className="boton-vidrio"
          disabled={pendiente}
          onClick={() =>
            iniciar(() => (reintentar ? reintentar() : router.refresh()))
          }
        >
          {pendiente ? "Consultando…" : "Reintentar"}
        </button>
        <Link href="/pedidos">Abrir pedidos WholeSale</Link>
      </div>
      {referencia ? (
        <p className="apagado">Referencia del error: {referencia}</p>
      ) : null}
    </section>
  );
}
