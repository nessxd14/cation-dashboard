-- Pedidos (Consolidado WholeSale): filtros rápidos de estado, cobro, última actividad y
-- pedidos sin movimiento.
--
-- Compatibilidad: la firma de public.dash_wholesale_lista y de analitica.wholesale_lista NO
-- cambia. Los filtros nuevos viajan en p_filtros (todos opcionales):
--   'estado'    abierto | por_alistar | alistando | listo | en_salida | completado | cancelado
--   'cobro'     con_saldo | pendiente | parcial | por_verificar | saldo_cero | sin_partida | revisar
--   'actividad' problemas | cobro | salida | cambios | almacen   (familia de la última actividad)
--   'sin_mov'   3 | 7 | 15 | 30  (días)
-- Un valor desconocido levanta 22023. Sin filtros nuevos el resultado es idéntico al anterior.
--
-- Reglas:
-- * 'estado' y 'cobro' se calculan sobre analitica.wholesale_fila, la misma fila que pinta la
--   tabla, así el filtro coincide con lo que se ve. 'cobro' replica cobro() de
--   lib/wholesale-estados.ts; 'actividad' replica tonoActividad() de
--   components/FilaPedidoWholesale.tsx. Si cambias una, cambia la otra.
-- * 'sin_mov' IGNORA el período: lista pedidos abiertos (estado ABIERTO) o con cobro pendiente
--   (pendiente, abono parcial, por verificar o revisar) cuya última actividad es anterior a
--   ahora menos N días. Si respetara el período, los más estancados nunca aparecerían.
-- * No escribe en public.pedido (ni en ninguna tabla): un UPDATE ahí dispara los triggers de
--   comisiones y de Hermes.

create function analitica.wholesale_etapa(p_fila jsonb)
returns text language sql immutable set search_path='' as $$
  select case
    when p_fila->>'estado'='CANCELADO' then 'cancelado'
    when p_fila->>'estado'='COMPLETADO' then 'completado'
    when coalesce((p_fila->>'salidas')::int,0)>0 then 'en_salida'
    when p_fila->>'preparado_en' is not null or p_fila->>'verificado_en' is not null then 'listo'
    when coalesce((p_fila->>'preparaciones')::int,0)>0 then 'alistando'
    else 'por_alistar'
  end
$$;

create function analitica.wholesale_cobro_estado(p_fila jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare
  n bigint; total bigint; partidas bigint; aplicado bigint; saldo bigint; revision bigint;
begin
  -- Misma precedencia que cobro() en lib/wholesale-estados.ts
  if jsonb_typeof(p_fila->'partidas')<>'number' then return 'no_disponible'; end if;
  n := (p_fila->>'partidas')::bigint;
  if n<0 then return 'no_disponible'; end if;
  if p_fila->>'estado'='CANCELADO' then
    return case when n>0 then 'revisar' else 'cancelado' end;
  end if;
  if n=0 then return 'sin_partida'; end if;
  if jsonb_typeof(p_fila->'total')<>'number' or jsonb_typeof(p_fila->'total_partidas')<>'number'
     or jsonb_typeof(p_fila->'aplicado')<>'number' or jsonb_typeof(p_fila->'saldo')<>'number'
     or jsonb_typeof(p_fila->'en_revision')<>'number' then
    return 'no_disponible';
  end if;
  total := round((p_fila->>'total')::numeric*100);
  partidas := round((p_fila->>'total_partidas')::numeric*100);
  aplicado := round((p_fila->>'aplicado')::numeric*100);
  saldo := round((p_fila->>'saldo')::numeric*100);
  revision := round((p_fila->>'en_revision')::numeric*100);
  if least(total,partidas,aplicado,saldo,revision)<0 or total<>partidas
     or aplicado+saldo<>partidas or revision>saldo then
    return 'revisar';
  end if;
  if revision>0 then return 'por_verificar'; end if;
  if saldo=0 then return 'saldo_cero'; end if;
  if aplicado>0 then return 'parcial'; end if;
  return 'pendiente';
end $$;

create function analitica.actividad_familia(p_tipo text)
returns text language sql immutable set search_path='' as $$
  -- Mismo orden que tonoActividad(): rojo, violeta, verde, ámbar, azul, gris
  select case
    when t ~ '(anulad|rechazad|cancelad|incidencia)' then 'problemas'
    when t ~ '(cobro|anticipo)' then 'cobro'
    when t ~ '(salida|retiro|despacho)' then 'salida'
    when t ~ '(edit|item|compra|restaurad)' then 'cambios'
    when t ~ '(alistad|verifica|almacen)' then 'almacen'
    else 'otros'
  end
  from (select translate(lower(coalesce(p_tipo,'')),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunaeiouun') t) x
$$;

create or replace function analitica.wholesale_lista(
  p_desde date, p_hasta date, p_filtros jsonb, p_buscar text, p_pagina integer
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  r jsonb;
  v_orden text;
  v_estado text;
  v_cobro text;
  v_familia text;
  v_sin_mov integer;
  v_clasificar boolean;
  v_ultima boolean;
  inicio timestamptz;
  fin timestamptz;
  corte timestamptz;
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
  v_estado := nullif(p_filtros->>'estado','');
  if v_estado is not null and v_estado not in
     ('abierto','por_alistar','alistando','listo','en_salida','completado','cancelado') then
    raise exception 'Estado inválido' using errcode='22023';
  end if;
  v_cobro := nullif(p_filtros->>'cobro','');
  if v_cobro is not null and v_cobro not in
     ('con_saldo','pendiente','parcial','por_verificar','saldo_cero','sin_partida','revisar') then
    raise exception 'Cobro inválido' using errcode='22023';
  end if;
  v_familia := nullif(p_filtros->>'actividad','');
  if v_familia is not null and v_familia not in ('problemas','cobro','salida','cambios','almacen') then
    raise exception 'Actividad inválida' using errcode='22023';
  end if;
  if nullif(p_filtros->>'sin_mov','') is not null then
    if p_filtros->>'sin_mov' not in ('3','7','15','30') then
      raise exception 'Días sin movimiento inválidos' using errcode='22023';
    end if;
    v_sin_mov := (p_filtros->>'sin_mov')::integer;
  end if;
  v_clasificar := v_estado is not null or v_cobro is not null or v_sin_mov is not null;
  v_ultima := v_familia is not null or v_sin_mov is not null;
  inicio := p_desde::timestamp at time zone 'America/La_Paz';
  fin := (p_hasta+1)::timestamp at time zone 'America/La_Paz';
  -- Con 'sin_mov' la última actividad se mide hasta ahora; si no, hasta el fin del período
  corte := case when v_sin_mov is not null then greatest(fin, now()) else fin end;

  with base as materialized (
    -- Mismos filtros comerciales que antes. Con 'sin_mov' no hay corte por período.
    select p.id,p.creado_en from public.pedido p
    left join public.cliente c on c.id=p.cliente_id
    left join public.perfil pf on pf.email=p.creado_por
    where p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')
     and (v_sin_mov is not null or p.creado_en<fin)
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
    -- Último movimiento de cada pedido DENTRO del período (solo al ordenar por actividad)
    select distinct on (e.pedido_id) e.pedido_id, e.fecha, e.tipo
    from analitica.pedido_actividad_eventos(inicio,fin) e
    where v_orden='actividad' and v_sin_mov is null
    order by e.pedido_id, e.fecha desc, e.tipo
  ), candidatos as materialized (
    select b.id, b.creado_en, a.fecha as orden_en
    from base b join actividad_periodo a on a.pedido_id=b.id
    where v_orden='actividad' and v_sin_mov is null
    union all
    select b.id, b.creado_en, b.creado_en
    from base b
    where (v_orden='creacion' and b.creado_en>=inicio) or v_sin_mov is not null
  ), clase as materialized (
    -- Estado y cobro tal como los muestra la fila (solo si hay filtros que los usan)
    select c.id, analitica.wholesale_etapa(f.j) as etapa, analitica.wholesale_cobro_estado(f.j) as cobro
    from candidatos c cross join lateral (select analitica.wholesale_fila(c.id) j) f
    where v_clasificar
  ), ultima_total as materialized (
    -- Último movimiento hasta el corte (solo si hay filtros que lo usan)
    select distinct on (e.pedido_id) e.pedido_id, e.fecha, e.tipo
    from analitica.pedido_actividad_eventos('-infinity'::timestamptz, corte,
           (select array_agg(id) from candidatos)) e
    where v_ultima
    order by e.pedido_id, e.fecha desc, e.tipo
  ), filtrados as materialized (
    select c.id, c.creado_en,
      case when v_sin_mov is not null and v_orden='actividad' then u.fecha else c.orden_en end as orden_en
    from candidatos c
    left join clase k on k.id=c.id
    left join ultima_total u on u.pedido_id=c.id
    where (v_estado is null
           or (v_estado='abierto' and k.etapa in ('por_alistar','alistando','listo','en_salida'))
           or k.etapa=v_estado)
      and (v_cobro is null
           or (v_cobro='con_saldo' and k.cobro in ('pendiente','parcial'))
           or k.cobro=v_cobro)
      and (v_familia is null or analitica.actividad_familia(u.tipo)=v_familia)
      and (v_sin_mov is null or (
             (k.etapa in ('por_alistar','alistando','listo','en_salida')
              or k.cobro in ('pendiente','parcial','por_verificar','revisar'))
             and u.fecha < now() - make_interval(days => v_sin_mov)))
  ), pagina as (
    select * from filtrados order by orden_en desc nulls last, id desc offset (p_pagina-1)*25 limit 25
  ), ultima as (
    -- Para mostrar: último movimiento de cada fila de la página hasta el corte
    select distinct on (e.pedido_id) e.pedido_id, e.fecha, e.tipo
    from analitica.pedido_actividad_eventos('-infinity'::timestamptz, corte,
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
        order by pg.orden_en desc nulls last, pg.id desc)
      from pagina pg left join ultima u on u.pedido_id=pg.id
    ),'[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function analitica.wholesale_etapa(jsonb) from public,anon,authenticated;
revoke all on function analitica.wholesale_cobro_estado(jsonb) from public,anon,authenticated;
revoke all on function analitica.actividad_familia(text) from public,anon,authenticated;
grant execute on function analitica.wholesale_etapa(jsonb) to service_role;
grant execute on function analitica.wholesale_cobro_estado(jsonb) to service_role;
grant execute on function analitica.actividad_familia(text) to service_role;
revoke all on function analitica.wholesale_lista(date,date,jsonb,text,integer) from public,anon;
grant execute on function analitica.wholesale_lista(date,date,jsonb,text,integer) to authenticated, service_role;
notify pgrst,'reload schema';
