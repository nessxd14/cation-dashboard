-- Ventas retail: documentos completos, cobros aplicados y seguimiento real.
-- Solo funciones de lectura. Conserva las reglas de las pantallas existentes.
create function analitica.retail_documentos(p_desde date,p_hasta date,p_filtros jsonb,p_venta bigint default null)
returns setof jsonb language sql stable set search_path='' as $$
with ventas as materialized (
 select v.*,case when v.numero like 'VTD-%' or u.codigo_zona='VENTAS DIRECTAS' then 'VTD' else 'VTA' end tipo,
 coalesce(c.nombre,'Consumidor final') cliente,coalesce(s.nombre,'Sin sucursal') sucursal,
 coalesce(p.nombre,v.creado_por,'Sin responsable') vendedor
 from public.venta v
 left join public.ubicacion u on u.id=v.ubicacion_id
 left join public.sucursal s on s.id=u.sucursal_id
 left join public.cliente c on c.id=v.cliente_id
 left join public.perfil p on p.id=v.vendedor_id
 where v.creado_en >= (p_desde::timestamp at time zone 'America/La_Paz')
 and v.creado_en < ((p_hasta+1)::timestamp at time zone 'America/La_Paz')
 and (p_venta is null or v.id=p_venta)
 and (not p_filtros ? 'sucursal' or u.sucursal_id::text=p_filtros->>'sucursal')
 and (not p_filtros ? 'cliente' or v.cliente_id::text=p_filtros->>'cliente')
 and (not p_filtros ? 'vendedor' or coalesce(v.vendedor_id::text,v.creado_por)=p_filtros->>'vendedor')
 and (not p_filtros ? 'producto' or exists(select 1 from public.venta_linea l where l.venta_id=v.id and l.producto_id::text=p_filtros->>'producto'))
 and (not p_filtros ? 'canal' or (case when v.numero like 'VTD-%' or u.codigo_zona='VENTAS DIRECTAS' then 'VTD' else 'MOSTRADOR' end)=p_filtros->>'canal')
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
 'entrega_pendiente',(v.estado::text<>'ANULADA' and (d.estado in ('SOLICITADO','EN_CAJA') or (d.estado is null and v.estado::text='ABIERTA'))),
 'retorno_pendiente',coalesce(d.estado='RETORNO_PENDIENTE',false),'operacion_id',d.operacion_id::text,
 'modo',case when d.venta_id is not null then 'Caja + Almacén' when v.pago_posterior then 'Pago posterior autorizado'
 when v.tipo='VTA' then 'Mostrador' when coalesce(p.cobrado,0)+coalesce(p.revision,0)+coalesce(s.monto,0)>0 then 'Con pago registrado' else 'Sin pago registrado' end
)
from ventas v left join pagos p on p.venta_id=v.id left join saldos s on s.venta_id=v.id
left join public.caja_operacion_vtd d on d.venta_id=v.id;
$$;
revoke all on function analitica.retail_documentos(date,date,jsonb,bigint) from public,anon,authenticated;

create function analitica.retail_lista(p_desde date,p_hasta date,p_filtros jsonb,p_tipo text,p_estado text,p_pagina integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>399
 or p_filtros is null or jsonb_typeof(p_filtros)<>'object' or octet_length(p_filtros::text)>4000
 or p_tipo is null or p_tipo not in ('TODAS','VTD','VTA') or p_estado is null or p_estado not in ('todos','entrega','cobro','revision','retorno','anulados')
 or p_pagina is null or p_pagina<1 or p_pagina>100000 then raise exception 'Filtros retail inválidos' using errcode='22023'; end if;
 with documentos as materialized(select d from analitica.retail_documentos(p_desde,p_hasta,p_filtros) d),
 seleccion as materialized(select d from documentos where p_tipo='TODAS' or d->>'tipo'=p_tipo),
 filtrados as materialized(select d from seleccion where p_estado='todos'
 or (p_estado='entrega' and (d->>'entrega_pendiente')::boolean)
 or (p_estado='retorno' and (d->>'retorno_pendiente')::boolean)
 or (p_estado='cobro' and (d->>'pendiente')::numeric>0)
 or (p_estado='revision' and not (d->>'anulada')::boolean and (d->>'en_revision')::numeric>0)
 or (p_estado='anulados' and (d->>'anulada')::boolean))
 select jsonb_build_object(
 'total',(select count(*) from filtrados),
 'tipos',(select jsonb_build_object('TODAS',count(*),'VTD',count(*) filter(where d->>'tipo'='VTD'),'VTA',count(*) filter(where d->>'tipo'='VTA')) from documentos),
 'resumen',(select jsonb_build_object(
 'vigentes',count(*) filter(where not (d->>'anulada')::boolean),
 'importe',coalesce(sum((d->>'total')::numeric) filter(where not (d->>'anulada')::boolean),0),
 'cobrado',coalesce(sum((d->>'cobrado')::numeric) filter(where not (d->>'anulada')::boolean),0),
 'en_revision',coalesce(sum((d->>'en_revision')::numeric) filter(where not (d->>'anulada')::boolean),0),
 'saldo_favor',coalesce(sum((d->>'saldo_favor')::numeric) filter(where not (d->>'anulada')::boolean),0),
 'pendiente',coalesce(sum((d->>'pendiente')::numeric),0),
 'por_cobrar',count(*) filter(where (d->>'pendiente')::numeric>0),
 'entregas',count(*) filter(where (d->>'entrega_pendiente')::boolean),
 'retornos',count(*) filter(where (d->>'retorno_pendiente')::boolean),
 'posteriores',count(*) filter(where not (d->>'anulada')::boolean and (d->>'pago_posterior')::boolean),
 'anulados',count(*) filter(where (d->>'anulada')::boolean)) from seleccion),
 'filas',(select coalesce(jsonb_agg(d order by d->>'creado_en' desc,(d->>'id')::bigint desc),'[]') from
 (select d from filtrados order by d->>'creado_en' desc,(d->>'id')::bigint desc limit 25 offset (p_pagina-1)*25) pagina)
 ) into r;
 return r;
end $$;

create function analitica.retail_expediente(p_venta bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; fecha date; recibo record;
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 if p_venta is null or p_venta<1 then raise exception 'Documento inválido' using errcode='22023'; end if;
 select (creado_en at time zone 'America/La_Paz')::date into fecha from public.venta where id=p_venta;
 if not found then raise no_data_found using message='Venta no encontrada'; end if;
 select d into r from analitica.retail_documentos(fecha,fecha,'{}',p_venta) d;
 select c.id,c.numero,c.documento,c.sesion_id,c.actor_id,c.creado_en into recibo from public.cobro_caja c
 where c.documento->'ventas' @> jsonb_build_array(p_venta) order by c.creado_en desc,c.id desc limit 1;
 r:=r||jsonb_build_object(
 'subtotal',(select subtotal from public.venta where id=p_venta),
 'descuento',(select descuento_total from public.venta where id=p_venta),
 'notas',(select notas from public.venta where id=p_venta),
 'pago_posterior_motivo',(select pago_posterior_motivo from public.venta where id=p_venta),
 'pago_posterior_en',(select pago_posterior_en from public.venta where id=p_venta),
 'lineas',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id::text,'producto_id',l.producto_id::text,
 'descripcion',coalesce(nullif(l.descripcion,''),p.nombre,'Sin descripción'),'presentacion',pr.nombre,
 'cantidad',l.cantidad,'cantidad_presentacion',l.cantidad_presentacion,'unidad',l.unidad_medida,
 'subtotal',l.subtotal,'precio_unitario',l.precio_unitario) order by l.id),'[]') from public.venta_linea l
 left join public.producto p on p.id=l.producto_id left join public.presentacion pr on pr.id=l.presentacion_id where l.venta_id=p_venta),
 'pagos',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'metodo',metodo,'monto',monto,'estado',estado_verificacion,
 'creado_en',creado_en,'referencia',referencia,'verificado_en',verificado_en) order by creado_en,id),'[]') from public.venta_pago where venta_id=p_venta),
 'usos_saldo',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'monto',monto,'creado_en',creado_en,'anulado_en',anulado_en) order by creado_en,id),'[]') from public.saldo_cliente_uso where venta_id=p_venta),
 'cajero',(select p.nombre from public.perfil p where p.id=coalesce(recibo.actor_id,
 (select s.cajero_id from public.movimiento_caja m join public.sesion_caja s on s.id=m.sesion_caja_id
 where m.venta_id=p_venta and m.tipo::text='VENTA' order by m.creado_en desc,m.id desc limit 1))),
 'cobro_conjunto',case when recibo.id is not null then jsonb_build_object('id',recibo.id::text,'numero',recibo.numero,
 'total',recibo.documento->'total','creado_en',recibo.creado_en,'documentos',(select coalesce(jsonb_agg(jsonb_build_object(
 'id',v.id::text,'numero',coalesce(v.numero,'Venta #'||v.id),'total',v.total,'estado',v.estado) order by v.id),'[]')
 from public.venta v where recibo.documento->'ventas' @> jsonb_build_array(v.id))) end,
 'eventos',(select coalesce(jsonb_agg(e order by e->>'fecha',e->>'id'),'[]') from (
 select jsonb_build_object('id','venta:'||v.id,'fecha',v.creado_en,'accion','Venta registrada','actor',coalesce(p.nombre,v.creado_por),'detalle',null) e
 from public.venta v left join public.perfil p on p.id=v.vendedor_id where v.id=p_venta
 union all select jsonb_build_object('id','completada:'||id,'fecha',completado_en,'accion','Venta completada','actor',null,'detalle',null)
 from public.venta where id=p_venta and completado_en is not null
 union all select jsonb_build_object('id','evento:'||id,'fecha',creado_en,'accion',accion,'actor',usuario,'detalle',motivo)
 from public.venta_evento where venta_id=p_venta
 union all select jsonb_build_object('id','pago:'||id,'fecha',creado_en,'accion','Pago registrado · '||metodo::text,'actor',null,'detalle',monto::text||' Bs · '||estado_verificacion)
 from public.venta_pago where venta_id=p_venta
 union all select jsonb_build_object('id','caja:'||e.id,'fecha',e.creado_en,'accion',e.accion,'actor',p.nombre,'detalle',e.detalle)
 from public.caja_operacion_evento e left join public.perfil p on p.id=e.actor_id
 where e.venta_id=p_venta or (e.venta_id is null and e.operacion_id in(select operacion_id from public.caja_operacion_vtd where venta_id=p_venta))
 union all select jsonb_build_object('id','posterior:'||id,'fecha',pago_posterior_en,'accion','Pago posterior autorizado','actor',pago_posterior_por,'detalle',pago_posterior_motivo)
 from public.venta where id=p_venta and pago_posterior_en is not null
 ) eventos)
 );
 return r;
end $$;

create function public.dash_retail_lista(p_desde date,p_hasta date,p_filtros jsonb,p_tipo text,p_estado text,p_pagina integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 select analitica.retail_lista(p_desde,p_hasta,p_filtros,p_tipo,p_estado,p_pagina) $$;
create function public.dash_retail_expediente(p_venta bigint) returns jsonb
language sql stable security invoker set search_path='' as $$ select analitica.retail_expediente(p_venta) $$;
revoke all on function analitica.retail_lista(date,date,jsonb,text,text,integer),analitica.retail_expediente(bigint),
 public.dash_retail_lista(date,date,jsonb,text,text,integer),public.dash_retail_expediente(bigint) from public,anon;
grant execute on function analitica.retail_lista(date,date,jsonb,text,text,integer),analitica.retail_expediente(bigint),
 public.dash_retail_lista(date,date,jsonb,text,text,integer),public.dash_retail_expediente(bigint) to authenticated,service_role;
notify pgrst,'reload schema';
