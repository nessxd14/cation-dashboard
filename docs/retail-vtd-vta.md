# Ventas retail · VTD / VTA

Ruta `/retail`, disponible para las mismas cuentas autorizadas del Dashboard. La pantalla es exclusivamente de lectura; no cambia ventas, stock, cobros, entregas ni permisos de operación.

## Consulta

Pestañas Todas, VTD (Almacén) y VTA (Mostrador), período en America/La_Paz, filtros comerciales y 25 documentos por página. Los filtros de sucursal, vendedor, cliente, canal y producto seleccionan documentos completos: no recortan productos ni prorratean cobros. La clave de vendedor coincide con el catálogo común. Los canales de WholeSale no producen documentos retail.

VTD se identifica por su número registrado `VTD-` o la ubicación histórica `VENTAS DIRECTAS`; las demás ventas de `public.venta` son VTA. Se incluyen abiertas, completadas y anuladas. La categoría comercial no se deduce de un pedido ni se mezclan las tablas de pedidos WholeSale.

El filtro de estado limita la lista: entregas pendientes, saldo pendiente, pago en revisión, retorno pendiente o anulaciones. Los indicadores y contadores corresponden a todos los documentos del tipo, período y filtros comerciales seleccionados; no solamente a la página o al estado de la lista. Cambiar período conserva tipo y estado. Seleccionar otro tipo o estado vuelve a la primera página y cierra la selección anterior.

## Importes

- **Importe vigente:** total de documentos no anulados, incluidas ventas abiertas. Se diferencia del indicador general de vendido del Dashboard, que mantiene sus reglas anteriores. Se usa el total del documento, con su descuento.
- **Cobrado aplicado:** exclusivamente `venta_pago` NO_APLICA / VERIFICADO, agregado por venta. Los pagos PENDIENTE se muestran como en revisión y los RECHAZADO no cubren el saldo.
- **Saldo a favor:** aplicaciones no anuladas de `saldo_cliente_uso`, separado del dinero cobrado.
- **Saldo pendiente:** máximo de cero y total menos cobro confirmado, pagos en revisión y saldo a favor vigente. Es la parte sin pago registrado; lo que espera verificación se muestra aparte.
- Las ventas anuladas se excluyen de todos los importes vigentes. Su expediente conserva pagos y reversiones como historial y no presume que se devolvió el dinero.

Los comprobantes `cobro_caja` vinculan VTA y VTD por los IDs del array `documento.ventas`. El total conjunto se muestra una vez en el expediente como referencia. Nunca se suma ese total a los pagos ni se asigna íntegro a una venta. Cada documento mantiene su estado de entrega. Los importes actuales de documentos vinculados pueden diferir del comprobante original tras un ajuste o anulación.

## Expediente

Productos, presentación, cantidades, importes, pagos, estados de verificación, aplicaciones y reversiones de saldo, responsables, autorización de pago posterior y eventos reales. Caja + Almacén aporta sus estados de envío, entrega y retorno. Sin ese vínculo se muestra “Venta completada”, sin afirmar una confirmación independiente de entrega. No se inventan marcas de preparación o verificación.

El cajero del cobro proviene del comprobante o del turno de su movimiento de cobro; no se usa el turno de creación como sustituto. Notas y motivos se renderizan como texto y nunca se ejecutan. Los enlaces a documentos de un cobro conjunto conservan los filtros de la lista, aunque el detalle esté fuera de ellos; el expediente siempre describe el documento elegido.

## Base y verificación

Funciones públicas `dash_retail_lista` y `dash_retail_expediente` SECURITY INVOKER, con motores privados en `analitica` que exigen `auth.uid()` y `dash_acceso()`. El helper no tiene permisos de ejecución directa para clientes. No se amplían permisos de tablas. Las migraciones se registran con la versión devuelta por Supabase.

`tests/retail-base.sql` comprueba lectura autenticada, denegación de cuentas no autorizadas y anon, período máximo, importes contra documentos reales, filtros, separación VTD/VTA, lista contra expediente y pagos confirmados sin duplicación, dentro de una transacción con ROLLBACK. `tests/retail.test.cjs` cubre navegación, errores, estados financieros y renderizado seguro. La revisión local `/retail` y `/movil?pagina=retail` de `scripts/vista-qa.cjs` usa exclusivamente `tests/retail-fixture.cjs`, sin autenticación ni acceso a la base.

El helper planifica cada consulta con parámetros vinculados para que el optimizador conozca los filtros efectivos. La consulta con el rango máximo de 400 días tardó aproximadamente 167 ms y un expediente 93 ms en la comprobación autenticada del 31 de octubre de 2026, dentro del límite de 8 segundos. Son mediciones de esta base, no una garantía de tiempo bajo otra carga. No se cambió el límite de tiempo ni se agregaron índices a tablas operativas.
