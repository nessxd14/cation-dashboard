-- Plan específico para cada combinación de filtros; valores siempre parametrizados.
-- Ventas retail: documentos completos, cobros aplicados y seguimiento real.
-- Solo funciones de lectura. Conserva las reglas de las pantallas existentes.
create or replace function analitica.retail_documentos(p_desde date,p_hasta date,p_filtros jsonb,p_venta bigint default null)
returns setof jsonb language plpgsql stable set search_path='' as $$
begin
 return query execute $consulta$
with ventas as materialized (
 select v.*,case when v.numero like 'VTD-%' or u.codigo_zona='VENTAS DIRECTAS' then 'VTD' else 'VTA' end tipo,
 coalesce(c.nombre,'Consumidor final') cliente,coalesce(s.nombre,'Sin sucursal') sucursal,
 coalesce(p.nombre,v.creado_por,'Sin responsable') vendedor
 from public.venta v
 left join public.ubicacion u on u.id=v.ubicacion_id
 left join public.sucursal s on s.id=u.sucursal_id
 left join public.cliente c on c.id=v.cliente_id
 left join public.perfil p on p.id=v.vendedor_id
 where v.creado_en >= ($1::timestamp at time zone 'America/La_Paz')
 and v.creado_en < (($2+1)::timestamp at time zone 'America/La_Paz')
 and ($4 is null or v.id=$4)
 and (not $3 ? 'sucursal' or u.sucursal_id::text=$3->>'sucursal')
 and (not $3 ? 'cliente' or v.cliente_id::text=$3->>'cliente')
 and (not $3 ? 'vendedor' or coalesce(p.email,p.nombre,v.creado_por)=$3->>'vendedor')
 and (not $3 ? 'producto' or exists(select 1 from public.venta_linea l where l.venta_id=v.id and l.producto_id::text=$3->>'producto'))
 and (not $3 ? 'canal' or (case when v.numero like 'VTD-%' or u.codigo_zona='VENTAS DIRECTAS' then 'VTD' else 'MOSTRADOR' end)=$3->>'canal')
), pagos as (
 select p.venta_id,
 coalesce(sum(p.monto) filter(where p.estado_verificacion in ('NO_APLICA','VERIFICADO')),0) cobrado,
 coalesce(sum(p.monto) filter(where p.estado_verificacion='PENDIENTE'),0) revision,
 coalesce(sum(p.monto) filter(where p.estado_verificacion='RECHAZADO'),0) rechazado
 from public.venta_pago p join ventas v on v.id=p.venta_id group by p.venta_id
), saldos as (
 select s.venta_id,sum(s.monto) monto from public.saldo_cliente_uso s join ventas v on v.id=s.venta_id where s.anulado_en is null group by s.venta_id
)
select jsonb_build_object(
 'id',v.id::text,'numero',coalesce(v.numero,'Venta #'||v.id),'tipo',v.tipo,'estado',v.estado,
 'cliente',v.cliente,'sucursal',v.sucursal,'vendedor',v.vendedor,'creado_en',v.creado_en,
 'completado_en',v.completado_en,'total',v.total,'anulada',v.estado::text='ANULADA',
 'cobrado',coalesce(p.cobrado,0),'en_revision',coalesce(p.revision,0),'rechazado',coalesce(p.rechazado,0),
 'saldo_favor',coalesce(s.monto,0),
 'pendiente',case when v.estado::text='ANULADA' then 0 else greatest(v.total-coalesce(p.cobrado,0)-coalesce(p.revision,0)-coalesce(s.monto,0),0) end,
 'pago_posterior',v.pago_posterior,'entrega_estado',d.estado,
 'entrega',case when d.estado='RETORNO_PENDIENTE' then 'Retorno pendiente' when d.estado='RETORNADO' then 'Retorno recibido'
 when v.estado::text='ANULADA' then 'Anulada' when d.estado='SOLICITADO' then 'Pendiente de Almacén'
 when d.estado='EN_CAJA' then 'En Caja' when d.estado='ENTREGADO' then 'Entrega confirmada'
 when d.estado='CANCELADO' then 'Solicitud cancelada' when v.estado::text='COMPLETADA' then 'Venta completada' else 'Por completar' end,
 'entrega_pendiente',coalesce((v.estado::text<>'ANULADA' and (d.estado in ('SOLICITADO','EN_CAJA') or (d.estado is null and v.estado::text='ABIERTA'))),false),
 'retorno_pendiente',coalesce(d.estado='RETORNO_PENDIENTE',false),'operacion_id',d.operacion_id::text,
 'modo',case when d.venta_id is not null then 'Caja + Almacén' when v.pago_posterior then 'Pago posterior autorizado'
 when v.tipo='VTA' then 'Mostrador' when coalesce(p.cobrado,0)+coalesce(p.revision,0)+coalesce(s.monto,0)>0 then 'Con pago registrado' else 'Sin pago registrado' end
)
from ventas v left join pagos p on p.venta_id=v.id left join saldos s on s.venta_id=v.id
left join public.caja_operacion_vtd d on d.venta_id=v.id;
$consulta$ using p_desde,p_hasta,p_filtros,p_venta;
end $$;
