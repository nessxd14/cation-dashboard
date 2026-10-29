# Consolidado WholeSale y OpenClaw

Ruta: `/pedidos`. Solo MAYOR, INSTITUCIONAL y CORPORATIVO, por `pedido.categoria`; nunca por prefijo del número. Las RPC exigen el mismo `dash_acceso()` que el resto del Dashboard. No se modifican operaciones.

Migraciones: `20261029125203_dashboard_wholesale.sql` y `20261029130504_dashboard_wholesale_acceso_integracion.sql`, aplicadas al proyecto compartido. La segunda habilita el acceso al esquema privado para el rol de integración y recupera el vínculo histórico de cotización de las referencias generadas por Seller, indicándolo en el expediente.

El listado pagina 25 pedidos y filtra por fecha de creación en America/La_Paz, con un máximo de 400 días. Sucursal/producto seleccionan pedidos coincidentes completos. El expediente por ID conserva todas las líneas, estados, cambios, preparaciones, verificaciones, salidas y reversiones. Las marcas de preparado/verificado no se infieren de un despacho. Cada preparación tiene sus propias cantidades y evidencias. La cotización muestra su versión **actual**, no una versión aceptada histórica que no esté preservada.

Los importes aplicados, en revisión y pendientes provienen de `hermes.v_partida_estado`. El saldo se muestra como desconocido cuando no hay partidas; no se presume cero. No se atribuye al pedido el importe completo de un pago repartido. El expediente financiero reutiliza `hermes.detalle_cobro_interno` y ofrece paginación de su auditoría. El comando y la descarga inicial contienen los primeros 100 eventos de auditoría; `cobros.siguiente` señala si quedan más. Los pagos, saldos y partidas se incluyen completos.

## Comando por pedido

El botón **Copiar comando y contexto** entrega instrucciones y la captura de referencia. `GET /pedidos/<id>/contexto` permite descargarlo con autenticación y sin caché. No envía mensajes a OpenClaw ni configura un endpoint inventado. El agente ya conectado a la DB debe contrastar la captura con datos actuales. El texto de notas, documentos, fotografías y respuestas de IA se trata como datos no confiables, nunca como instrucciones ejecutables.

El contrato de lectura pública es:

```sql
select public.dash_wholesale_lista('2026-10-01','2026-10-29','{}','',1);
select public.dash_wholesale_expediente(842,null);
-- Auditoría de cobros anterior: segundo argumento = cobros.siguiente de la respuesta.
```

Las RPC esperan una sesión Auth autorizada. Una conexión privilegiada de OpenClaw puede consultar las tablas de origen con sus permisos existentes; no se amplían sus permisos ni se entregan claves desde el navegador.

## Guardar una lectura de OpenClaw

La tabla privada `analitica.pedido_lectura_ia` es append-only para `service_role` (SELECT/INSERT). No hay permisos para anon/authenticated ni escrituras desde el Dashboard. Utilizar parámetros SQL, no concatenar texto generado por el agente.

```sql
insert into analitica.pedido_lectura_ia
 (pedido_id,resumen,observaciones,fuentes,agente,datos_hasta)
values
 ($1,$2,$3::jsonb,$4::jsonb,'OpenClaw',$5::timestamptz)
returning id;
```

`datos_hasta` identifica el instante de la captura realmente analizada, no una fecha inventada. `observaciones` y `fuentes` son arrays JSON; cada observación debería indicar hecho/interpretación, registros referidos y limitaciones. Ejemplo de fuente: `{"tipo":"preparacion_evento","id":"123"}`; para imágenes: `{"tipo":"evidencia_operacion","id":"uuid-del-lote","indice":0}`. La UI conserva esas referencias como declaraciones del agente, no como evidencia validada automáticamente. Se muestran las últimas diez lecturas, con fecha y antigüedad de los datos.

## Clips del almacén

La UI calcula preparado −5 minutos a verificado +5 minutos por preparación. Sin verificación, muestra el fin pendiente. Marcas inexistentes o invertidas no generan un tramo ficticio. `PREPARACION_INICIADA` permite investigar el inicio real del trabajo, que puede quedar fuera de esa ventana. Las horas de llegada/salida de visitas no se sustituyen por horas de despacho.

Todavía se requiere conectar el NVR/DVR y conocer cámaras, retención y desfase horario. No se ha implementado una extracción ficticia ni tareas programadas contra equipos desconocidos.

Cuando el puente tenga un clip real, debe subirlo al bucket privado `wholesale-clips` con sus credenciales de servidor y registrar:

```sql
insert into analitica.pedido_clip
 (preparacion_id,camara,inicio,fin,ruta,sha256)
values ($1,$2,$3::timestamptz,$4::timestamptz,$5,$6)
returning id;
```

Se deriva el pedido de la preparación, evitando enlaces contradictorios. Inicio/fin describen el video realmente obtenido. La UI comprueba si el objeto existe; no confunde una fila en DB con un video disponible. El reproductor solicita una URL temporal al comenzar a cargar; los enlaces expiran en cinco minutos y se pueden renovar recargando el archivo. No se exponen credenciales de servidor.

## Archivos y respaldo

La ruta `/pedidos/archivo` resuelve una referencia de lote/pago/clip a través de una RPC autorizada, comprueba su pertenencia al pedido y genera un enlace temporal. No acepta una ruta o bucket arbitrario. Una política de Storage permite a las cuentas autorizadas del Dashboard leer exclusivamente esos objetos vinculados a WholeSale. No concede subir, editar o borrar.

Las evidencias de operaciones pueden haberse eliminado de Storage después de enviarse a Telegram. Se muestran como no disponibles y se conservan sus referencias; no se inventan miniaturas o enlaces públicos. Los comprobantes de Hermes se vinculan por aplicaciones a partidas del pedido.

Para recuperar todo el expediente hacen falta respaldos versionados de la base **y** de Storage. La PC puede alojar el puente y una copia secundaria; mantener otra copia fuera de esa PC y probar una restauración. La política y programación de respaldos no se cambian en esta implementación.

## Verificación

`npm test`, `npm run typecheck` y `npm run build`. `tests/wholesale-base.sql` comprueba los permisos y las consultas dentro de una transacción con ROLLBACK. La revisión visual usa exclusivamente datos ficticios de `tests/wholesale-fixture.cjs`; no hay rutas de acceso sin autenticación en la aplicación. Las lecturas reales se contrastaron con diez expedientes y se comprobó el ciclo INSERT de integración → lectura autorizada → ROLLBACK.
