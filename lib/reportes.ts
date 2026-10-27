import {
  obtenerCatalogos,
  obtenerCobranza,
  obtenerMargen,
  obtenerMetas,
  rpc,
  type Detalle,
  type Inventario,
} from "./operativo";
import { leerFiltros, type Parametros } from "./filtros";
import { fechaValida, leerPeriodo } from "./periodo";
import { hoyLaPaz } from "./formato";

export type Celda = string | number | null;
export type Reporte = {
  titulo: string;
  archivo: string;
  notas: string[];
  columnas: { nombre: string; ancho: number; moneda?: boolean }[];
  filas: Celda[][];
};
const TITULOS: Record<string, string> = {
  ventas: "Ventas",
  cobros: "Cobros",
  salidas: "Salidas de almacén",
  cartera: "Partidas por cobrar",
  alertas: "Detalle de alerta",
  inventario: "Inventario disponible",
  margen: "Márgenes estimados",
  cobranza: "Prioridades de cobranza",
  metas: "Metas mensuales",
};
export async function construirReporte(params: Parametros): Promise<Reporte> {
  const tipo = typeof params.tipo === "string" ? params.tipo : "";
  if (!Object.hasOwn(TITULOS, tipo))
    throw new Error("Tipo de reporte inválido.");
  const p = leerPeriodo(params),
    f = leerFiltros(params),
    catalogos = await obtenerCatalogos();
  const notas = [
    `Consultado ${hoyLaPaz()} · America/La_Paz`,
    `Período: ${p.desde} a ${p.hasta}`,
  ];
  const catalogoClaves = {
    sucursal: "sucursales",
    vendedor: "vendedores",
    cliente: "clientes",
    canal: "canales",
    producto: "productos",
  } as const;
  for (const [k, v] of Object.entries(f)) {
    const clave = k as keyof typeof catalogoClaves;
    notas.push(
      `${k}: ${catalogos[catalogoClaves[clave]].find((x) => x.id === v)?.nombre ?? v}`,
    );
  }
  if (Object.keys(f).length)
    notas.push(
      "Cobros retail: documentos completos; cuenta sin atribución comercial excluida al filtrar dimensiones. Cartera: saldo completo de clientes coincidentes.",
    );
  let columnas: Reporte["columnas"] = [],
    filas: Celda[][] = [];
  if (["ventas", "cobros", "salidas", "cartera", "alertas"].includes(tipo)) {
    const alerta = typeof params.alerta === "string" ? params.alerta : "";
    if (
      tipo === "alertas" &&
      ![
        "lineas_rechazadas_cobradas",
        "qr_sin_verificar",
        "salidas_sin_enlace",
        "traslados_en_transito",
        "productos_sin_precio",
        "turnos_abiertos_24h",
        "kardex_vs_stock",
      ].includes(alerta)
    )
      throw new Error("Alerta inválida.");
    const d = await rpc<Detalle>("dash_exportar", {
      p_tipo: tipo,
      p_desde: p.desde,
      p_hasta: p.hasta,
      p_filtros: { ...f, ...(alerta ? { alerta } : {}) },
    });
    columnas = [
      { nombre: "Fecha", ancho: 13 },
      { nombre: "Documento", ancho: 20 },
      { nombre: "Cliente", ancho: 30 },
      { nombre: "Concepto", ancho: 38 },
      { nombre: "Cantidad", ancho: 13 },
      { nombre: "Monto (Bs)", ancho: 17, moneda: true },
      { nombre: "Origen", ancho: 13 },
    ];
    filas = d.filas.map((r) => [
      r.fecha,
      r.documento,
      r.cliente,
      r.concepto,
      r.cantidad,
      r.monto,
      r.origen,
    ]);
    if (tipo === "cartera")
      notas.push(
        "Cartera actual por partida, sin restricción de fechas; no incluye saldos sin documento ni netea anticipos.",
      );
    if (tipo === "alertas")
      notas.push(
        `Alerta: ${alerta}; alcance general, sin filtros de período o comerciales.`,
      );
  } else if (tipo === "inventario") {
    const i = await rpc<Inventario>("dash_exportar", {
      p_tipo: tipo,
      p_desde: p.desde,
      p_hasta: p.hasta,
      p_filtros: f,
    });
    notas.push(
      "Estado actual. Solo sucursal y producto; reserva global compartida. Cobertura según salidas vigentes de 30 días.",
    );
    columnas = [
      { nombre: "Producto", ancho: 35 },
      { nombre: "Unidad", ancho: 12 },
      { nombre: "Estado", ancho: 18 },
      { nombre: "Físico", ancho: 12 },
      { nombre: "Reserva global", ancho: 15 },
      { nombre: "Disponible", ancho: 12 },
      { nombre: "Mínimo", ancho: 10 },
      { nombre: "Reorden", ancho: 10 },
      { nombre: "Tránsito", ancho: 10 },
      { nombre: "Cobertura días", ancho: 15 },
    ];
    filas = i.filas.map((r) => [
      r.producto,
      r.unidad,
      r.estado,
      r.fisico,
      r.reservado_global,
      r.disponible,
      r.minimo,
      r.reorden,
      r.transito,
      r.cobertura_dias,
    ]);
  } else if (tipo === "margen") {
    const m = await obtenerMargen(p.desde, p.hasta, f);
    notas.push(
      "Costo de referencia vigente por unidad base. Utilidad y margen solo sobre ventas con costo. No incluye gastos, impuestos o comisiones.",
    );
    notas.push(`Líneas sin costo: ${m.lineas_sin_costo}`);
    columnas = [
      { nombre: "Dimensión", ancho: 15 },
      { nombre: "Grupo", ancho: 35 },
      { nombre: "Vendido (Bs)", ancho: 18, moneda: true },
      { nombre: "Con costo (Bs)", ancho: 18, moneda: true },
      { nombre: "Costo (Bs)", ancho: 18, moneda: true },
      { nombre: "Utilidad (Bs)", ancho: 18, moneda: true },
      { nombre: "Margen %", ancho: 14 },
    ];
    filas = m.grupos.map((r) => [
      r.dimension,
      r.nombre,
      r.vendido,
      r.con_costo,
      r.costo,
      r.costo === null ? null : (r.con_costo ?? 0) - r.costo,
      r.costo !== null && r.con_costo
        ? ((r.con_costo - r.costo) / r.con_costo) * 100
        : null,
    ]);
  } else if (tipo === "cobranza") {
    const c = await obtenerCobranza(f);
    notas.push(
      "Cartera actual. Orden: vencido, antigüedad y saldo; no depende del período.",
    );
    columnas = [
      { nombre: "Cliente", ancho: 35 },
      { nombre: "Prioridad", ancho: 15 },
      { nombre: "Saldo (Bs)", ancho: 18, moneda: true },
      { nombre: "Vencido (Bs)", ancho: 18, moneda: true },
      { nombre: "Días vencido", ancho: 15 },
      { nombre: "Último pago", ancho: 20 },
      { nombre: "Sin partida (Bs)", ancho: 18, moneda: true },
      { nombre: "Pagos por verificar", ancho: 18 },
    ];
    filas = c.clientes.map((r) => [
      r.cliente,
      r.prioridad,
      r.saldo,
      r.vencido,
      r.dias_vencido,
      r.ultimo_pago,
      r.sin_partida,
      r.por_verificar,
    ]);
  } else {
    const mes =
      typeof params.mes === "string" && fechaValida(`${params.mes}-01`)
        ? `${params.mes}-01`
        : `${p.hasta.slice(0, 7)}-01`;
    const m = await obtenerMetas(mes, f.sucursal);
    notas.push(
      `Mes completo: ${mes.slice(0, 7)}. Solo se aplican mes y sucursal.`,
    );
    columnas = [
      { nombre: "Indicador", ancho: 25 },
      { nombre: "Actual (Bs)", ancho: 20, moneda: true },
      { nombre: "Objetivo (Bs)", ancho: 20, moneda: true },
      { nombre: "Falta (Bs)", ancho: 20, moneda: true },
      { nombre: "Avance %", ancho: 18 },
    ];
    filas = (["ventas", "cobranza"] as const).map((k) => [
      k,
      m[k],
      m.meta?.[k] ?? null,
      m.meta?.[k] ? Math.max(0, m.meta[k] - m[k]) : null,
      m.meta?.[k] ? (m[k] / m.meta[k]) * 100 : null,
    ]);
  }
  return {
    titulo: TITULOS[tipo],
    archivo: `cation-${tipo}-${hoyLaPaz()}`,
    notas,
    columnas,
    filas,
  };
}
