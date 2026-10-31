// Datos ficticios exclusivos de QA y pruebas; no se importan desde la aplicación.
const documentos = [
  {
    id: "101",
    numero: "VTD-DEMO-001",
    tipo: "VTD",
    total: 420,
    cobrado: 420,
    entrega: "En Caja",
    entrega_estado: "EN_CAJA",
    entrega_pendiente: true,
    modo: "Caja + Almacén",
    operacion_id: "demo",
  },
  {
    id: "102",
    numero: "VTA-DEMO-001",
    tipo: "VTA",
    total: 580,
    cobrado: 580,
    entrega: "Venta completada",
  },
  {
    id: "103",
    numero: "VTD-DEMO-002",
    tipo: "VTD",
    total: 840,
    cobrado: 0,
    en_revision: 840,
    entrega: "Pendiente de Almacén",
    entrega_estado: "SOLICITADO",
    entrega_pendiente: true,
    modo: "Caja + Almacén",
  },
  {
    id: "104",
    numero: "VTD-DEMO-003",
    tipo: "VTD",
    total: 1250,
    cobrado: 0,
    pendiente: 1250,
    pago_posterior: true,
    entrega: "Entrega confirmada",
    entrega_estado: "ENTREGADO",
    modo: "Pago posterior autorizado",
  },
  {
    id: "105",
    numero: "VTA-DEMO-002",
    tipo: "VTA",
    total: 200,
    cobrado: 0,
    anulada: true,
    estado: "ANULADA",
    entrega: "Anulada",
  },
].map((v, i) => ({
  estado: "COMPLETADA",
  cliente: i < 2 ? "Cliente de ejemplo A" : "Cliente de ejemplo B",
  sucursal: "Central de ejemplo",
  vendedor: "Responsable de ejemplo",
  creado_en: `2026-10-31T${String(15 - i).padStart(2, "0")}:00:00Z`,
  completado_en: null,
  anulada: false,
  en_revision: 0,
  rechazado: 0,
  saldo_favor: 0,
  pendiente: 0,
  pago_posterior: false,
  entrega_estado: null,
  entrega_pendiente: false,
  retorno_pendiente: false,
  operacion_id: null,
  modo: "Mostrador",
  ...v,
}));
function lista(
  _desde,
  _hasta,
  _filtros,
  tipo = "TODAS",
  estado = "todos",
  pagina = 1,
) {
  const seleccion = documentos.filter(
      (d) => tipo === "TODAS" || d.tipo === tipo,
    ),
    vigentes = seleccion.filter((d) => !d.anulada);
  const filas = seleccion.filter(
    (d) =>
      estado === "todos" ||
      (estado === "entrega" && d.entrega_pendiente) ||
      (estado === "cobro" && d.pendiente > 0) ||
      (estado === "revision" && !d.anulada && d.en_revision > 0) ||
      (estado === "retorno" && d.retorno_pendiente) ||
      (estado === "anulados" && d.anulada),
  );
  const sum = (k) => vigentes.reduce((s, d) => s + d[k], 0);
  return {
    total: filas.length,
    tipos: { TODAS: documentos.length, VTD: 3, VTA: 2 },
    filas: filas.slice((pagina - 1) * 25, pagina * 25),
    resumen: {
      vigentes: vigentes.length,
      importe: sum("total"),
      cobrado: sum("cobrado"),
      en_revision: sum("en_revision"),
      saldo_favor: 0,
      pendiente: sum("pendiente"),
      por_cobrar: vigentes.filter((d) => d.pendiente > 0).length,
      entregas: vigentes.filter((d) => d.entrega_pendiente).length,
      retornos: 0,
      posteriores: vigentes.filter((d) => d.pago_posterior).length,
      anulados: seleccion.filter((d) => d.anulada).length,
    },
  };
}
function expediente(id) {
  const d = documentos.find((d) => d.id === id);
  if (!d) return null;
  return {
    ...d,
    subtotal: d.total,
    descuento: 0,
    notas: null,
    pago_posterior_motivo: d.pago_posterior
      ? "Cliente realizará el pago por la tarde."
      : null,
    pago_posterior_en: null,
    cajero: d.cobrado ? "Cajero de ejemplo" : null,
    lineas: [
      {
        id: `l${id}`,
        producto_id: "10",
        descripcion: "Producto de ejemplo",
        presentacion: "Caja",
        cantidad: 12,
        cantidad_presentacion: 1,
        unidad: null,
        subtotal: d.total,
        precio_unitario: d.total,
      },
    ],
    pagos:
      d.cobrado || d.en_revision
        ? [
            {
              id: `p${id}`,
              metodo: "QR",
              monto: d.cobrado || d.en_revision,
              estado: d.en_revision ? "PENDIENTE" : "VERIFICADO",
              creado_en: d.creado_en,
              referencia: "Referencia de ejemplo",
              verificado_en: null,
            },
          ]
        : [],
    usos_saldo: [],
    cobro_conjunto: ["101", "102"].includes(id)
      ? {
          id: "demo-cobro",
          numero: "CJA-DEMO-001",
          total: 1000,
          creado_en: d.creado_en,
          documentos: documentos
            .slice(0, 2)
            .map((v) => ({
              id: v.id,
              numero: v.numero,
              total: v.total,
              estado: v.estado,
            })),
        }
      : null,
    eventos: [
      {
        id: `venta:${id}`,
        fecha: d.creado_en,
        accion: "Venta registrada",
        actor: d.vendedor,
        detalle: null,
      },
      {
        id: `caja:${id}`,
        fecha: d.creado_en,
        accion: "ENVIAR",
        actor: "Almacenero de ejemplo",
        detalle: { motivo: "Productos enviados a Caja", version: 2 },
      },
    ],
  };
}
module.exports = {
  documentos,
  obtenerListaRetail: async (...args) => lista(...args),
  obtenerExpedienteRetail: async (id) => expediente(id),
  lista,
  expediente,
};
