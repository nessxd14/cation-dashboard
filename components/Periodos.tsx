import { OPCIONES, type Periodo } from "@/lib/periodo";
import { leerFiltros, consultaComun, type Parametros } from "@/lib/filtros";
import { obtenerCatalogos } from "@/lib/operativo";

/** Selector de período por URL (?p=…). El rango usa un formulario GET simple. */
export async function Periodos({
  periodo,
  ruta,
  params = {},
}: {
  periodo: Periodo;
  ruta: string;
  params?: Parametros;
}) {
  const filtros = leerFiltros(params);
  const extras = Object.fromEntries(
    ["tipo", "alerta", "dimension", "mes"].flatMap((k) =>
      typeof params[k] === "string" ? [[k, params[k] as string]] : [],
    ),
  );
  const catalogos = await obtenerCatalogos();
  return (
    <div className="selector-comun no-imprimir">
      <div
        role="group"
        aria-label="Período"
        className="vidrio periodos"
        style={{ borderRadius: 14 }}
      >
        <div className="periodos-opciones">
          {OPCIONES.map((o) => (
            <a
              key={o.clave}
              href={`${ruta}?${new URLSearchParams({ ...filtros, ...extras, p: o.clave })}`}
              aria-current={periodo.clave === o.clave ? "true" : undefined}
            >
              {o.texto}
            </a>
          ))}
        </div>
        <form method="get" action={ruta} className="rango">
          <input type="hidden" name="p" value="rango" />
          {Object.entries(extras).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {Object.entries(filtros).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input
            type="date"
            name="desde"
            defaultValue={periodo.desde}
            aria-label="Desde"
            min="2000-01-01"
            max="2100-12-31"
            required
          />
          <input
            type="date"
            name="hasta"
            defaultValue={periodo.hasta}
            aria-label="Hasta"
            min="2000-01-01"
            max="2100-12-31"
            required
          />
          <button type="submit">Ver</button>
        </form>
      </div>
      <details
        className="filtros-desplegables"
        open={Object.keys(filtros).length > 0}
      >
        <summary>
          Filtros comerciales
          {Object.keys(filtros).length
            ? ` · ${Object.keys(filtros).length} activos`
            : " · sucursal, vendedor, cliente, canal y producto"}
        </summary>
        <form method="get" action={ruta} className="filtros vidrio">
          {Object.entries(extras).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {[...consultaComun(params)]
            .filter(([k]) => ["p", "desde", "hasta"].includes(k))
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          {(
            [
              ["sucursal", "Sucursal", "sucursales"],
              ["vendedor", "Vendedor", "vendedores"],
              ["cliente", "Cliente", "clientes"],
              ["canal", "Canal", "canales"],
              ["producto", "Producto", "productos"],
            ] as const
          ).map(([clave, label, catalogo]) => (
            <label key={clave}>
              {label}
              <select name={clave} defaultValue={filtros[clave] ?? ""}>
                <option value="">Todos</option>
                {catalogos[catalogo].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className="boton-vidrio">Aplicar filtros</button>
          <a
            href={`${ruta}?${new URLSearchParams({ ...extras, p: periodo.clave, desde: periodo.desde, hasta: periodo.hasta })}`}
          >
            Limpiar filtros
          </a>
        </form>
      </details>
      {periodo.aviso ? (
        <p className="aviso" role="alert">
          {periodo.aviso}
        </p>
      ) : null}
      {Object.keys(filtros).length > 0 ? (
        <p className="panel-sub">
          Ventas: líneas coincidentes. Cobros retail: documento completo; pagos
          a cuenta sin vínculo con sucursal, vendedor, canal o producto quedan
          fuera al usar esos filtros. Cartera: saldo actual completo de los
          clientes coincidentes. Caja, comisiones, cotizaciones y salud
          conservan su alcance general. Inventario físico: solo sucursal y
          producto.
        </p>
      ) : null}
    </div>
  );
}
