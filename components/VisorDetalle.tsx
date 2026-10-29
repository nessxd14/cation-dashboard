"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

const PRESENTACIONES = [
  { id: "pagina", nombre: "Página", simbolo: "▤" },
  { id: "panel", nombre: "Panel lateral", simbolo: "◧" },
  { id: "ventana", nombre: "Ventana", simbolo: "▣" },
] as const;
type Presentacion = (typeof PRESENTACIONES)[number]["id"];
type Retorno = {
  id: string | null;
  href: string | null;
  volver: string;
  x: number;
  y: number;
  tablaLeft: number;
  tablaTop: number;
};
const valida = (v: unknown): v is Presentacion =>
  PRESENTACIONES.some((p) => p.id === v);
const coordenada = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
function leerRetorno(clave: string): Retorno | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(clave) || "null");
    if (
      !p ||
      typeof p.volver !== "string" ||
      (typeof p.id !== "string" && p.id !== null)
    )
      return null;
    return {
      ...p,
      href: typeof p.href === "string" ? p.href : null,
      x: coordenada(p.x),
      y: coordenada(p.y),
      tablaLeft: coordenada(p.tablaLeft),
      tablaTop: coordenada(p.tablaTop),
    };
  } catch {
    return null;
  }
}
function guardarRetorno(clave: string, retorno: Retorno) {
  try {
    sessionStorage.setItem(clave, JSON.stringify(retorno));
  } catch {
    /* La consulta funciona sin almacenamiento local. */
  }
}

/** Cambiar la presentación conserva el mismo expediente y sus controles. */
export function VisorDetalle({
  lista,
  detalle,
  seleccion,
  titulo,
  volver,
  preferenciaId,
  etiquetaLista = "lista",
}: {
  lista: ReactNode;
  detalle: ReactNode;
  seleccion: string | null;
  titulo: string;
  volver: string;
  preferenciaId: string;
  etiquetaLista?: string;
}) {
  const [modo, setModo] = useState<Presentacion>("pagina"),
    [cerrado, setCerrado] = useState(false),
    [pendiente, setPendiente] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    toolbar = useRef<HTMLDivElement>(null),
    listado = useRef<HTMLDivElement>(null);
  const anterior = useRef({ seleccion, abierto: false, modo });
  const abierto = !!seleccion && !cerrado;
  const clave = `dashboard-wholesale-presentacion-v1:${preferenciaId}`;
  const claveRetorno = `dashboard-wholesale-retorno-v1:${preferenciaId}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(clave);
      setModo(valida(v) ? v : "pagina");
    } catch {
      setModo("pagina");
    }
  }, [clave]);
  useLayoutEffect(() => {
    if (anterior.current.seleccion !== seleccion) {
      anterior.current.seleccion = seleccion;
      setPendiente(false);
      if (seleccion) setCerrado(false);
    }
  }, [seleccion]);
  useLayoutEffect(() => {
    if (seleccion) return;
    const retorno = leerRetorno(claveRetorno);
    if (!retorno) return;
    let destino: URL;
    try {
      destino = new URL(retorno.volver, location.href);
    } catch {
      return;
    }
    if (
      destino.pathname + destino.search !==
      location.pathname + location.search
    )
      return;
    const frame = requestAnimationFrame(() => {
      const tabla =
        listado.current?.querySelector<HTMLElement>(".tabla-scroll");
      if (tabla) {
        tabla.scrollLeft = retorno.tablaLeft;
        tabla.scrollTop = retorno.tablaTop;
      }
      window.scrollTo({ left: retorno.x, top: retorno.y, behavior: "instant" });
      const enlaces = Array.from(
        listado.current?.querySelectorAll<HTMLElement>(
          "[data-abrir-detalle]",
        ) ?? [],
      );
      const enlace =
        enlaces.find(
          (a) =>
            a.dataset.abrirDetalle === retorno.id &&
            a.getAttribute("href") === retorno.href,
        ) ??
        enlaces.find((a) => a.dataset.abrirDetalle === retorno.id) ??
        listado.current?.querySelector<HTMLElement>('input[name="buscar"]');
      enlace?.focus({ preventScroll: true });
      try {
        sessionStorage.removeItem(claveRetorno);
      } catch {
        /* No afecta la lectura. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [seleccion, claveRetorno]);
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const modal = el.matches(":modal");
    if (abierto) {
      if (modo === "ventana" && !modal) {
        if (el.open) el.close();
        el.showModal();
      } else if (modo !== "ventana") {
        if (modal) el.close();
        el.setAttribute("open", "");
      }
      if (!anterior.current.abierto || anterior.current.modo !== modo) {
        if (modo !== "ventana")
          toolbar.current
            ?.querySelector("button")
            ?.focus({ preventScroll: true });
        if (modo === "pagina")
          el.scrollIntoView({ block: "start", behavior: "instant" });
      }
    } else if (el.open) el.close();
    anterior.current.abierto = abierto;
    anterior.current.modo = modo;
  }, [abierto, modo, seleccion]);
  useEffect(() => {
    if (!abierto || modo !== "ventana") return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [abierto, modo]);
  const cambiar = (valor: Presentacion) => {
    setModo(valor);
    try {
      localStorage.setItem(clave, valor);
    } catch {
      /* Preferencia activa durante esta consulta. */
    }
  };
  const cerrar = () => {
    setCerrado(true);
    const retorno = leerRetorno(claveRetorno);
    if (!retorno || retorno.id !== seleccion)
      guardarRetorno(claveRetorno, {
        id: seleccion,
        href: null,
        volver,
        x: 0,
        y: 0,
        tablaLeft: 0,
        tablaTop: 0,
      });
    window.location.replace(volver);
  };
  const abrir = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
      return;
    const enlace = (e.target as Element).closest<HTMLElement>(
      "[data-abrir-detalle]",
    );
    if (!enlace?.dataset.abrirDetalle) return;
    const tabla = listado.current?.querySelector<HTMLElement>(".tabla-scroll");
    guardarRetorno(claveRetorno, {
      id: enlace.dataset.abrirDetalle,
      href: enlace.getAttribute("href"),
      volver,
      x: window.scrollX,
      y: window.scrollY,
      tablaLeft: tabla?.scrollLeft ?? 0,
      tablaTop: tabla?.scrollTop ?? 0,
    });
    setPendiente(true);
  };
  const selector = (
    <div className="vd-selector">
      <span>Ver detalle en</span>
      <div role="group" aria-label="Presentación del detalle">
        {PRESENTACIONES.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={modo === p.id}
            onClick={() => cambiar(p.id)}
          >
            <span aria-hidden="true">{p.simbolo}</span>
            {p.nombre}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <section
      className={`vd-visor vd-${modo}${abierto ? " vd-abierto" : ""}`}
      aria-label="Listado y detalle"
    >
      <div className="vd-opciones">
        {selector}
        <span className="vd-ayuda">
          Abre un registro para consultar su información.
        </span>
      </div>
      <div className="vd-layout">
        <div ref={listado} className="vd-lista" onClickCapture={abrir}>
          {lista}
        </div>
        {pendiente ? (
          <p className="vd-cargando" role="status">
            Consultando información…
          </p>
        ) : null}
        <dialog
          ref={dialog}
          className={`vd-detalle vd-detalle-${modo}`}
          role={modo === "ventana" ? "dialog" : "region"}
          aria-label={titulo}
          aria-modal={modo === "ventana" && abierto ? true : undefined}
          onCancel={(e) => {
            e.preventDefault();
            cerrar();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && modo !== "ventana") {
              e.preventDefault();
              cerrar();
            }
          }}
          onClick={(e) => {
            if (modo !== "ventana" || e.target !== e.currentTarget) return;
            const r = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              cerrar();
          }}
        >
          <div ref={toolbar} className="vd-barra-detalle">
            <button type="button" className="vd-volver" onClick={cerrar}>
              {modo === "pagina"
                ? `← Volver a ${etiquetaLista}`
                : modo === "panel"
                  ? "Cerrar panel ×"
                  : "Cerrar ventana ×"}
            </button>
            {selector}
          </div>
          <div className="vd-cuerpo-detalle" aria-busy={pendiente}>
            {detalle}
          </div>
        </dialog>
      </div>
    </section>
  );
}
