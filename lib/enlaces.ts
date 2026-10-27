// Las bases son opcionales; no se inventan dominios de producción.
function base(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
export function enlaceOrigen(
  origen: string,
  id: string | null,
  producto?: string | null,
): { href: string; texto: string } | null {
  const almacen =
    base(process.env.ALMACEN_URL) ?? "https://almacen-cation.vercel.app";
  const conciliador = base(process.env.CONCILIADOR_URL);
  const seller =
    base(process.env.SELLER_URL) ?? "https://seller-gilt.vercel.app";
  if (origen === "CUENTA" && id && conciliador)
    return {
      href: `${conciliador}/clientes/${encodeURIComponent(id)}`,
      texto: "Abrir en Conciliador",
    };
  if (origen === "PEDIDO" && id)
    return {
      href: `${almacen}/pedidos/${encodeURIComponent(id)}`,
      texto: "Abrir pedido en Almacén",
    };
  if (origen === "TRASLADO" && id)
    return {
      href: `${almacen}/operaciones/traslados/${encodeURIComponent(id)}`,
      texto: "Abrir traslado en Almacén",
    };
  if (origen === "RETAIL" && seller)
    return { href: seller, texto: "Abrir Seller" };
  if (producto)
    return {
      href: `${almacen}/productos/${encodeURIComponent(producto)}/ficha`,
      texto: "Abrir producto en Almacén",
    };
  return null;
}
