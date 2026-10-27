export type Parametros = Record<string, string | string[] | undefined>;
export const CLAVES_FILTRO = [
  "sucursal",
  "vendedor",
  "cliente",
  "canal",
  "producto",
] as const;
export type Filtros = Partial<Record<(typeof CLAVES_FILTRO)[number], string>>;
export type Catalogos = Record<
  "sucursales" | "vendedores" | "clientes" | "canales" | "productos",
  { id: string; nombre: string }[]
>;

export function leerFiltros(params: Parametros): Filtros {
  return Object.fromEntries(
    CLAVES_FILTRO.flatMap((clave) => {
      const valor = params[clave];
      if (typeof valor !== "string" || !valor.trim() || valor.length > 200)
        return [];
      if (
        ["sucursal", "cliente", "producto"].includes(clave) &&
        !/^[1-9]\d{0,14}$/.test(valor)
      )
        return [];
      return [[clave, valor.trim()]];
    }),
  );
}

export function consultaComun(params: Parametros): URLSearchParams {
  const query = new URLSearchParams(leerFiltros(params));
  for (const clave of ["p", "desde", "hasta"]) {
    if (typeof params[clave] === "string")
      query.set(clave, params[clave] as string);
  }
  return query;
}

export function enlace(
  ruta: string,
  params: Parametros,
  extras: Record<string, string> = {},
): string {
  const q = consultaComun(params);
  for (const [k, v] of Object.entries(extras)) q.set(k, v);
  return `${ruta}?${q}`;
}
