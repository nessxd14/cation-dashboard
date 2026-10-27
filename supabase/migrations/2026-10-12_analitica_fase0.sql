-- =====================================================================
-- Dashboard CATION — Fase 0: capa de lectura `analitica`
-- 2026-10-12
--
-- Crea:
--   analitica.acceso          quién puede leer el dashboard (Ness + gerente)
--   analitica.hecho_venta     una fila por línea vendida (retail + pedidos)
--   analitica.hecho_stock     una fila por movimiento de kardex, con origen
--   analitica.hecho_dinero    una fila por cobro (retail, cuenta) o egreso/ingreso de caja
--   public.dash_acceso()      true si el usuario actual puede ver el dashboard
--   public.dash_resumen(desde, hasta)  todo lo de la pantalla Resumen en una llamada
--   public.dash_salud()       indicadores de confianza de los datos
--
-- Reglas de conteo (ver doc "Dashboard CATION — Diseño"):
--   * Ventas: venta COMPLETADA + pedido no CANCELADO; pedidos TIENDA fuera
--     (reposición interna). Líneas RECHAZADO / RETIRADA fuera. Una línea
--     CAMBIADA lleva el dinero de su reemplazo (el reemplazo viene con
--     subtotal NULL); si el reemplazo trae su propio subtotal, manda el reemplazo.
--   * Stock: kardex clasificado por enlace (venta_linea / despacho / traslado),
--     nunca por el texto de `referencia`. Despachos de pedidos TIENDA =
--     REPOSICION_TIENDA (movimiento interno). Valor = precio de venta de la línea.
--   * Dinero: retail = venta_pago de ventas COMPLETADA; cuenta de cliente =
--     hermes.pago CONFIRMADO/ACREDITADO. movimiento_caja ANTICIPO y ANULACION
--     NO se suman (ya están representados en hermes.pago / en ventas anuladas).
--   * Fechas: día en America/La_Paz.
--
-- Solo lectura sobre tablas existentes. No modifica nada operativo.
-- =====================================================================

create schema if not exists analitica;
revoke all on schema analitica from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Acceso
-- ---------------------------------------------------------------------
create table if not exists analitica.acceso (
  perfil_id  uuid primary key references public.perfil(id) on delete cascade,
  nota       text,
  creado_en  timestamptz not null default now()
);
revoke all on analitica.acceso from public, anon, authenticated;

insert into analitica.acceso (perfil_id, nota) values
  ('06d97fe8-b246-4c82-99d5-f5e612b4bb60', 'Ness'),
  ('fdf2f198-c3e7-41ec-8dd9-321e19a44cd5', 'Rony (gerente)')
on conflict (perfil_id) do nothing;

-- ---------------------------------------------------------------------
-- hecho_venta
-- ---------------------------------------------------------------------
create or replace view analitica.hecho_venta as
select
  'RETAIL'::text                                         as origen,
  v.id                                                   as doc_id,
  v.numero                                               as doc_numero,
  vl.id                                                  as linea_id,
  v.creado_en                                            as momento,
  (v.creado_en at time zone 'America/La_Paz')::date      as fecha,
  case when u.codigo_zona = 'VENTAS DIRECTAS' then 'VTD' else 'MOSTRADOR' end as canal,
  v.cliente_id,
  coalesce(pf.nombre, v.creado_por)                      as vendedor,
  vl.producto_id,
  coalesce(vl.es_personalizado, false)                   as es_personalizado,
  coalesce(vl.descripcion, pr.nombre)                    as descripcion,
  pr.familia_id,
  vl.cantidad                                            as cantidad_base,
  vl.precio_lista,
  vl.precio_unitario,
  coalesce(vl.subtotal, 0)                               as monto,
  vl.cantidad                                            as cantidad_entregada,
  v.sesion_caja_id
from public.venta v
join public.venta_linea vl on vl.venta_id = v.id
join public.ubicacion u    on u.id = v.ubicacion_id
left join public.perfil pf on pf.id = v.vendedor_id
left join public.producto pr on pr.id = vl.producto_id
where v.estado = 'COMPLETADA'

union all

select
  'PEDIDO'::text,
  p.id,
  p.numero,
  pl.id,
  p.creado_en,
  (p.creado_en at time zone 'America/La_Paz')::date,
  p.categoria::text,
  p.cliente_id,
  p.creado_por::text,
  coalesce(r.producto_id, pl.producto_id),
  coalesce(r.es_personalizado, pl.es_personalizado, false),
  coalesce(r.descripcion, rp.nombre, pl.descripcion, pr.nombre),
  coalesce(rp.familia_id, pr.familia_id),
  coalesce(r.cantidad_base, pl.cantidad_base),
  pl.precio_lista,
  pl.precio_unitario,
  case
    when pl.estado = 'CAMBIADA' and coalesce(r.subtotal, 0) <> 0 then 0
    else coalesce(pl.subtotal, 0)
  end,
  coalesce(r.cantidad_despachada, pl.cantidad_despachada, 0),
  null::bigint
from public.pedido p
join public.pedido_linea pl     on pl.pedido_id = p.id
left join public.pedido_linea r on r.id = pl.reemplazada_por_id
left join public.producto pr    on pr.id = pl.producto_id
left join public.producto rp    on rp.id = r.producto_id
where p.estado <> 'CANCELADO'
  and p.categoria <> 'TIENDA'
  and pl.estado not in ('RECHAZADO', 'RETIRADA')
  -- el reemplazo sin precio propio ya está representado por su línea CAMBIADA
  and not (
    pl.subtotal is null
    and exists (select 1 from public.pedido_linea o where o.reemplazada_por_id = pl.id)
  );

-- ---------------------------------------------------------------------
-- hecho_stock
-- ---------------------------------------------------------------------
create or replace view analitica.hecho_stock as
select
  k.id                                                   as kardex_id,
  k.creado_en                                            as momento,
  coalesce(k.fecha_efectiva, (k.creado_en at time zone 'America/La_Paz')::date) as fecha,
  k.producto_id,
  pr.familia_id,
  k.ubicacion_id,
  u.sucursal_id,
  u.codigo_zona,
  k.tipo_movimiento::text                                as tipo,
  case
    when vl.id  is not null                              then 'VENTA_RETAIL'
    when pdm.id is not null and ped.categoria = 'TIENDA' then 'REPOSICION_TIENDA'  -- interno, no es salida de la empresa
    when pdm.id is not null                              then 'DESPACHO_PEDIDO'
    when k.traslado_grupo_id is not null
      or k.tipo_movimiento = 'TRASLADO'                  then 'TRASLADO'
    when k.tipo_movimiento = 'INV_INICIAL'               then 'INVENTARIO_INICIAL'
    when k.tipo_movimiento = 'AJUSTE'                    then 'AJUSTE'
    when k.tipo_movimiento = 'ENTRADA'                   then 'ENTRADA'
    else 'OTRO'
  end                                                    as origen,
  k.cantidad,                                            -- con signo, en unidad base
  -- Valor a precio de VENTA real de la línea que originó la salida.
  -- No se usa producto.precio_base: está por presentación, no por unidad base,
  -- y multiplicado por unidades base infla el valor (6,8 M Bs en 30 días).
  case
    when vl.id  is not null then vl.subtotal
    when pdm.id is not null and ped.categoria <> 'TIENDA' then
      coalesce(pel.subtotal, orig.subtotal) * pdm.cantidad_base / nullif(pel.cantidad_base, 0)
  end                                                    as valor_venta,
  vl.venta_id,
  pel.pedido_id,
  k.referencia,
  k.creado_por
from public.kardex_transacciones k
left join public.producto pr  on pr.id = k.producto_id
left join public.ubicacion u  on u.id = k.ubicacion_id
left join public.venta_linea vl on vl.kardex_transaccion_id = k.id
left join public.pedido_despacho_movimiento pdm on pdm.kardex_transaccion_id = k.id
left join public.pedido_despacho_evento pde on pde.id = pdm.evento_id
left join public.pedido_linea pel on pel.id = pde.pedido_linea_id
left join public.pedido ped       on ped.id = pel.pedido_id
-- si la línea despachada es el reemplazo de una CAMBIADA, el precio está en la original
left join public.pedido_linea orig on orig.reemplazada_por_id = pel.id and pel.subtotal is null;

-- ---------------------------------------------------------------------
-- hecho_dinero
-- ---------------------------------------------------------------------
create or replace view analitica.hecho_dinero as
-- Cobro de venta retail (mostrador / VTD)
select
  'COBRO_RETAIL'::text                                   as tipo,
  'venta_pago'::text                                     as fuente,
  vp.id                                                  as fuente_id,
  vp.creado_en                                           as momento,
  (vp.creado_en at time zone 'America/La_Paz')::date     as fecha,
  vp.metodo::text                                        as medio,
  vp.monto                                               as monto,
  v.cliente_id,
  v.id                                                   as venta_id,
  v.sesion_caja_id,
  vp.estado_verificacion                                 as estado
from public.venta_pago vp
join public.venta v on v.id = vp.venta_id
where v.estado = 'COMPLETADA'

union all

-- Cobro a cuenta de cliente (pedidos), sea por caja o por banco
select
  'COBRO_CUENTA',
  'hermes.pago',
  hp.id,
  coalesce(hp.confirmado_en, hp.creado_en),
  coalesce(hp.fecha_recepcion, (hp.creado_en at time zone 'America/La_Paz')::date),
  hp.medio::text,
  hp.monto,
  hp.cliente_id,
  null::bigint,
  null::bigint,
  hp.estado::text
from hermes.pago hp
where hp.estado in ('CONFIRMADO', 'ACREDITADO')

union all

-- Egresos e ingresos de caja (gasto, remesa, inyección)
select
  mc.tipo::text || '_' || coalesce(mc.subtipo, 'OTRO'),
  'movimiento_caja',
  mc.id,
  mc.creado_en,
  (mc.creado_en at time zone 'America/La_Paz')::date,
  mc.metodo::text,
  case when mc.tipo = 'EGRESO' then -mc.monto else mc.monto end,
  mc.cliente_id,
  mc.venta_id,
  mc.sesion_caja_id,
  null::text
from public.movimiento_caja mc
where mc.tipo in ('EGRESO', 'INGRESO');

revoke all on all tables in schema analitica from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC: acceso
-- ---------------------------------------------------------------------
create or replace function public.dash_acceso()
returns boolean
language sql
stable
security definer
set search_path = public, analitica, pg_temp
as $$
  select exists (
    select 1
    from analitica.acceso a
    join public.perfil p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and p.activo
  );
$$;
revoke all on function public.dash_acceso() from anon, public;
grant execute on function public.dash_acceso() to authenticated, service_role;


-- ---------------------------------------------------------------------
-- RPC: resumen del período (pantalla Resumen) — todo en una sola llamada
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
                      where estado not in ('RECIBIDO', 'CANCELADO', 'CANCELADA')))
  ) into r;

  return r;
end;
$$;
revoke all on function public.dash_resumen(date, date) from anon, public;
grant execute on function public.dash_resumen(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: salud de datos (no depende del período)
-- ---------------------------------------------------------------------
create or replace function public.dash_salud()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, analitica, pg_temp
as $$
declare r jsonb;
begin
  if not public.dash_acceso() and current_user <> 'service_role' then
    raise exception 'sin acceso al dashboard' using errcode = '42501';
  end if;

  with x as (
    select 1 orden, 'lineas_rechazadas_cobradas' clave, 'alto' nivel,
           'Líneas rechazadas que se siguen cobrando' titulo,
           count(distinct pl.pedido_id) || ' pedidos · en el total del pedido y en Hermes' detalle,
           coalesce(round(sum(pl.subtotal)), 0)::numeric valor, 'Bs' unidad
      from public.pedido_linea pl join public.pedido p on p.id = pl.pedido_id
     where pl.estado = 'RECHAZADO' and p.estado <> 'CANCELADO' and p.categoria <> 'TIENDA'
    union all
    select 2, 'qr_sin_verificar', 'medio', 'Cobros QR sin verificar',
           'Sin vínculo con el movimiento del banco', count(*), null
      from public.venta_pago vp join public.venta v on v.id = vp.venta_id
     where v.estado = 'COMPLETADA' and vp.metodo = 'QR' and vp.estado_verificacion = 'PENDIENTE'
    union all
    select 3, 'salidas_sin_enlace', 'medio', 'Salidas de almacén sin enlace',
           'Shopify, RECON y cargas manuales', count(*), null
      from analitica.hecho_stock where origen = 'OTRO'
    union all
    select 4, 'traslados_en_transito', 'medio', 'Traslados en tránsito',
           'Despachados y no recibidos', count(*), null
      from public.solicitud_traslado where estado::text = 'EN_TRANSITO'
    union all
    select 5, 'productos_sin_precio', 'medio', 'Productos activos sin precio',
           'No se pueden valorizar', count(*), null
      from public.producto where activo and coalesce(precio_base, 0) = 0
    union all
    select 6, 'turnos_abiertos_24h', 'medio', 'Turnos de caja abiertos más de 24 h',
           'Deberían haberse cerrado', count(*), null
      from public.sesion_caja where estado = 'ABIERTA' and abierta_en < now() - interval '24 hours'
    union all
    select 7, 'kardex_vs_stock', 'ok', 'Kardex vs stock actual',
           'Diferencias entre el libro y el stock', count(*), null
      from (select s.producto_id, s.ubicacion_id, s.cantidad_base,
                   (select coalesce(sum(k.cantidad), 0) from public.kardex_transacciones k
                     where k.producto_id = s.producto_id and k.ubicacion_id = s.ubicacion_id) k
              from public.stock_actual s) d
     where abs(d.cantidad_base - d.k) > 0.001
  )
  select jsonb_agg(jsonb_build_object(
           'clave', clave,
           -- un indicador en cero siempre es "ok"; si no, su nivel
           'nivel', case when valor = 0 then 'ok' when nivel = 'ok' then 'alto' else nivel end,
           'titulo', titulo, 'detalle', detalle, 'valor', valor, 'unidad', unidad)
         order by orden)
    into r
    from x;

  return r;
end;
$$;
revoke all on function public.dash_salud() from anon, public;
grant execute on function public.dash_salud() to authenticated, service_role;
