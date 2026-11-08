-- Auditoría de solo lectura sobre registros operativos existentes.
create function analitica.auditoria(p_vista text, p_desde date, p_hasta date, p_area text, p_pagina integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  inicio timestamptz;
  fin timestamptz;
  resultado jsonb;
begin
  perform analitica.exigir_acceso();
  if p_vista is null or p_vista not in ('pendientes','eventos')
    or p_area is null or p_area not in ('','Cobranza','Caja','Almacén','Pedidos','Datos')
    or p_pagina is null or p_pagina not between 1 and 100000 then
    raise exception 'Filtros de auditoría inválidos' using errcode='22023';
  end if;
  if p_vista='eventos' then
    perform analitica.validar_periodo(p_desde,p_hasta);
    inicio := p_desde::timestamp at time zone 'America/La_Paz';
    fin := (p_hasta+1)::timestamp at time zone 'America/La_Paz';
  end if;

  with filas(id,area,caso,motivo,fecha,responsable,origen,referencia_id,monto,prioridad) as (
    select 'cuenta:'||c.cliente_id,'Cobranza',c.cliente,
      case when c.partidas_abiertas=1 then '1 partida abierta'
           when c.partidas_abiertas>1 then c.partidas_abiertas||' partidas abiertas'
           else 'Saldo pendiente' end,
      c.ultimo_movimiento_en,null::text,'CUENTA',c.cliente_id::text,c.saldo_confirmado,
      case when c.monto_vencido>0 then 1 else 0 end
    from hermes.v_cliente_cartera c
    where p_vista='pendientes' and p_area in ('','Cobranza') and c.saldo_confirmado>0
    union all
    select 'qr:'||v.id,'Caja',coalesce(v.numero,'Venta #'||v.id),
      case when count(*)=1 then 'QR en revisión' else count(*)||' pagos QR en revisión' end,
      min(vp.creado_en),null,'RETAIL',v.id::text,sum(vp.monto),0
    from public.venta_pago vp join public.venta v on v.id=vp.venta_id
    where p_vista='pendientes' and p_area in ('','Caja')
      and vp.metodo='QR' and vp.estado_verificacion='PENDIENTE' and v.estado='COMPLETADA'
    group by v.id
    union all
    select 'traslado-pendiente:'||t.id,'Almacén',coalesce(t.numero,'Traslado #'||t.id),
      'Recepción de traslado sin registrar',t.despachado_en,t.despachado_por,'TRASLADO',t.id::text,null,0
    from public.solicitud_traslado t
    where p_vista='pendientes' and p_area in ('','Almacén') and t.estado='EN_TRANSITO'
    union all
    select 'recepcion:'||p.id,'Pedidos',coalesce(p.numero,'Pedido #'||p.id),
      'Retiro registrado · recepción del cliente sin registrar',min(r.retirado_en),null,'PEDIDO',p.id::text,null,0
    from evidencia_operacion.retiro r join public.almacen_preparacion a on a.id=r.preparacion_id
    join public.pedido p on p.id=a.pedido_id
    where p_vista='pendientes' and p_area in ('','Pedidos') and r.estado='EN_TRANSPORTE'
      and r.retirado_en is not null and a.estado<>'ANULADO' and p.recibido_en is null
      and p.estado<>'CANCELADO' and p.categoria in ('MAYOR','INSTITUCIONAL','CORPORATIVO')
    group by p.id
    union all
    select f.id,'Datos',f.documento,'Salida de Kardex sin enlace · '||f.concepto,
      f.fecha::timestamp at time zone 'America/La_Paz',null,'DATOS',null,null,0
    from analitica.f_alerta('salidas_sin_enlace') f
    where p_vista='pendientes' and p_area in ('','Datos')
    union all
    select 'pedido-evento:'||e.id,'Pedidos',coalesce(p.numero,'Pedido #'||p.id),
      coalesce(nullif(e.titulo,''),initcap(replace(e.accion,'_',' '))),e.creado_en,e.usuario,
      case when p.categoria in ('MAYOR','INSTITUCIONAL','CORPORATIVO') then 'PEDIDO' else 'PEDIDO_ALMACEN' end,
      p.id::text,null,0
    from public.pedido_evento e join public.pedido p on p.id=e.pedido_id
    where p_vista='eventos' and p_area in ('','Pedidos') and e.creado_en>=inicio and e.creado_en<fin
    union all
    select 'alistado-evento:'||e.id,'Almacén',coalesce(p.numero,'Pedido #'||p.id),
      initcap(replace(e.accion,'_',' ')),e.creado_en,e.actor_nombre,
      case when p.categoria not in ('MAYOR','INSTITUCIONAL','CORPORATIVO') then 'PEDIDO_ALMACEN'
           when e.accion in ('TOMAR_REVISION','GUARDAR_REVISION','VERIFICADO') then 'VERIFICACION'
           when e.accion in ('DESPACHADO','CONFIRMAR_RETIRO','RETIRO_TRANSPORTE') then 'SALIDA'
           else 'ALISTADO' end,
      p.id::text,null,0
    from public.almacen_preparacion_evento e join public.almacen_preparacion a on a.id=e.preparacion_id
    join public.pedido p on p.id=a.pedido_id
    where p_vista='eventos' and p_area in ('','Almacén') and e.creado_en>=inicio and e.creado_en<fin
    union all
    select 'traslado-evento:'||t.id||':'||e.tipo,'Almacén',coalesce(t.numero,'Traslado #'||t.id),
      e.tipo,e.fecha,e.responsable,'TRASLADO',t.id::text,null,0
    from public.solicitud_traslado t cross join lateral (values
      ('Traslado solicitado',t.solicitado_en,t.solicitado_por),
      ('Traslado despachado',t.despachado_en,t.despachado_por),
      ('Traslado recibido',t.recibido_en,t.recibido_por)
    ) e(tipo,fecha,responsable)
    where p_vista='eventos' and p_area in ('','Almacén') and e.fecha>=inicio and e.fecha<fin
    union all
    select 'venta-evento:'||e.id,'Caja',coalesce(v.numero,'Venta #'||v.id),
      initcap(replace(e.accion,'_',' ')),e.creado_en,e.usuario,'RETAIL',v.id::text,null,0
    from public.venta_evento e join public.venta v on v.id=e.venta_id
    where p_vista='eventos' and p_area in ('','Caja') and e.creado_en>=inicio and e.creado_en<fin
    union all
    select 'caja-evento:'||e.id,'Caja',coalesce(v.numero,'Operación #'||e.operacion_id),
      initcap(replace(e.accion,'_',' ')),e.creado_en,pf.nombre,'RETAIL',v.id::text,null,0
    from public.caja_operacion_evento e left join public.venta v on v.id=e.venta_id
    left join public.perfil pf on pf.id=e.actor_id
    where p_vista='eventos' and p_area in ('','Caja') and e.creado_en>=inicio and e.creado_en<fin
    union all
    select 'cobro-evento:'||e.id,'Cobranza',coalesce(p.numero,c.nombre,'Cobro #'||e.entidad_id),
      initcap(replace(e.accion,'_',' ')),e.creado_en,e.actor->>'nombre',
      case when p.categoria in ('MAYOR','INSTITUCIONAL','CORPORATIVO') then 'PAGO' else 'CUENTA' end,
      case when p.categoria in ('MAYOR','INSTITUCIONAL','CORPORATIVO') then p.id::text else c.id::text end,
      null,0
    from hermes.cobro_evento e left join hermes.pago pg on pg.id=e.pago_id
    left join hermes.partida_abierta pa on pa.id=e.partida_id
    left join public.pedido p on p.id=coalesce(e.pedido_id,pa.pedido_id)
    left join hermes.cliente c on c.id=coalesce(pg.cliente_id,pa.cliente_id)
    where p_vista='eventos' and p_area in ('','Cobranza') and e.accion<>'TRAZA_HABILITADA'
      and e.creado_en>=inicio and e.creado_en<fin
  ), ordenadas as materialized (
    select f.*,
      case when p_vista='pendientes' then row_number() over(partition by area order by prioridad desc,fecha asc nulls last,id) end as turno,
      array_position(array['Cobranza','Caja','Almacén','Pedidos','Datos'],area) as orden_area
    from filas f
  ), pagina as (
    select * from ordenadas order by turno,case when p_vista='pendientes' then orden_area end,fecha desc nulls last,id
    limit 25 offset (p_pagina-1)*25
  )
  select jsonb_build_object('total',(select count(*) from ordenadas),'filas',coalesce((
    select jsonb_agg(to_jsonb(p)-'turno'-'orden_area'-'prioridad'
      order by turno,case when p_vista='pendientes' then orden_area end,fecha desc nulls last,id) from pagina p
  ),'[]'::jsonb)) into resultado;
  return resultado;
end $$;

create function public.dash_auditoria(p_vista text, p_desde date, p_hasta date, p_area text, p_pagina integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  select analitica.auditoria(p_vista,p_desde,p_hasta,p_area,p_pagina);
$$;

revoke all on function analitica.auditoria(text,date,date,text,integer), public.dash_auditoria(text,date,date,text,integer) from public,anon;
grant execute on function analitica.auditoria(text,date,date,text,integer), public.dash_auditoria(text,date,date,text,integer) to authenticated;
notify pgrst,'reload schema';
