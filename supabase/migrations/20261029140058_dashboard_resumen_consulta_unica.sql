-- Evita repetir lecturas de los mismos hechos para cada indicador.
-- Conserva acceso, filtros, períodos, cifras y el límite de tiempo de la API.
create or replace function analitica.dash_resumen(p_desde date, p_hasta date, p_filtros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias   int  := (p_hasta - p_desde) + 1;
  v_pdesde date := p_desde - ((p_hasta - p_desde) + 1);
  v_phasta date := p_desde - 1;
  v_hoy    date := (now() at time zone 'America/La_Paz')::date;
  r jsonb;
begin
  perform analitica.exigir_acceso();
  perform analitica.validar_periodo(p_desde,p_hasta);
  if p_hasta < p_desde then
    raise exception 'rango inválido: % > %', p_desde, p_hasta;
  end if;
  if v_dias > 400 then
    raise exception 'rango demasiado largo (% días, máximo 400)', v_dias;
  end if;

  with ventas_filtradas as materialized (
    select origen,doc_id,fecha,canal,cliente_id,descripcion,monto
    from analitica.f_ventas(p_filtros)
  ), dinero_filtrado as materialized (
    select tipo,fecha,medio,monto,estado from analitica.f_dinero(p_filtros)
    where fecha between v_pdesde and p_hasta
  ), cartera_filtrada as materialized (
    select saldo_confirmado,cliente from analitica.f_cartera(p_filtros)
  ), stock_filtrado as materialized (
    select cantidad,origen,fecha,valor_venta from analitica.f_stock(p_filtros)
    where fecha between p_desde and p_hasta
  ), pedidos_filtrados as materialized (
    select p.* from public.pedido p where p.id in (
      select doc_id from ventas_filtradas where origen='PEDIDO'
    )
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'dias', v_dias,
                                  'prev_desde', v_pdesde, 'prev_hasta', v_phasta),

    'vendido', jsonb_build_object(
      'total', (select coalesce(round(sum(monto), 2), 0) from ventas_filtradas
                 where fecha between p_desde and p_hasta),
      'prev',  (select coalesce(round(sum(monto), 2), 0) from ventas_filtradas
                 where fecha between v_pdesde and v_phasta),
      'pedidos', (select count(distinct doc_id) from ventas_filtradas
                   where origen = 'PEDIDO' and fecha between p_desde and p_hasta),
      'ventas_retail', (select count(distinct doc_id) from ventas_filtradas
                         where origen = 'RETAIL' and fecha between p_desde and p_hasta),
      'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('canal', canal, 'monto', monto) order by monto desc), '[]'::jsonb)
                    from (select canal, round(sum(monto), 2) monto from ventas_filtradas
                          where fecha between p_desde and p_hasta group by canal) s)),

    'cobrado', jsonb_build_object(
      'total', (select coalesce(round(sum(monto), 2), 0) from dinero_filtrado
                 where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta),
      'prev',  (select coalesce(round(sum(monto), 2), 0) from dinero_filtrado
                 where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between v_pdesde and v_phasta),
      'retail', (select coalesce(round(sum(monto), 2), 0) from dinero_filtrado
                  where tipo = 'COBRO_RETAIL' and fecha between p_desde and p_hasta),
      'cuenta', (select coalesce(round(sum(monto), 2), 0) from dinero_filtrado
                  where tipo = 'COBRO_CUENTA' and fecha between p_desde and p_hasta),
      'qr_sin_verificar', (select count(*) from dinero_filtrado
                            where tipo = 'COBRO_RETAIL' and medio = 'QR' and estado = 'PENDIENTE'
                              and fecha between p_desde and p_hasta),
      'por_medio', (select coalesce(jsonb_agg(jsonb_build_object('medio', medio, 'monto', monto) order by monto desc), '[]'::jsonb)
                    from (select medio, round(sum(monto), 2) monto from dinero_filtrado
                          where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta
                          group by medio) s)),

    'egresos_caja', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'monto', monto)), '[]'::jsonb)
                     from (select tipo, round(sum(monto), 2) monto from dinero_filtrado
                           where tipo like 'EGRESO%' and fecha between p_desde and p_hasta group by tipo) s),

    'cartera', jsonb_build_object(
      'total',    (select coalesce(round(sum(saldo_confirmado), 2), 0) from cartera_filtrada where saldo_confirmado > 0),
      'clientes', (select count(*) from cartera_filtrada where saldo_confirmado > 0),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
              from (select cliente, round(saldo_confirmado, 2) saldo from cartera_filtrada
                    where saldo_confirmado > 0 order by saldo_confirmado desc limit 6) s)),

    'salidas', jsonb_build_object(
      'valor_total', (select coalesce(round(sum(valor_venta), 2), 0) from stock_filtrado
                       where cantidad < 0 and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO')
                         and fecha between p_desde and p_hasta),
      'por_origen', (select coalesce(jsonb_agg(jsonb_build_object('origen', origen, 'unidades', unidades, 'valor', valor) order by unidades desc), '[]'::jsonb)
                     from (select origen, round(sum(-cantidad), 2) unidades, round(sum(valor_venta), 2) valor
                           from stock_filtrado
                           where cantidad < 0
                             and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO', 'AJUSTE', 'OTRO', 'REPOSICION_TIENDA')
                             and fecha between p_desde and p_hasta
                           group by origen) s)),

    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'pedidos', coalesce(x.pedidos, 0), 'retail', coalesce(x.retail, 0)) order by d.fecha), '[]'::jsonb)
              from (select generate_series(p_desde, p_hasta, interval '1 day')::date fecha) d
              left join (select fecha,
                                round(sum(monto) filter (where origen = 'PEDIDO'), 2) pedidos,
                                round(sum(monto) filter (where origen = 'RETAIL'), 2) retail
                         from ventas_filtradas where fecha between p_desde and p_hasta group by fecha) x
                on x.fecha = d.fecha),

    'top_productos', (select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'monto', monto) order by monto desc), '[]'::jsonb)
                      from (select descripcion, round(sum(monto), 2) monto from ventas_filtradas
                            where fecha between p_desde and p_hasta and descripcion is not null
                            group by descripcion order by sum(monto) desc limit 6) s),

    'turnos', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', s.id, 'estado', s.estado, 'abierta_en', s.abierta_en,
                         'cajero', coalesce(pf.nombre, s.abierta_por), 'diferencia', s.diferencia)
                       order by s.id desc), '[]'::jsonb)
               from (select * from public.sesion_caja order by id desc limit 6) s
               left join public.perfil pf on pf.id = s.cajero_id),

    'hoy', jsonb_build_object(
      'fecha', v_hoy,
      'vendido', (select coalesce(round(sum(monto), 2), 0) from ventas_filtradas where fecha = v_hoy),
      'turno_abierto', (select jsonb_build_object('id', s.id, 'cajero', coalesce(pf.nombre, s.abierta_por))
                        from public.sesion_caja s left join public.perfil pf on pf.id = s.cajero_id
                        where s.estado = 'ABIERTA' order by s.id desc limit 1),
      'pedidos_abiertos', (select count(*) from pedidos_filtrados where estado = 'ABIERTO' and categoria <> 'TIENDA'),
      'lineas_por_despachar', (select count(*) from public.pedido_linea pl join pedidos_filtrados p on p.id = pl.pedido_id
                               where pl.estado = 'POR_DESPACHAR' and p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'),
      'por_comprar', (select count(*) from analitica.f_compras(p_filtros)
                      where estado = 'SOLICITADA'))
  ) into r;

  return r;
end;
$$;
notify pgrst,'reload schema';
