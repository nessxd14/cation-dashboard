-- Mantiene el alcance general de caja y aplica filtros a las listas de pedidos.
create or replace function analitica.dash_ventas(p_desde date, p_hasta date, p_filtros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pdesde date := p_desde - ((p_hasta - p_desde) + 1);
  v_phasta date := p_desde - 1;
  r jsonb;
begin
  perform analitica.exigir_acceso();
  perform analitica.validar_periodo(p_desde,p_hasta);
  if p_hasta < p_desde or (p_hasta - p_desde) > 400 then
    raise exception 'rango inválido: % a %', p_desde, p_hasta;
  end if;

  with hv as (
    select * from analitica.f_ventas(p_filtros) where fecha between p_desde and p_hasta
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
    'prev',  (select coalesce(round(sum(monto), 2), 0) from analitica.f_ventas(p_filtros) where fecha between v_pdesde and v_phasta),
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
                           from analitica.f_pedidos(p_filtros) p
                           join analitica.f_ventas(p_filtros) h on h.origen = 'PEDIDO' and h.doc_id = p.id
                           left join public.cliente c on c.id = p.cliente_id
                          where p.estado = 'ABIERTO'
                          group by p.id, p.numero, c.nombre, p.creado_en
                          order by sum(h.monto * (1 - least(1, coalesce(h.cantidad_entregada, 0) / nullif(h.cantidad_base, 0)))) desc nulls last
                          limit 10) s)
  ) into r;

  return r;
end;
$$;

create or replace function analitica.dash_almacen(p_desde date, p_hasta date, p_filtros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/La_Paz')::date;
  r jsonb;
begin
  perform analitica.exigir_acceso();
  perform analitica.validar_periodo(p_desde,p_hasta);
  if p_hasta < p_desde or (p_hasta - p_desde) > 400 then
    raise exception 'rango inválido: % a %', p_desde, p_hasta;
  end if;

  with hs as (
    select * from analitica.f_stock(p_filtros) where fecha between p_desde and p_hasta
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
      from analitica.f_pedidos(p_filtros) p join fin f on f.pedido_id = p.id
     where p.estado = 'COMPLETADO' and p.categoria <> 'TIENDA'
       and (f.ultimo at time zone 'America/La_Paz')::date between p_desde and p_hasta
  ),
  stock_prod as (
    select s.producto_id, sum(s.cantidad_base) stock
      from public.stock_actual s join public.ubicacion u on u.id = s.ubicacion_id
     where not coalesce(u.excluye_disponible, false) and (nullif(p_filtros->>'sucursal','') is null or u.sucursal_id::text=p_filtros->>'sucursal') and (nullif(p_filtros->>'producto','') is null or s.producto_id::text=p_filtros->>'producto')
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
      'pedidos_abiertos', (select count(*) from analitica.f_pedidos(p_filtros) where estado = 'ABIERTO' and categoria <> 'TIENDA'),
      'lineas_por_despachar', (select count(*) from public.pedido_linea pl join analitica.f_pedidos(p_filtros) p on p.id = pl.pedido_id
                               where pl.estado = 'POR_DESPACHAR' and p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'),
      'atrasados', (select coalesce(jsonb_agg(x order by (x->>'dias')::int desc), '[]'::jsonb)
                    from (select jsonb_build_object(
                                   'numero', p.numero,
                                   'cliente', coalesce(c.nombre, '—'),
                                   'dias', v_hoy - (p.creado_en at time zone 'America/La_Paz')::date,
                                   'lineas', count(*) filter (where pl.estado = 'POR_DESPACHAR')) x
                            from analitica.f_pedidos(p_filtros) p
                            join public.pedido_linea pl on pl.pedido_id = p.id
                            left join public.cliente c on c.id = p.cliente_id
                           where p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'
                           group by p.id, p.numero, c.nombre, p.creado_en
                          having count(*) filter (where pl.estado = 'POR_DESPACHAR') > 0
                           order by p.creado_en
                           limit 10) s)),

    'por_comprar', jsonb_build_object(
      'total', (select count(*) from analitica.f_compras(p_filtros) where estado = 'SOLICITADA'),
      'items', (select coalesce(jsonb_agg(x order by (x->>'dias')::int desc), '[]'::jsonb)
                from (select jsonb_build_object(
                               'descripcion', coalesce(pr.nombre, cs.descripcion, '—'),
                               'cantidad', cs.cantidad_base,
                               'dias', v_hoy - (cs.solicitado_en at time zone 'America/La_Paz')::date,
                               'origen', cs.origen) x
                        from analitica.f_compras(p_filtros) cs left join public.producto pr on pr.id = cs.producto_id
                       where cs.estado = 'SOLICITADA'
                       order by cs.solicitado_en
                       limit 10) s)),

    'traslados_en_transito', jsonb_build_object(
      'total', (select count(*) from analitica.f_traslados(p_filtros) where estado::text = 'EN_TRANSITO'),
      'items', (select coalesce(jsonb_agg(x order by (x->>'dias')::int desc), '[]'::jsonb)
                from (select jsonb_build_object(
                               'numero', coalesce(t.numero, '#' || t.id),
                               'despachado', (t.despachado_en at time zone 'America/La_Paz')::date,
                               'dias', v_hoy - (coalesce(t.despachado_en, t.solicitado_en) at time zone 'America/La_Paz')::date,
                               'lineas', (select count(*) from public.solicitud_traslado_linea l where l.solicitud_id = t.id)) x
                        from analitica.f_traslados(p_filtros) t
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

create or replace function analitica.dash_finanzas(p_desde date, p_hasta date, p_filtros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/La_Paz')::date;
  v_pdesde date := p_desde - ((p_hasta - p_desde) + 1);
  v_phasta date := p_desde - 1;
  r jsonb;
begin
  perform analitica.exigir_acceso();
  perform analitica.validar_periodo(p_desde,p_hasta);
  if p_hasta < p_desde or (p_hasta - p_desde) > 400 then
    raise exception 'rango inválido: % a %', p_desde, p_hasta;
  end if;

  with cobros as (
    select * from analitica.f_dinero(p_filtros)
     where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta
  ),
  partidas as (
    select a.partida_id, a.cliente, a.saldo_partida, a.fecha_vencimiento, a.estado_reloj,
           v_hoy - coalesce(pa.fecha_entrega, (pa.creado_en at time zone 'America/La_Paz')::date) dias
      from hermes.v_antiguedad a
      join hermes.partida_abierta pa on pa.id = a.partida_id
     where a.saldo_partida > 0 and exists(select 1 from analitica.f_cartera(p_filtros) c where c.cliente_id=a.cliente_id)
  ),
  turnos as (
    select s.*, coalesce(pf.nombre, s.abierta_por) cajero
      from public.sesion_caja s left join public.perfil pf on pf.id = s.cajero_id
     where (s.abierta_en at time zone 'America/La_Paz')::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'dias', (p_hasta - p_desde) + 1),

    'cobranza', jsonb_build_object(
      'total',  (select coalesce(round(sum(monto), 2), 0) from cobros),
      'prev',   (select coalesce(round(sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
                  where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between v_pdesde and v_phasta),
      'retail', (select coalesce(round(sum(monto), 2), 0) from cobros where tipo = 'COBRO_RETAIL'),
      'cuenta', (select coalesce(round(sum(monto), 2), 0) from cobros where tipo = 'COBRO_CUENTA'),
      'por_medio', (select coalesce(jsonb_agg(jsonb_build_object('medio', medio, 'monto', monto, 'n', n) order by monto desc), '[]'::jsonb)
                    from (select medio, round(sum(monto), 2) monto, count(*) n from cobros group by medio) s),
      'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'cuenta', coalesce(x.cuenta, 0), 'retail', coalesce(x.retail, 0)) order by d.fecha), '[]'::jsonb)
                from (select generate_series(p_desde, p_hasta, interval '1 day')::date fecha) d
                left join (select fecha,
                                  round(sum(monto) filter (where tipo = 'COBRO_CUENTA'), 2) cuenta,
                                  round(sum(monto) filter (where tipo = 'COBRO_RETAIL'), 2) retail
                             from cobros group by fecha) x on x.fecha = d.fecha),
      'por_verificar', (select jsonb_build_object('n', count(*), 'monto', coalesce(round(sum(monto), 2), 0))
                        from hermes.pago where estado = 'PROPUESTO')),

    'cartera', jsonb_build_object(
      'total',    (select coalesce(round(sum(saldo_confirmado), 2), 0) from analitica.f_cartera(p_filtros) where saldo_confirmado > 0),
      'clientes', (select count(*) from analitica.f_cartera(p_filtros) where saldo_confirmado > 0),
      'vencido',  (select coalesce(round(sum(monto_vencido), 2), 0) from analitica.f_cartera(p_filtros) where saldo_confirmado > 0),
      'sin_reloj', (select coalesce(round(sum(saldo_partida), 2), 0) from partidas where fecha_vencimiento is null),
      'sin_partida', (select coalesce(round(sum(saldo_sin_partida), 2), 0) from analitica.f_cartera(p_filtros) where saldo_sin_partida > 0),
      'antiguedad', (select jsonb_agg(jsonb_build_object('tramo', tramo, 'monto', monto, 'partidas', n) order by orden)
                     from (select t.orden, t.tramo, coalesce(round(sum(p.saldo_partida), 2), 0) monto, count(p.partida_id) n
                             from (values (1, '0–30', 0, 30), (2, '31–60', 31, 60), (3, '61–90', 61, 90), (4, '+90', 91, 100000)) t(orden, tramo, d0, d1)
                             left join partidas p on p.dias between t.d0 and t.d1
                            group by t.orden, t.tramo) s),
      'clientes_top', (select coalesce(jsonb_agg(x order by (x->>'saldo')::numeric desc), '[]'::jsonb)
                       from (select jsonb_build_object(
                                      'cliente', cliente,
                                      'saldo', round(saldo_confirmado, 2),
                                      'vencido', round(coalesce(monto_vencido, 0), 2),
                                      'dias_vencido', dias_vencido_max,
                                      'ultimo_pago', (ultimo_pago_en at time zone 'America/La_Paz')::date,
                                      'situacion', situacion) x
                               from analitica.f_cartera(p_filtros)
                              where saldo_confirmado > 0
                              order by saldo_confirmado desc
                              limit 12) s)),

    'caja', jsonb_build_object(
      'turnos', (select count(*) from turnos),
      'sobrante', (select coalesce(round(sum(diferencia) filter (where diferencia > 0), 2), 0) from turnos),
      'faltante', (select coalesce(round(sum(diferencia) filter (where diferencia < 0), 2), 0) from turnos),
      'con_diferencia', (select count(*) from turnos where abs(coalesce(diferencia, 0)) >= 10),
      'lista', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', t.id, 'cajero', t.cajero, 'estado', t.estado,
                         'abierta', t.abierta_en, 'cerrada', t.cerrada_en,
                         'diferencia', t.diferencia,
                         'revisada_por', coalesce(rp.nombre, t.revisada_por),
                         'nota', nullif(trim(t.nota_revision), '')) order by t.id desc), '[]'::jsonb)
                from (select * from turnos order by id desc limit 20) t
                left join public.perfil rp on rp.email = t.revisada_por),
      'gastos', (select jsonb_build_object(
                   'aprobado',  coalesce(round(sum(monto) filter (where estado = 'APROBADO'), 2), 0),
                   'pendiente', coalesce(round(sum(monto) filter (where estado = 'PENDIENTE'), 2), 0),
                   'rechazado', coalesce(round(sum(monto) filter (where estado = 'RECHAZADO'), 2), 0),
                   'n_pendiente', count(*) filter (where estado = 'PENDIENTE'))
                 from public.caja_gasto
                 where (registrado_en at time zone 'America/La_Paz')::date between p_desde and p_hasta),
      'remesas', (select coalesce(round(-sum(monto), 2), 0) from analitica.hecho_dinero
                  where tipo = 'EGRESO_REMESA' and fecha between p_desde and p_hasta),
      'inyecciones', (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_dinero
                      where tipo = 'INGRESO_INYECCION' and fecha between p_desde and p_hasta)),

    -- Faltantes: todos los tiempos, porque los pendientes no caducan.
    'faltantes', (select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'n', n, 'monto', monto) order by monto desc), '[]'::jsonb)
                  from (select estado, count(*) n, round(sum(monto), 2) monto from public.caja_faltante group by estado) s),

    'comisiones', jsonb_build_object(
      'devengadas', (select coalesce(round(sum(monto), 2), 0) from public.comision_devengo
                     where estado = 'DEVENGADA' and documento_fecha between p_desde and p_hasta),
      'potenciales', (select coalesce(round(sum(monto), 2), 0) from public.comision_devengo
                      where estado = 'POTENCIAL' and documento_fecha between p_desde and p_hasta),
      'liquidadas', (select coalesce(round(sum(monto_total), 2), 0) from public.comision_liquidacion
                     where anulado_en is null and (creado_en at time zone 'America/La_Paz')::date between p_desde and p_hasta),
      'por_vendedor', (select coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor, 'monto', monto, 'docs', n) order by monto desc), '[]'::jsonb)
                       from (select coalesce(pf.nombre, d.vendedor_email) vendedor, round(sum(d.monto), 2) monto, count(*) n
                               from public.comision_devengo d left join public.perfil pf on pf.email = d.vendedor_email
                              where d.estado = 'DEVENGADA' and d.documento_fecha between p_desde and p_hasta
                              group by 1) s))
  ) into r;

  return r;
end;
$$;
