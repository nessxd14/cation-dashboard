-- =====================================================================
-- Dashboard CATION — Fase 2: pantallas Ventas y Almacén
-- 2026-10-12 (b)
--
--   public.dash_ventas(desde, hasta)   todo lo de la pantalla Ventas
--   public.dash_almacen(desde, hasta)  todo lo de la pantalla Almacén
--   public.dash_resumen                corrección: "por comprar" contaba
--                                      también las compras RECIBIDA
--
-- Requiere 2026-10-12_analitica_fase0.sql aplicada. Solo lectura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RPC: resumen del período (corrección de "por comprar")
-- ---------------------------------------------------------------------
create or replace function public.dash_resumen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, analitica, pg_temp
as $$
declare
  v_dias   int  := (p_hasta - p_desde) + 1;
  v_pdesde date := p_desde - ((p_hasta - p_desde) + 1);
  v_phasta date := p_desde - 1;
  v_hoy    date := (now() at time zone 'America/La_Paz')::date;
  r jsonb;
begin
  if not public.dash_acceso() and current_user <> 'service_role' then
    raise exception 'sin acceso al dashboard' using errcode = '42501';
  end if;
  if p_hasta < p_desde then
    raise exception 'rango inválido: % > %', p_desde, p_hasta;
  end if;
  if v_dias > 400 then
    raise exception 'rango demasiado largo (% días, máximo 400)', v_dias;
  end if;

  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'dias', v_dias,
                                  'prev_desde', v_pdesde, 'prev_hasta', v_phasta),

    'vendido', jsonb_build_object(
      'total', (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_venta
                 where fecha between p_desde and p_hasta),
      'prev',  (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_venta
                 where fecha between v_pdesde and v_phasta),
      'pedidos', (select count(distinct doc_id) from analitica.hecho_venta
                   where origen = 'PEDIDO' and fecha between p_desde and p_hasta),
      'ventas_retail', (select count(distinct doc_id) from analitica.hecho_venta
                         where origen = 'RETAIL' and fecha between p_desde and p_hasta),
      'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('canal', canal, 'monto', monto) order by monto desc), '[]'::jsonb)
                    from (select canal, round(sum(monto), 2) monto from analitica.hecho_venta
                          where fecha between p_desde and p_hasta group by canal) s)),

    'cobrado', jsonb_build_object(
      'total', (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_dinero
                 where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta),
      'prev',  (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_dinero
                 where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between v_pdesde and v_phasta),
      'retail', (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_dinero
                  where tipo = 'COBRO_RETAIL' and fecha between p_desde and p_hasta),
      'cuenta', (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_dinero
                  where tipo = 'COBRO_CUENTA' and fecha between p_desde and p_hasta),
      'qr_sin_verificar', (select count(*) from analitica.hecho_dinero
                            where tipo = 'COBRO_RETAIL' and medio = 'QR' and estado = 'PENDIENTE'
                              and fecha between p_desde and p_hasta),
      'por_medio', (select coalesce(jsonb_agg(jsonb_build_object('medio', medio, 'monto', monto) order by monto desc), '[]'::jsonb)
                    from (select medio, round(sum(monto), 2) monto from analitica.hecho_dinero
                          where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta
                          group by medio) s)),

    'egresos_caja', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'monto', monto)), '[]'::jsonb)
                     from (select tipo, round(sum(monto), 2) monto from analitica.hecho_dinero
                           where tipo like 'EGRESO%' and fecha between p_desde and p_hasta group by tipo) s),

    'cartera', jsonb_build_object(
      'total',    (select coalesce(round(sum(saldo_confirmado), 2), 0) from hermes.v_saldo_cliente where saldo_confirmado > 0),
      'clientes', (select count(*) from hermes.v_saldo_cliente where saldo_confirmado > 0),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
              from (select cliente, round(saldo_confirmado, 2) saldo from hermes.v_saldo_cliente
                    where saldo_confirmado > 0 order by saldo_confirmado desc limit 6) s)),

    'salidas', jsonb_build_object(
      'valor_total', (select coalesce(round(sum(valor_venta), 2), 0) from analitica.hecho_stock
                       where cantidad < 0 and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO')
                         and fecha between p_desde and p_hasta),
      'por_origen', (select coalesce(jsonb_agg(jsonb_build_object('origen', origen, 'unidades', unidades, 'valor', valor) order by unidades desc), '[]'::jsonb)
                     from (select origen, round(sum(-cantidad), 2) unidades, round(sum(valor_venta), 2) valor
                           from analitica.hecho_stock
                           where cantidad < 0
                             and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO', 'AJUSTE', 'OTRO', 'REPOSICION_TIENDA')
                             and fecha between p_desde and p_hasta
                           group by origen) s)),

    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'pedidos', coalesce(x.pedidos, 0), 'retail', coalesce(x.retail, 0)) order by d.fecha), '[]'::jsonb)
              from (select generate_series(p_desde, p_hasta, interval '1 day')::date fecha) d
              left join (select fecha,
                                round(sum(monto) filter (where origen = 'PEDIDO'), 2) pedidos,
                                round(sum(monto) filter (where origen = 'RETAIL'), 2) retail
                         from analitica.hecho_venta where fecha between p_desde and p_hasta group by fecha) x
                on x.fecha = d.fecha),

    'top_productos', (select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'monto', monto) order by monto desc), '[]'::jsonb)
                      from (select descripcion, round(sum(monto), 2) monto from analitica.hecho_venta
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
      'vendido', (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_venta where fecha = v_hoy),
      'turno_abierto', (select jsonb_build_object('id', s.id, 'cajero', coalesce(pf.nombre, s.abierta_por))
                        from public.sesion_caja s left join public.perfil pf on pf.id = s.cajero_id
                        where s.estado = 'ABIERTA' order by s.id desc limit 1),
      'pedidos_abiertos', (select count(*) from public.pedido where estado = 'ABIERTO' and categoria <> 'TIENDA'),
      'lineas_por_despachar', (select count(*) from public.pedido_linea pl join public.pedido p on p.id = pl.pedido_id
                               where pl.estado = 'POR_DESPACHAR' and p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'),
      'por_comprar', (select count(*) from public.compra_solicitud
                      where estado = 'SOLICITADA'))
  ) into r;

  return r;
end;
$$;
revoke all on function public.dash_resumen(date, date) from anon, public;
grant execute on function public.dash_resumen(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: Ventas
-- ---------------------------------------------------------------------
create or replace function public.dash_ventas(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, analitica, pg_temp
as $$
declare
  v_pdesde date := p_desde - ((p_hasta - p_desde) + 1);
  v_phasta date := p_desde - 1;
  r jsonb;
begin
  if not public.dash_acceso() and current_user <> 'service_role' then
    raise exception 'sin acceso al dashboard' using errcode = '42501';
  end if;
  if p_hasta < p_desde or (p_hasta - p_desde) > 400 then
    raise exception 'rango inválido: % a %', p_desde, p_hasta;
  end if;

  with hv as (
    select * from analitica.hecho_venta where fecha between p_desde and p_hasta
  ),
  docs as (
    select origen, doc_id, canal, cliente_id, vendedor, sum(monto) monto
      from hv group by origen, doc_id, canal, cliente_id, vendedor
  ),
  -- Pedidos del período: lo vendido contra lo que ya salió (proporcional a lo despachado por línea).
  ped as (
    select doc_id,
           sum(monto) vendido,
           sum(monto * least(1, coalesce(cantidad_entregada, 0) / nullif(cantidad_base, 0))) entregado
      from hv where origen = 'PEDIDO' group by doc_id
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde) + 1),
    'total', (select coalesce(round(sum(monto), 2), 0) from docs),
    'prev',  (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_venta where fecha between v_pdesde and v_phasta),
    'ventas_retail', (select count(*) from docs where origen = 'RETAIL'),
    'pedidos', (select count(*) from docs where origen = 'PEDIDO'),
    'ticket_retail', (select coalesce(round(avg(monto), 2), 0) from docs where origen = 'RETAIL'),
    'ticket_pedido', (select coalesce(round(avg(monto), 2), 0) from docs where origen = 'PEDIDO'),

    'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('canal', canal, 'docs', n, 'monto', monto, 'ticket', ticket) order by monto desc), '[]'::jsonb)
                  from (select canal, count(*) n, round(sum(monto), 2) monto, round(avg(monto), 2) ticket from docs group by canal) s),

    'entrega', (select jsonb_build_object(
                  'vendido', coalesce(round(sum(vendido), 2), 0),
                  'entregado', coalesce(round(sum(entregado), 2), 0),
                  'pedidos_completos', count(*) filter (where entregado >= vendido - 0.5),
                  'pedidos', count(*))
                from ped),

    'por_vendedor', (select coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor, 'docs', n, 'monto', monto) order by monto desc), '[]'::jsonb)
                     from (select coalesce(pf.nombre, d.vendedor, 'Sin vendedor') vendedor, count(*) n, round(sum(d.monto), 2) monto
                             from docs d left join public.perfil pf on pf.email = d.vendedor
                            group by 1 order by sum(d.monto) desc limit 10) s),

    'top_clientes', (select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'docs', n, 'monto', monto) order by monto desc), '[]'::jsonb)
                     from (select c.nombre cliente, count(*) n, round(sum(d.monto), 2) monto
                             from docs d join public.cliente c on c.id = d.cliente_id
                            group by c.nombre order by sum(d.monto) desc limit 10) s),

    'top_productos', (select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'monto', monto) order by monto desc), '[]'::jsonb)
                      from (select descripcion, round(sum(cantidad_base), 2) cantidad, round(sum(monto), 2) monto
                              from hv where descripcion is not null
                             group by descripcion order by sum(monto) desc limit 10) s),

    'cotizaciones', (select jsonb_build_object(
                       'creadas', count(*),
                       'convertidas', count(*) filter (where estado = 'CONVERTIDA'),
                       'monto', coalesce(round(sum(total), 2), 0),
                       'monto_convertido', coalesce(round(sum(total) filter (where estado = 'CONVERTIDA'), 2), 0))
                     from public.cotizacion
                     where estado <> 'ANULADA'
                       and (creado_en at time zone 'America/La_Paz')::date between p_desde and p_hasta),

    -- Pedidos abiertos (cualquier fecha) con más plata por entregar.
    'pendientes', (select coalesce(jsonb_agg(x order by (x->>'pendiente')::numeric desc), '[]'::jsonb)
                   from (select jsonb_build_object(
                                  'numero', p.numero,
                                  'cliente', coalesce(c.nombre, '—'),
                                  'creado', (p.creado_en at time zone 'America/La_Paz')::date,
                                  'vendido', round(sum(h.monto), 2),
                                  'pendiente', round(sum(h.monto * (1 - least(1, coalesce(h.cantidad_entregada, 0) / nullif(h.cantidad_base, 0)))), 2)) x
                           from public.pedido p
                           join analitica.hecho_venta h on h.origen = 'PEDIDO' and h.doc_id = p.id
                           left join public.cliente c on c.id = p.cliente_id
                          where p.estado = 'ABIERTO'
                          group by p.id, p.numero, c.nombre, p.creado_en
                          order by sum(h.monto * (1 - least(1, coalesce(h.cantidad_entregada, 0) / nullif(h.cantidad_base, 0)))) desc nulls last
                          limit 10) s)
  ) into r;

  return r;
end;
$$;
revoke all on function public.dash_ventas(date, date) from anon, public;
grant execute on function public.dash_ventas(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: Almacén
-- ---------------------------------------------------------------------
create or replace function public.dash_almacen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, analitica, pg_temp
as $$
declare
  v_hoy date := (now() at time zone 'America/La_Paz')::date;
  r jsonb;
begin
  if not public.dash_acceso() and current_user <> 'service_role' then
    raise exception 'sin acceso al dashboard' using errcode = '42501';
  end if;
  if p_hasta < p_desde or (p_hasta - p_desde) > 400 then
    raise exception 'rango inválido: % a %', p_desde, p_hasta;
  end if;

  with hs as (
    select * from analitica.hecho_stock where fecha between p_desde and p_hasta
  ),
  -- Fin de despacho de cada pedido = último evento de despacho no revertido.
  fin as (
    select pl.pedido_id, max(e.creado_en) ultimo
      from public.pedido_despacho_evento e
      join public.pedido_linea pl on pl.id = e.pedido_linea_id
     where not coalesce(e.revertido, false)
     group by pl.pedido_id
  ),
  completos as (
    select p.id, extract(epoch from (f.ultimo - p.creado_en)) / 3600.0 horas
      from public.pedido p join fin f on f.pedido_id = p.id
     where p.estado = 'COMPLETADO' and p.categoria <> 'TIENDA'
       and (f.ultimo at time zone 'America/La_Paz')::date between p_desde and p_hasta
  ),
  stock_prod as (
    select s.producto_id, sum(s.cantidad_base) stock
      from public.stock_actual s join public.ubicacion u on u.id = s.ubicacion_id
     where not coalesce(u.excluye_disponible, false)
     group by s.producto_id having sum(s.cantidad_base) > 0
  ),
  sin_mov as (
    select sp.producto_id, sp.stock
      from stock_prod sp
     where not exists (select 1 from public.kardex_transacciones k
                        where k.producto_id = sp.producto_id and k.cantidad < 0
                          and k.creado_en >= now() - interval '60 days')
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde) + 1),

    'salidas_valor', (select coalesce(round(sum(valor_venta), 2), 0) from hs
                      where cantidad < 0 and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO')),
    'salidas_movimientos', (select count(*) from hs
                            where cantidad < 0 and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO')),
    'entradas_unidades', (select coalesce(round(sum(cantidad), 2), 0) from hs where origen = 'ENTRADA' and cantidad > 0),
    'ajustes_neto', (select coalesce(round(sum(cantidad), 2), 0) from hs where origen = 'AJUSTE'),

    'por_origen', (select coalesce(jsonb_agg(jsonb_build_object('origen', origen, 'movimientos', n, 'unidades', unidades, 'valor', valor) order by unidades desc), '[]'::jsonb)
                   from (select origen, count(*) n, round(sum(-cantidad), 2) unidades, round(sum(valor_venta), 2) valor
                           from hs where cantidad < 0 and origen <> 'TRASLADO' group by origen) s),

    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'despacho', coalesce(x.despacho, 0), 'retail', coalesce(x.retail, 0)) order by d.fecha), '[]'::jsonb)
              from (select generate_series(p_desde, p_hasta, interval '1 day')::date fecha) d
              left join (select fecha,
                                round(sum(valor_venta) filter (where origen = 'DESPACHO_PEDIDO'), 2) despacho,
                                round(sum(valor_venta) filter (where origen = 'VENTA_RETAIL'), 2) retail
                           from hs where cantidad < 0 group by fecha) x on x.fecha = d.fecha),

    'despacho', jsonb_build_object(
      'pedidos_completados', (select count(*) from completos),
      'horas_mediana', (select round((percentile_cont(0.5) within group (order by horas))::numeric, 1) from completos),
      'pedidos_abiertos', (select count(*) from public.pedido where estado = 'ABIERTO' and categoria <> 'TIENDA'),
      'lineas_por_despachar', (select count(*) from public.pedido_linea pl join public.pedido p on p.id = pl.pedido_id
                               where pl.estado = 'POR_DESPACHAR' and p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'),
      'atrasados', (select coalesce(jsonb_agg(x order by (x->>'dias')::int desc), '[]'::jsonb)
                    from (select jsonb_build_object(
                                   'numero', p.numero,
                                   'cliente', coalesce(c.nombre, '—'),
                                   'dias', v_hoy - (p.creado_en at time zone 'America/La_Paz')::date,
                                   'lineas', count(*) filter (where pl.estado = 'POR_DESPACHAR')) x
                            from public.pedido p
                            join public.pedido_linea pl on pl.pedido_id = p.id
                            left join public.cliente c on c.id = p.cliente_id
                           where p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'
                           group by p.id, p.numero, c.nombre, p.creado_en
                          having count(*) filter (where pl.estado = 'POR_DESPACHAR') > 0
                           order by p.creado_en
                           limit 10) s)),

    'por_comprar', jsonb_build_object(
      'total', (select count(*) from public.compra_solicitud where estado = 'SOLICITADA'),
      'items', (select coalesce(jsonb_agg(x order by (x->>'dias')::int desc), '[]'::jsonb)
                from (select jsonb_build_object(
                               'descripcion', coalesce(pr.nombre, cs.descripcion, '—'),
                               'cantidad', cs.cantidad_base,
                               'dias', v_hoy - (cs.solicitado_en at time zone 'America/La_Paz')::date,
                               'origen', cs.origen) x
                        from public.compra_solicitud cs left join public.producto pr on pr.id = cs.producto_id
                       where cs.estado = 'SOLICITADA'
                       order by cs.solicitado_en
                       limit 10) s)),

    'traslados_en_transito', jsonb_build_object(
      'total', (select count(*) from public.solicitud_traslado where estado::text = 'EN_TRANSITO'),
      'items', (select coalesce(jsonb_agg(x order by (x->>'dias')::int desc), '[]'::jsonb)
                from (select jsonb_build_object(
                               'numero', coalesce(t.numero, '#' || t.id),
                               'despachado', (t.despachado_en at time zone 'America/La_Paz')::date,
                               'dias', v_hoy - (coalesce(t.despachado_en, t.solicitado_en) at time zone 'America/La_Paz')::date,
                               'lineas', (select count(*) from public.solicitud_traslado_linea l where l.solicitud_id = t.id)) x
                        from public.solicitud_traslado t
                       where t.estado::text = 'EN_TRANSITO'
                       order by coalesce(t.despachado_en, t.solicitado_en)
                       limit 10) s)),

    'sin_movimiento', jsonb_build_object(
      'total', (select count(*) from sin_mov),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('producto', pr.nombre, 'stock', round(sm.stock, 2)) order by sm.stock desc), '[]'::jsonb)
                from (select * from sin_mov order by stock desc limit 10) sm
                join public.producto pr on pr.id = sm.producto_id)),

    -- Ordenado por valor: las unidades base mezclan hojas sueltas con cajas y no se comparan entre productos.
    'top_salidas', (select coalesce(jsonb_agg(jsonb_build_object('producto', producto, 'unidades', unidades, 'valor', valor) order by valor desc nulls last), '[]'::jsonb)
                    from (select pr.nombre producto, round(sum(-hs.cantidad), 2) unidades, round(sum(hs.valor_venta), 2) valor
                            from hs join public.producto pr on pr.id = hs.producto_id
                           where hs.cantidad < 0 and hs.origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO')
                           group by pr.nombre order by sum(hs.valor_venta) desc nulls last limit 10) s)
  ) into r;

  return r;
end;
$$;
revoke all on function public.dash_almacen(date, date) from anon, public;
grant execute on function public.dash_almacen(date, date) to authenticated, service_role;
