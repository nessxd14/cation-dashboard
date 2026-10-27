/** Forma del JSON que devuelve public.dash_resumen(desde, hasta). */
export type Resumen = {
  periodo: { desde: string; hasta: string; dias: number; prev_desde: string; prev_hasta: string };
  vendido: {
    total: number;
    prev: number;
    pedidos: number;
    ventas_retail: number;
    por_canal: { canal: string; monto: number }[];
  };
  cobrado: {
    total: number;
    prev: number;
    retail: number;
    cuenta: number;
    qr_sin_verificar: number;
    por_medio: { medio: string; monto: number }[];
  };
  egresos_caja: { tipo: string; monto: number }[];
  cartera: { total: number; clientes: number; top: { cliente: string; saldo: number }[] };
  salidas: {
    valor_total: number;
    por_origen: { origen: string; unidades: number; valor: number | null }[];
  };
  serie: { fecha: string; pedidos: number; retail: number }[];
  top_productos: { descripcion: string; monto: number }[];
  turnos: {
    id: number;
    estado: "ABIERTA" | "CERRADA" | "EN_REVISION";
    abierta_en: string;
    cajero: string;
    diferencia: number | null;
  }[];
  hoy: {
    fecha: string;
    vendido: number;
    turno_abierto: { id: number; cajero: string } | null;
    pedidos_abiertos: number;
    lineas_por_despachar: number;
    por_comprar: number;
  };
};

/** Un indicador de public.dash_salud(). */
export type IndicadorSalud = {
  clave: string;
  nivel: "ok" | "medio" | "alto";
  titulo: string;
  detalle: string;
  valor: number;
  unidad: "Bs" | null;
};

/** Forma del JSON de public.dash_ventas(desde, hasta). */
export type Ventas = {
  periodo: { desde: string; hasta: string; dias: number };
  total: number;
  prev: number;
  ventas_retail: number;
  pedidos: number;
  ticket_retail: number;
  ticket_pedido: number;
  por_canal: { canal: string; docs: number; monto: number; ticket: number }[];
  entrega: { vendido: number; entregado: number; pedidos_completos: number; pedidos: number };
  por_vendedor: { vendedor: string; docs: number; monto: number }[];
  top_clientes: { cliente: string; docs: number; monto: number }[];
  top_productos: { descripcion: string; cantidad: number; monto: number }[];
  cotizaciones: { creadas: number; convertidas: number; monto: number; monto_convertido: number };
  pendientes: { numero: string; cliente: string; creado: string; vendido: number; pendiente: number }[];
};

/** Forma del JSON de public.dash_almacen(desde, hasta). */
export type Almacen = {
  periodo: { desde: string; hasta: string; dias: number };
  salidas_valor: number;
  salidas_movimientos: number;
  entradas_unidades: number;
  ajustes_neto: number;
  por_origen: { origen: string; movimientos: number; unidades: number; valor: number | null }[];
  serie: { fecha: string; despacho: number; retail: number }[];
  despacho: {
    pedidos_completados: number;
    horas_mediana: number | null;
    pedidos_abiertos: number;
    lineas_por_despachar: number;
    atrasados: { numero: string; cliente: string; dias: number; lineas: number }[];
  };
  por_comprar: { total: number; items: { descripcion: string; cantidad: number; dias: number; origen: string | null }[] };
  traslados_en_transito: { total: number; items: { numero: string; despachado: string | null; dias: number; lineas: number }[] };
  sin_movimiento: { total: number; items: { producto: string; stock: number }[] };
  top_salidas: { producto: string; unidades: number; valor: number | null }[];
};

/** Forma del JSON de public.dash_finanzas(desde, hasta). */
export type Finanzas = {
  periodo: { desde: string; hasta: string; dias: number };
  cobranza: {
    total: number;
    prev: number;
    retail: number;
    cuenta: number;
    por_medio: { medio: string; monto: number; n: number }[];
    serie: { fecha: string; cuenta: number; retail: number }[];
    por_verificar: { n: number; monto: number };
  };
  cartera: {
    total: number;
    clientes: number;
    vencido: number;
    sin_reloj: number;
    sin_partida: number;
    antiguedad: { tramo: string; monto: number; partidas: number }[];
    clientes_top: {
      cliente: string;
      saldo: number;
      vencido: number;
      dias_vencido: number | null;
      ultimo_pago: string | null;
      situacion: string | null;
    }[];
  };
  caja: {
    turnos: number;
    sobrante: number;
    faltante: number;
    con_diferencia: number;
    lista: {
      id: number;
      cajero: string;
      estado: "ABIERTA" | "CERRADA" | "EN_REVISION";
      abierta: string;
      cerrada: string | null;
      diferencia: number | null;
      revisada_por: string | null;
      nota: string | null;
    }[];
    gastos: { aprobado: number; pendiente: number; rechazado: number; n_pendiente: number };
    remesas: number;
    inyecciones: number;
  };
  faltantes: { estado: string; n: number; monto: number }[];
  comisiones: {
    devengadas: number;
    potenciales: number;
    liquidadas: number;
    por_vendedor: { vendedor: string; monto: number; docs: number }[];
  };
};
