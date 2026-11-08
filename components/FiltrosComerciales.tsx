"use client";

import { useEffect, useState } from "react";
import type { Catalogos, Filtros } from "@/lib/filtros";

const CAMPOS = [
  ["sucursal", "Sucursal", "sucursales"],
  ["vendedor", "Vendedor", "vendedores"],
  ["cliente", "Cliente", "clientes"],
  ["canal", "Canal", "canales"],
  ["producto", "Producto", "productos"],
] as const;

export function FiltrosComerciales({
  ruta,
  filtros,
  ocultos,
  limpiar,
}: {
  ruta: string;
  filtros: Filtros;
  ocultos: [string, string][];
  limpiar: string;
}) {
  const activos = Object.keys(filtros).length;
  const [abierto, setAbierto] = useState(activos > 0);
  const [resultado, setResultado] = useState<Catalogos | "error" | null>(null);

  useEffect(() => {
    if (!abierto || resultado) return;
    const controller = new AbortController();
    fetch("/filtros/catalogos", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catálogos no disponibles");
        const catalogos: Catalogos = await response.json();
        if (!controller.signal.aborted) setResultado(catalogos);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResultado("error");
      });
    return () => controller.abort();
  }, [abierto, resultado]);

  return (
    <details
      className="filtros-desplegables"
      open={abierto}
      onToggle={(evento) => setAbierto(evento.currentTarget.open)}
    >
      <summary>
        Filtros comerciales
        {activos
          ? ` · ${activos} activos`
          : " · sucursal, vendedor, cliente, canal y producto"}
      </summary>
      {resultado === "error" ? (
        <div className="filtros vidrio">
          <p role="alert">No se pudieron cargar los filtros comerciales.</p>
          <button
            className="boton-vidrio"
            type="button"
            onClick={() => setResultado(null)}
          >
            Reintentar
          </button>
          <a href={limpiar}>Limpiar filtros</a>
        </div>
      ) : resultado ? (
        <form method="get" action={ruta} className="filtros vidrio">
          {ocultos.map(([clave, valor]) => (
            <input key={clave} type="hidden" name={clave} value={valor} />
          ))}
          {CAMPOS.map(([clave, etiqueta, catalogo]) => (
            <label key={clave}>
              {etiqueta}
              <select name={clave} defaultValue={filtros[clave] ?? ""}>
                <option value="">Todos</option>
                {resultado[catalogo].map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className="boton-vidrio">Aplicar filtros</button>
          <a href={limpiar}>Limpiar filtros</a>
        </form>
      ) : (
        <p className="apagado" role="status">
          Cargando filtros comerciales…
        </p>
      )}
    </details>
  );
}
