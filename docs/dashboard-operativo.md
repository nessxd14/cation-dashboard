# Dashboard operativo

Implementado el 26 de octubre de 2026. La Chismosa conserva su implementación anterior.

## Pantallas

- `/detalle`: documentos de ventas, cobros, salidas, partidas y alertas; 50 filas por página. Los totales incluyen todo el resultado filtrado.
- `/inventario`: físico vendible, reserva global, disponibilidad, mínimos, reorden, tránsito y ubicaciones. La cobertura usa las salidas vigentes de los últimos 30 días.
- `/margen`: margen bruto estimado por producto, canal o vendedor, cobertura de costos e histórico de costos de referencia.
- `/metas`: objetivos mensuales compartidos por todas las cuentas autorizadas, generales o por sucursal; avance, faltante y proyección por días calendario.
- `/cobranza`: saldo actual, vencido, último pago y prioridad; acceso a las partidas de cada cliente.

Los módulos existentes conservan sus indicadores y disponen de filtros comunes, actualización manual o cada 1/5 minutos y exportación. Los filtros comerciales están plegados al entrar y se abren automáticamente cuando hay filtros activos.

## Reglas de filtros y cifras

- El período máximo es de **400 días inclusivos**. Fechas inexistentes, invertidas o excesivas muestran un aviso y vuelven a los últimos 30 días.
- Ventas filtra líneas por sucursal, vendedor, cliente, canal y producto. En pedidos la sucursal es la de origen de la línea; si falta, se usa la sucursal del perfil creador. Los registros sin atribución no se inventan ni se asignan a una sucursal al filtrarla.
- Cobros retail filtra documentos coincidentes completos. No prorratea pagos de una venta entre productos. Pagos generales a cuenta solo tienen cliente; quedan fuera al seleccionar sucursal, vendedor, canal o producto.
- Cartera conserva el saldo completo de los clientes coincidentes; es una foto actual, no histórica. Las partidas no tienen por qué sumar la cartera neta: existen anticipos y saldos sin documento.
- Caja, cotizaciones, comisiones y salud mantienen alcance general, indicado en pantalla. Traslados e inventario físico admiten sucursal y producto.
- Disponible = máximo de cero y el menor entre físico de la selección y físico global menos reservas globales. No se duplican reservas por sucursal ni se suman unidades de productos diferentes en una cifra general.
- El mínimo y el punto de reorden pertenecen al catálogo general del producto. La cobertura es orientativa y no considera una llegada futura como existencia disponible.
- Las salidas anuladas o revertidas se excluyen de los indicadores vigentes.
- El costo de referencia se registra por **unidad base y fecha de vigencia**. No modifica compras, precios ni contabilidad. La utilidad solo considera ventas con costo vigente. Es una estimación bruta y no incluye gastos operativos, impuestos ni comisiones. Sin costos, se muestra cobertura faltante y utilidad desconocida.
- Las metas usan el mes completo y la sucursal; los demás filtros no cambian su ámbito. Cero significa objetivo sin definir. No se precargaron metas ni costos ficticios.

## Exportación

`/exportar?tipo=ventas&formato=xlsx` y `formato=pdf` aceptan los mismos filtros. También existen `cobros`, `salidas`, `cartera`, `alertas`, `inventario`, `margen`, `cobranza` y `metas`.

La exportación de documentos e inventario se calcula en un solo snapshot de base; incluye todas las páginas, con límite explícito de 100.000 registros. Los archivos incluyen alcance y filtros. Excel conserva tipos numéricos y textos sin ejecutarlos como fórmulas. PDF repite encabezados y pagina textos extensos. Las respuestas son privadas y no se almacenan en caché.

## Acceso y cambios en base

Migraciones:

1. `20261027002022_dashboard_operativo.sql`: RPC nuevas, variantes filtradas y configuración privada.
2. `20261027004705_dashboard_configuracion_privada.sql`: denegación explícita de acceso directo a la configuración.
3. `20261027005353_dashboard_alcances_consistentes.sql`: listas de pedidos filtradas y caja con alcance general consistente.

Se aplicaron a Supabase. Las consultas antiguas de dos argumentos se conservan. La aplicación usa las variantes con `p_filtros`.

Las tablas nuevas `analitica.meta` y `analitica.costo_producto` tienen RLS, políticas que deniegan acceso directo y ningún permiso de tabla para `anon` o `authenticated`. Las únicas escrituras son mediante RPC que exigen `dash_acceso()` y validan datos. Las implementaciones privilegiadas están en el esquema privado; las funciones expuestas son `SECURITY INVOKER`. No se modificaron tablas operativas ni código de La Chismosa.

## Aplicaciones de origen

Variables del servidor opcionales:

```dotenv
SELLER_URL=https://seller-gilt.vercel.app
ALMACEN_URL=https://almacen-cation.vercel.app
CONCILIADOR_URL=
```

Seller y Almacén tienen los dominios confirmados como valores por defecto. Seller abre su aplicación; Almacén admite enlaces a pedido, producto y traslado. Completar `CONCILIADOR_URL` habilita el enlace directo a `/clientes/:id`. Mientras tanto las partidas están disponibles dentro del propio dashboard.

## Verificación

- `npm test`: fechas, persistencia de filtros, renovación de cookies, validación de configuración, acceso a exportaciones, archivos Excel/PDF completos y paginación del PDF.
- `npm run typecheck` y `npm run build`.
- `tests/base.sql`, dentro de una transacción con aislamiento repetible y **ROLLBACK**: siete combinaciones de filtros, totales entre módulos y detalles, permisos, inventario, exportación completa, metas y costos históricos. Nunca conserva los datos de prueba.
- `node scripts/vista-qa.cjs`: revisión local en el puerto 3208 con datos ficticios, sin autenticación ni escrituras a Supabase. Las rutas `/movil?pagina=inventario` y equivalentes permiten revisar ancho móvil. Este servidor no forma parte de la aplicación.
- Next.js actualizado al parche 15.5.28; overrides de PostCSS y uuid verificados con auditoría de dependencias.

El código está vinculado al repositorio `nessxd14/cation-dashboard`. Las migraciones de Supabase están aplicadas. El despliegue Vercel de la aplicación se configura mediante el flujo habitual del repositorio.
