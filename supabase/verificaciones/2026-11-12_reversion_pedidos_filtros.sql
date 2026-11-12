-- REVERSIÓN de 20261112010000_pedidos_filtros.sql
-- Restaura analitica.wholesale_lista tal como quedó con 20261111010000_pedidos_orden_actividad.sql
-- (orden por actividad, sin filtros rápidos) y elimina las tres funciones auxiliares.
-- Correr completo en el SQL Editor. No toca datos.

begin;

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

drop function if exists analitica.wholesale_etapa(jsonb);
drop function if exists analitica.wholesale_cobro_estado(jsonb);
drop function if exists analitica.actividad_familia(text);

revoke all on function analitica.wholesale_lista(date,date,jsonb,text,integer) from public,anon;
grant execute on function analitica.wholesale_lista(date,date,jsonb,text,integer) to authenticated, service_role;

commit;
notify pgrst,'reload schema';
