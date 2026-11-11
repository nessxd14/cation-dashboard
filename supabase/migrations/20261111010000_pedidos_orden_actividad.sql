-- Pedidos (Consolidado WholeSale): ordenar por ACTIVIDAD RECIENTE por defecto.
--
-- Un pedido sube arriba cuando tiene cualquier movimiento: se crea, se edita o se anula,
-- almacén lo alista, lo verifica o lo despacha, se registra un anticipo en caja o se le
-- aplica un cobro en Hermes.
--
-- Compatibilidad: la firma de public.dash_wholesale_lista NO cambia. El orden viaja en
-- p_filtros->>'orden':
--   'actividad' (o ausente) → pedidos con actividad dentro del período, el más reciente
--                             primero. El período filtra la ACTIVIDAD, no la creación.
--   'creacion'              → comportamiento anterior: período por fecha de creación,
--                             más nuevos primero.
-- Cada fila suma 'actividad_en' y 'actividad_tipo': el último movimiento hasta el fin del
-- período. La clave 'ultima_actividad' de analitica.wholesale_fila no se toca.
--
-- No escribe en public.pedido: un UPDATE ahí dispara los triggers de comisiones y de
-- Hermes. Todo se calcula leyendo las tablas de eventos.

create function analitica.pedido_actividad_eventos(
  p_inicio timestamptz, p_fin timestamptz, p_ids bigint[] default null
) returns table(pedido_id bigint, fecha timestamptz, tipo text)
language sql stable set search_path='' as $$
  -- Pedido creado
  select p.id, p.creado_en, 'Pedido creado'
  from public.pedido p
  where p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')
    and p.creado_en>=p_inicio and p.creado_en<p_fin
    and (p_ids is null or p.id=any(p_ids))
  union all
  -- Bitácora del pedido (ediciones, anulación, compras, cambios de línea)
  select e.pedido_id, e.creado_en,
    case e.accion
      when 'PEDIDO_EDITADO' then 'Pedido editado'
      when 'ANULADO' then 'Pedido anulado'
      when 'RESTAURADO' then 'Pedido restaurado'
      when 'PEDIDO_RECHAZADO' then 'Pedido rechazado'
      when 'LINEAS_AGREGADAS' then 'Ítems agregados'
      when 'LINEA_CAMBIADA' then 'Ítem cambiado'
      when 'LINEA_RECHAZADA' then 'Ítem rechazado'
      when 'LINEA_RETIRADA' then 'Ítem retirado'
      when 'LINEA_DEVUELTA_ALMACEN' then 'Ítem devuelto a almacén'
      when 'REEMPLAZO_MATERIAL' then 'Reemplazo de material'
      when 'LINEA_A_COMPRA' then 'Enviado a compra'
      when 'COMPRA_COMPRADA' then 'Compra realizada'
      when 'COMPRA_RECIBIDA' then 'Compra recibida'
      when 'COMPRA_CANCELADA' then 'Compra cancelada'
      when 'COMPRA_ALISTADO_AUTOMATICA' then 'Compra alistada'
      else initcap(lower(replace(e.accion,'_',' ')))
    end
  from public.pedido_evento e
  where e.creado_en>=p_inicio and e.creado_en<p_fin
    and (p_ids is null or e.pedido_id=any(p_ids))
  union all
  -- Almacén: alistado, verificación, despacho y retiro (sin eventos técnicos ni de prueba)
  select a.pedido_id, e.creado_en,
    case
      when e.accion='PREPARACION_INICIADA' then 'Alistado iniciado'
      when e.accion in ('GUARDAR_PREPARACION','ORIGEN_ALISTADO','DECLARAR_ORIGEN','REGISTRAR_ABASTECIMIENTO',
                        'RESTO_PREPARACION_CONFIRMADO','SOLICITUD_REDUCIDA') then 'Alistado en curso'
      when e.accion='PREPARADO' then 'Alistado'
      when e.accion in ('TOMAR_REVISION','GUARDAR_REVISION','RESTO_REVISION_CONFIRMADO') then 'Verificación en curso'
      when e.accion='VERIFICADO' then 'Verificado'
      when e.accion='DESPACHO_REGISTRADO' then 'Despacho registrado'
      when e.accion in ('CONFIRMAR_RETIRO','REVISION_Y_RETIRO','RETIRO_TRANSPORTE') then 'Retiro confirmado'
      when e.accion='REABRIR' then 'Preparación reabierta'
      when e.accion='REGISTRAR_INCIDENCIA' then 'Incidencia de almacén'
      when e.accion='REEMPLAZAR_MATERIAL' then 'Reemplazo de material'
      when e.accion='RECIBIR_COMPRA_TARJETA' then 'Compra recibida'
      else 'Movimiento de almacén'
    end
  from public.almacen_preparacion_evento e
  join public.almacen_preparacion a on a.id=e.preparacion_id
  where e.creado_en>=p_inicio and e.creado_en<p_fin
    and e.accion not in ('SINCRONIZAR','ANULADO_PRUEBA','PRUEBA_REINICIADA','PRUEBA_RESTAURADA')
    and (p_ids is null or a.pedido_id=any(p_ids))
  union all
  -- Salida de mercadería por línea
  select l.pedido_id, d.creado_en, 'Salida de mercadería'
  from public.pedido_despacho_evento d
  join public.pedido_linea l on l.id=d.pedido_linea_id
  where d.creado_en>=p_inicio and d.creado_en<p_fin and not coalesce(d.revertido,false)
    and (p_ids is null or l.pedido_id=any(p_ids))
  union all
  -- Anticipo o cobro registrado en caja
  select m.pedido_id, m.creado_en,
    case when m.tipo::text='ANTICIPO' then 'Anticipo en caja' else 'Cobro en caja' end
  from public.movimiento_caja m
  where m.pedido_id is not null and m.creado_en>=p_inicio and m.creado_en<p_fin
    and (p_ids is null or m.pedido_id=any(p_ids))
  union all
  -- Cobro aplicado en Hermes a una partida del pedido
  select pt.pedido_id, pa.creado_en, 'Cobro aplicado'
  from hermes.pago_aplicacion pa
  join hermes.partida_abierta pt on pt.id=pa.partida_id
  where pt.pedido_id is not null and pa.creado_en>=p_inicio and pa.creado_en<p_fin
    and (p_ids is null or pt.pedido_id=any(p_ids))
  union all
  -- Comentarios y avisos de almacén
  select c.pedido_id, c.creado_en, 'Comentario'
  from public.pedido_comentario c
  where c.creado_en>=p_inicio and c.creado_en<p_fin and (p_ids is null or c.pedido_id=any(p_ids))
  union all
  select v.pedido_id, v.creado_en, 'Aviso de almacén'
  from public.pedido_aviso v
  where v.creado_en>=p_inicio and v.creado_en<p_fin and (p_ids is null or v.pedido_id=any(p_ids))
$$;

create or replace function analitica.wholesale_lista(
  p_desde date, p_hasta date, p_filtros jsonb, p_buscar text, p_pagina integer
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  r jsonb;
  v_orden text;
  inicio timestamptz;
  fin timestamptz;
begin
  perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_desde,p_hasta);
  if p_pagina is null or p_pagina<1 or p_pagina>100000 or length(coalesce(p_buscar,''))>120
     or jsonb_typeof(p_filtros)<>'object' then
    raise exception 'Filtros inválidos' using errcode='22023';
  end if;
  v_orden := coalesce(nullif(p_filtros->>'orden',''),'actividad');
  if v_orden not in ('actividad','creacion') then
    raise exception 'Orden inválido' using errcode='22023';
  end if;
  inicio := p_desde::timestamp at time zone 'America/La_Paz';
  fin := (p_hasta+1)::timestamp at time zone 'America/La_Paz';

  with base as materialized (
    -- Mismos filtros comerciales que antes, sin el corte por fecha de creación
    select p.id,p.creado_en from public.pedido p
    left join public.cliente c on c.id=p.cliente_id
    left join public.perfil pf on pf.email=p.creado_por
    where p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')
     and p.creado_en<fin
     and (nullif(p_filtros->>'canal','') is null or p.categoria::text=p_filtros->>'canal')
     and (nullif(p_filtros->>'cliente','') is null or p.cliente_id::text=p_filtros->>'cliente')
     and (nullif(p_filtros->>'vendedor','') is null or p.creado_por=p_filtros->>'vendedor')
     and (nullif(p_filtros->>'producto','') is null or exists(select 1 from public.pedido_linea l
          where l.pedido_id=p.id and l.producto_id::text=p_filtros->>'producto'))
     and (nullif(p_filtros->>'sucursal','') is null or exists(select 1 from public.pedido_linea l
          where l.pedido_id=p.id and coalesce(l.sucursal_origen_id,pf.sucursal_id)::text=p_filtros->>'sucursal'))
     and (nullif(trim(p_buscar),'') is null
          or strpos(lower(coalesce(p.numero,'')||' '||coalesce(c.nombre,'')),lower(trim(p_buscar)))>0)
  ), actividad_periodo as materialized (
    -- Último movimiento de cada pedido DENTRO del período (solo se usa al ordenar por actividad)
    select distinct on (e.pedido_id) e.pedido_id, e.fecha, e.tipo
    from analitica.pedido_actividad_eventos(inicio,fin) e
    where v_orden='actividad'
    order by e.pedido_id, e.fecha desc, e.tipo
  ), filtrados as materialized (
    select b.id, b.creado_en, a.fecha as orden_en
    from base b join actividad_periodo a on a.pedido_id=b.id
    where v_orden='actividad'
    union all
    select b.id, b.creado_en, b.creado_en
    from base b
    where v_orden='creacion' and b.creado_en>=inicio
  ), pagina as (
    select * from filtrados order by orden_en desc, id desc offset (p_pagina-1)*25 limit 25
  ), ultima as (
    -- Para mostrar: último movimiento de cada fila de la página hasta el fin del período
    select distinct on (e.pedido_id) e.pedido_id, e.fecha, e.tipo
    from analitica.pedido_actividad_eventos('-infinity'::timestamptz, fin,
           (select array_agg(id) from pagina)) e
    order by e.pedido_id, e.fecha desc, e.tipo
  )
  select jsonb_build_object(
    'total',(select count(*) from filtrados),
    'orden',v_orden,
    'filas',coalesce((
      select jsonb_agg(
        analitica.wholesale_fila(pg.id)
        || jsonb_build_object('actividad_en',u.fecha,'actividad_tipo',u.tipo)
        order by pg.orden_en desc, pg.id desc)
      from pagina pg left join ultima u on u.pedido_id=pg.id
    ),'[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function analitica.pedido_actividad_eventos(timestamptz,timestamptz,bigint[]) from public,anon,authenticated;
grant execute on function analitica.pedido_actividad_eventos(timestamptz,timestamptz,bigint[]) to service_role;
revoke all on function analitica.wholesale_lista(date,date,jsonb,text,integer) from public,anon;
grant execute on function analitica.wholesale_lista(date,date,jsonb,text,integer) to authenticated, service_role;
notify pgrst,'reload schema';
