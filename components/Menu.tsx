"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { salir } from "@/app/login/actions";
import { alternarLiviano } from "@/app/(dash)/actions";
import { consultaComun } from "@/lib/filtros";

type Props = {
  correo: string;
  alertas: number;
  hora: string;
  liviano: boolean;
};

const PANTALLAS = [
  { href: "/", texto: "Resumen" },
  { href: "/ventas", texto: "Ventas" },
  { href: "/pedidos", texto: "Pedidos", extra: "WholeSale" },
  { href: "/almacen", texto: "Almacén" },
  { href: "/finanzas", texto: "Finanzas" },
  { href: "/inventario", texto: "Inventario" },
  { href: "/margen", texto: "Margen" },
  { href: "/metas", texto: "Metas" },
  { href: "/cobranza", texto: "Cobranza" },
  { href: "/salud", texto: "Salud de datos", corto: "Salud", alertas: true },
  { href: "/auditoria", texto: "Auditoría", extra: "Chismosa" },
] as const;

/** Datos de la cuenta y acciones. En escritorio va al pie del menú; en el celular, dentro de "Cuenta". */
function Cuenta({ correo, hora, liviano }: Omit<Props, "alertas">) {
  return (
    <>
      <strong>{correo}</strong>
      <span>Fuente: analitica</span>
      <span>Fechas y horas de La Paz</span>
      <form action={alternarLiviano}>
        <button type="submit" className="boton-texto">
          {liviano ? "Activar efecto vidrio" : "Modo liviano (sin vidrio)"}
        </button>
      </form>
      <form action={salir}>
        <button type="submit" className="boton-texto">
          Salir
        </button>
      </form>
    </>
  );
}

export function Menu({ correo, alertas, hora, liviano }: Props) {
  const ruta = usePathname();
  const params = useSearchParams();
  const query = consultaComun(Object.fromEntries(params.entries())).toString();
  const nav = useRef<HTMLDivElement>(null);

  // En el celular las pantallas van en una fila deslizable: deja visible la actual.
  useEffect(() => {
    const actual = nav.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (
      actual &&
      nav.current &&
      nav.current.scrollWidth > nav.current.clientWidth
    ) {
      nav.current.scrollTo({
        left: actual.offsetLeft - 12,
        behavior: "instant" as ScrollBehavior,
      });
    }
  }, [ruta]);

  return (
    <nav aria-label="Pantallas del dashboard" className="vidrio menu">
      <div className="menu-barra">
        <div className="marca">
          <div aria-hidden="true" className="marca-logo" />
          <div>
            <div className="marca-nombre">CATION</div>
            <div className="marca-sub">Operaciones · {hora}</div>
          </div>
        </div>
        <details className="menu-cuenta solo-movil">
          <summary>Cuenta</summary>
          <div className="menu-cuenta-caja vidrio vidrio-fuerte">
            <Cuenta correo={correo} hora={hora} liviano={liviano} />
          </div>
        </details>
      </div>

      <div className="nav" ref={nav}>
        {PANTALLAS.map((p) => (
          <Link
            key={p.href}
            href={`${p.href}${query ? `?${query}` : ""}`}
            aria-current={ruta === p.href ? "page" : undefined}
          >
            <span>
              {"corto" in p ? (
                <>
                  <span className="solo-escritorio">{p.texto}</span>
                  <span className="solo-movil">{p.corto}</span>
                </>
              ) : (
                p.texto
              )}
            </span>
            {"alertas" in p && alertas > 0 ? (
              <span className="insignia mono" aria-label={`${alertas} alertas`}>
                {alertas}
              </span>
            ) : null}
            {"extra" in p ? (
              <span className="nav-extra solo-escritorio">{p.extra}</span>
            ) : null}
          </Link>
        ))}
      </div>

      <div className="menu-pie solo-escritorio">
        <Cuenta correo={correo} hora={hora} liviano={liviano} />
      </div>
    </nav>
  );
}
