-- Lecturas para el Resumen y el detalle de una cuenta, sobre las fuentes operativas.
create function analitica.actividad_dia(p_fecha date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  inicio timestamptz;
  fin timestamptz;
  resultado jsonb;
begin
  perform analitica.exigir_acceso();
  perform analitica.validar_periodo(p_fecha,p_fecha);
  inicio := p_fecha::timestamp at time zone 'America/La_Paz';
  fin := (p_fecha+1)::timestamp at time zone 'America/La_Paz';

  with eventos(id,tipo,documento,referencia_id,fecha,evento,tono,etapa) as (
    select 'pedido:'||p.id,'pedidos',coalesce(p.numero,'Pedido #'||p.id),p.id::text,
      p.creado_en,'Pedido registrado','azul','pedido'
    from public.pedido p
    where p.categoria in ('MAYOR','INSTITUCIONAL','CORPORATIVO') and p.creado_en>=inicio and p.creado_en<fin
    union all
    select 'preparacion:'||e.id,'pedidos',coalesce(p.numero,'Pedido #'||p.id),p.id::text,e.creado_en,
      case e.accion when 'PREPARADO' then 'Alistado registrado' when 'VERIFICADO' then 'Verificación registrada'
        when 'DESPACHO_REGISTRADO' then 'Despacho registrado' else 'Retiro registrado' end,
      case when e.accion='PREPARADO' then 'azul' else 'verde' end,
      case e.accion when 'PREPARADO' then 'alistado' when 'VERIFICADO' then 'verificacion' else 'salida' end
    from public.almacen_preparacion_evento e join public.almacen_preparacion a on a.id=e.preparacion_id
    join public.pedido p on p.id=a.pedido_id
    where p.categoria in ('MAYOR','INSTITUCIONAL','CORPORATIVO') and e.creado_en>=inicio and e.creado_en<fin
      and e.accion in ('PREPARADO','VERIFICADO','DESPACHO_REGISTRADO','CONFIRMAR_RETIRO','REVISION_Y_RETIRO','RETIRO_TRANSPORTE')
    union all
    select 'vtd:'||v.id,'vtd',coalesce(v.numero,'VTD #'||v.id),v.id::text,v.creado_en,
      'Venta directa registrada','azul',null
    from public.venta v left join public.ubicacion u on u.id=v.ubicacion_id
    where v.creado_en>=inicio and v.creado_en<fin and (v.numero like 'VTD-%' or u.codigo_zona='VENTAS DIRECTAS')
    union all
    select 'vtd-caja:'||e.id,'vtd',coalesce(v.numero,'VTD #'||v.id),v.id::text,e.creado_en,
      case e.accion when 'ENVIAR' then 'Material enviado a Caja' when 'RECIBIR_RETORNO' then 'Retorno registrado' else 'Solicitud rechazada' end,
      case e.accion when 'ENVIAR' then 'azul' when 'RECIBIR_RETORNO' then 'verde' else 'rojo' end,null
    from public.caja_operacion_evento e join public.venta v on v.id=e.venta_id
    left join public.ubicacion u on u.id=v.ubicacion_id
    where e.creado_en>=inicio and e.creado_en<fin and e.accion in ('ENVIAR','RECIBIR_RETORNO','RECHAZADO')
      and (v.numero like 'VTD-%' or u.codigo_zona='VENTAS DIRECTAS')
    union all
    select 'traslado:'||t.id||':'||e.accion,'traslados',coalesce(t.numero,'Traslado #'||t.id),t.id::text,
      e.fecha,e.accion,e.tono,null
    from public.solicitud_traslado t cross join lateral (values
      (t.solicitado_en,'Traslado solicitado','ambar'),
      (t.despachado_en,'Traslado despachado','azul'),
      (t.recibido_en,'Traslado recibido','verde')
    ) e(fecha,accion,tono)
    where e.fecha>=inicio and e.fecha<fin
  ), recientes as (
    select e.*,row_number() over (partition by tipo order by fecha desc,id desc) as posicion from eventos e
  )
  select coalesce(jsonb_agg(to_jsonb(r)-'posicion' order by fecha desc,id desc),'[]'::jsonb)
  into resultado from recientes r where posicion<=6;
  return resultado;
end $$;

create function analitica.cuenta_cobranza(p_cliente bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
  perform analitica.exigir_acceso();
  if p_cliente is null or p_cliente<=0 then
    raise exception 'Cliente inválido' using errcode='22023';
  end if;
  select jsonb_build_object(
    'id',c.id::text,'nombre',c.nombre,'saldo',s.saldo_confirmado,
    'en_revision',s.monto_en_revision,
    'pagos',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id::text,'medio',p.medio,'estado',p.estado,'monto',p.monto,
        'creado_en',p.creado_en,'registrado_por',p.creado_por,
        'confirmado_en',p.confirmado_en,'confirmado_por',p.confirmado_por,
        'aplicado',coalesce(a.monto,0),'devuelto',coalesce(p.devuelto_monto,0),
        'sin_asignar',case when p.estado in ('CONFIRMADO','ACREDITADO') then
          greatest(p.monto-coalesce(p.devuelto_monto,0)-coalesce(a.monto,0),0) end
      ) order by p.creado_en desc,p.id desc)
      from (select * from hermes.pago where cliente_id=c.id order by creado_en desc,id desc limit 5) p
      left join lateral (select sum(monto) monto from hermes.pago_aplicacion where pago_id=p.id) a on true
    ),'[]'::jsonb)
  ) into resultado
  from hermes.cliente c left join hermes.v_saldo_cliente s on s.cliente_id=c.id
  where c.id=p_cliente;
  return resultado;
end $$;

create function public.dash_actividad_dia(p_fecha date) returns jsonb
language sql stable security invoker set search_path='' as $$ select analitica.actividad_dia(p_fecha) $$;
create function public.dash_cuenta_cobranza(p_cliente bigint) returns jsonb
language sql stable security invoker set search_path='' as $$ select analitica.cuenta_cobranza(p_cliente) $$;

revoke all on function analitica.actividad_dia(date), public.dash_actividad_dia(date),
  analitica.cuenta_cobranza(bigint), public.dash_cuenta_cobranza(bigint) from public,anon;
grant execute on function analitica.actividad_dia(date), public.dash_actividad_dia(date),
  analitica.cuenta_cobranza(bigint), public.dash_cuenta_cobranza(bigint) to authenticated;
notify pgrst,'reload schema';
