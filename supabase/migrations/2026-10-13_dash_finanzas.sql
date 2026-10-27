-- =====================================================================
-- Dashboard CATION — Fase 3: pantalla Finanzas
-- 2026-10-13
--
--   public.dash_finanzas(desde, hasta)
--     cobranza   cobrado por medio y por día (retail + cuenta de clientes)
--     cartera    saldo por cliente, antigüedad de partidas, vencido, sin reloj
--     caja       turnos del período con su diferencia, gastos, remesas
--     faltantes  por estado (pendiente / repuesto / condonado)
--     comisiones devengadas en el período y liquidadas
--
-- Antigüedad: días desde la entrega de la partida (o su creación si no tiene
-- fecha de entrega). Se usa en lugar del vencimiento porque la mayoría de las
-- partidas institucionales todavía no tiene reloj (esperan factura).
--
-- Requiere 2026-10-12_analitica_fase0.sql. Solo lectura.
-- =====================================================================

create or replace function public.dash_finanzas(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, analitica, hermes, pg_temp
as $$
declare
  v_hoy date := (now() at time zone 'America/La_Paz')::date;
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

  with cobros as (
    select * from analitica.hecho_dinero
     where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta
  ),
  partidas as (
    select a.partida_id, a.cliente, a.saldo_partida, a.fecha_vencimiento, a.estado_reloj,
           v_hoy - coalesce(pa.fecha_entrega, (pa.creado_en at time zone 'America/La_Paz')::date) dias
      from hermes.v_antiguedad a
      join hermes.partida_abierta pa on pa.id = a.partida_id
     where a.saldo_partida > 0
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
      'prev',   (select coalesce(round(sum(monto), 2), 0) from analitica.hecho_dinero
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
      'total',    (select coalesce(round(sum(saldo_confirmado), 2), 0) from hermes.v_cliente_cartera where saldo_confirmado > 0),
      'clientes', (select count(*) from hermes.v_cliente_cartera where saldo_confirmado > 0),
      'vencido',  (select coalesce(round(sum(monto_vencido), 2), 0) from hermes.v_cliente_cartera where saldo_confirmado > 0),
      'sin_reloj', (select coalesce(round(sum(saldo_partida), 2), 0) from partidas where fecha_vencimiento is null),
      'sin_partida', (select coalesce(round(sum(saldo_sin_partida), 2), 0) from hermes.v_cliente_cartera where saldo_sin_partida > 0),
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
                               from hermes.v_cliente_cartera
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
revoke all on function public.dash_finanzas(date, date) from anon, public;
grant execute on function public.dash_finanzas(date, date) to authenticated, service_role;
