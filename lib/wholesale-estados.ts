import {
  fechaWholesale as fecha,
  dineroWholesale as dinero,
  type Etapa,
  type PedidoWholesale,
} from "./wholesale";

export type TonoEtapa = "verde" | "azul" | "ambar" | "rojo" | "gris";
export type IconoEtapa =
  | "check"
  | "reloj"
  | "parcial"
  | "alerta"
  | "vacio"
  | "cancelado";
export type EstadoEtapa = {
  texto: string;
  tono: TonoEtapa;
  icono: IconoEtapa;
  ayuda: string;
  detalles: string[];
};

const marca = (valor: string | null) =>
  !!valor && Number.isFinite(Date.parse(valor));
const conteo = (valor: number) => Number.isSafeInteger(valor) && valor >= 0;

function cobro(p: PedidoWholesale): EstadoEtapa {
  const estado = (
    texto: string,
    tono: TonoEtapa,
    icono: IconoEtapa,
    ayuda: string,
    detalles: string[] = [],
  ): EstadoEtapa => ({ texto, tono, icono, ayuda, detalles });
  if (!conteo(p.partidas))
    return estado(
      "No disponible",
      "gris",
      "vacio",
      "No se pudo determinar el número de partidas del pedido.",
    );
  if (p.estado === "CANCELADO")
    return p.partidas > 0
      ? estado(
          "Revisar cobro",
          "rojo",
          "alerta",
          "Pedido cancelado con partidas vigentes. Consulta el destino de sus cobros.",
          [
            `${p.partidas} ${p.partidas === 1 ? "partida vigente" : "partidas vigentes"}`,
            `${dinero(p.aplicado)} aplicado`,
            `Saldo: ${dinero(p.saldo)}`,
          ],
        )
      : estado(
          "Cancelado",
          "gris",
          "cancelado",
          "Consulta el historial para conocer el destino del dinero recibido.",
        );
  if (p.partidas === 0)
    return estado(
      "Sin partida",
      "gris",
      "vacio",
      "No hay partidas vigentes vinculadas. Esto no confirma que el pedido esté pagado.",
      ["Saldo no disponible"],
    );
  const importes = [
    p.total,
    p.total_partidas,
    p.aplicado,
    p.saldo,
    p.en_revision,
  ];
  if (importes.some((n) => typeof n !== "number" || !Number.isFinite(n)))
    return estado(
      "No disponible",
      "gris",
      "vacio",
      "Los importes del cobro están incompletos. Consulta las partidas.",
    );
  const total = Math.round(p.total * 100),
    partidas = Math.round(p.total_partidas * 100),
    aplicado = Math.round(p.aplicado * 100),
    saldo = Math.round(p.saldo! * 100),
    revision = Math.round(p.en_revision * 100);
  const detalles = [
    `${dinero(p.aplicado)} aplicado`,
    `Saldo: ${dinero(p.saldo)}`,
  ];
  if (revision > 0) detalles.push(`En revisión: ${dinero(p.en_revision)}`);
  if (
    [total, partidas, aplicado, saldo, revision].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    ) ||
    total !== partidas ||
    aplicado + saldo !== partidas ||
    revision > saldo
  )
    return estado(
      "Revisar cobro",
      "rojo",
      "alerta",
      "Hay diferencias entre los importes del pedido y sus partidas. Abre el detalle del cobro.",
      detalles,
    );
  if (revision > 0)
    return estado(
      "Por verificar",
      "ambar",
      "reloj",
      "Hay importes en revisión; todavía no se consideran pagos confirmados.",
      detalles,
    );
  if (saldo === 0)
    return estado(
      "Saldo cero",
      "verde",
      "check",
      "El saldo agregado de las partidas es cero. Consulta cada partida para confirmar su saldado; no indica una entrega completa.",
      detalles,
    );
  if (aplicado > 0)
    return estado(
      "Abono parcial",
      "azul",
      "parcial",
      "Hay importe aplicado y queda saldo pendiente en las partidas del pedido.",
      detalles,
    );
  return estado(
    "Pendiente",
    "rojo",
    "vacio",
    "Las partidas tienen saldo pendiente y no registran importe aplicado.",
    detalles,
  );
}

/** Presenta los datos del listado; una marca no certifica la cobertura de todas las tandas. */
export function estadosEtapasWholesale(
  p: PedidoWholesale,
): Record<Etapa, EstadoEtapa> {
  const preparado = marca(p.preparado_en),
    verificado = marca(p.verificado_en);
  const lineasValidas =
    conteo(p.lineas_vigentes) &&
    conteo(p.lineas_entregadas) &&
    p.lineas_entregadas <= p.lineas_vigentes;
  const salidasValidas = conteo(p.salidas);
  const completa =
    lineasValidas &&
    p.lineas_vigentes > 0 &&
    p.lineas_entregadas === p.lineas_vigentes &&
    p.salidas > 0;
  return {
    cotizacion: {
      texto: p.cotizacion_id && p.cotizacion ? "Vinculada" : "Sin vínculo",
      tono: p.cotizacion_id && p.cotizacion ? "verde" : "gris",
      icono: p.cotizacion_id && p.cotizacion ? "check" : "vacio",
      ayuda:
        "Indica si el pedido tiene una cotización vinculada; no certifica una versión aceptada histórica.",
      detalles: [
        p.cotizacion || "Sin cotización vinculada",
        ...(marca(p.cotizacion_en) ? [fecha(p.cotizacion_en)] : []),
      ],
    },
    pedido: {
      texto: p.estado === "CANCELADO" ? "Cancelado" : "Registrado",
      tono: p.estado === "CANCELADO" ? "rojo" : "verde",
      icono: p.estado === "CANCELADO" ? "cancelado" : "check",
      ayuda:
        p.estado === "CANCELADO"
          ? "El pedido está cancelado. Su expediente conserva el historial."
          : "El pedido está registrado. Sus pagos y salidas se consultan por separado.",
      detalles: [fecha(p.creado_en)],
    },
    alistado: {
      texto: preparado
        ? "Con preparado"
        : p.preparaciones > 0
          ? "En proceso"
          : "Sin registro",
      tono: preparado ? "verde" : p.preparaciones > 0 ? "azul" : "gris",
      icono: preparado ? "check" : p.preparaciones > 0 ? "reloj" : "vacio",
      ayuda:
        "Indica si hay una marca de preparado. Revisa cada tanda para conocer su estado y cobertura actuales.",
      detalles: [
        ...(p.preparaciones > 0
          ? [
              `${p.preparaciones} ${p.preparaciones === 1 ? "preparación" : "preparaciones"}`,
            ]
          : []),
        ...(preparado ? [`Última: ${fecha(p.preparado_en)}`] : []),
        ...(!preparado && p.preparaciones > 0 && p.ultima_preparacion_estado
          ? [`Última tanda: ${p.ultima_preparacion_estado}`]
          : []),
      ],
    },
    verificacion: {
      texto: verificado ? "Con verificación" : "Sin marca",
      tono: verificado ? "verde" : "gris",
      icono: verificado ? "check" : "vacio",
      ayuda:
        "Una marca confirma un registro de verificación, no que todas las tandas estén verificadas. Consulta el detalle.",
      detalles: [
        verificado
          ? `Última: ${fecha(p.verificado_en)}`
          : "Ver detalle de cada tanda",
      ],
    },
    salida: {
      texto:
        !lineasValidas || !salidasValidas
          ? "No disponible"
          : completa
            ? "Completa"
            : p.salidas > 0
              ? "Parcial"
              : "Sin salidas",
      tono:
        !lineasValidas || !salidasValidas
          ? "gris"
          : completa
            ? "verde"
            : p.salidas > 0
              ? "azul"
              : "gris",
      icono:
        !lineasValidas || !salidasValidas
          ? "vacio"
          : completa
            ? "check"
            : p.salidas > 0
              ? "parcial"
              : "vacio",
      ayuda:
        "Cobertura de las líneas vigentes del pedido. Las salidas revertidas no cuentan como movimientos vigentes.",
      detalles: [
        ...(lineasValidas
          ? [`${p.lineas_entregadas} de ${p.lineas_vigentes} líneas completas`]
          : []),
        ...(salidasValidas
          ? [
              `${p.salidas} ${p.salidas === 1 ? "movimiento vigente" : "movimientos vigentes"}`,
            ]
          : []),
        ...(marca(p.salida_en) ? [`Última: ${fecha(p.salida_en)}`] : []),
      ],
    },
    pago: cobro(p),
  };
}
