-- Velocidad: Inventario y Salud de datos.
--
-- Mismas firmas y MISMO resultado que antes; solo cambia cómo se calcula.
--
-- 1) analitica.inventario: el stock físico, los traslados en tránsito y las ubicaciones se
--    calculaban con subconsultas por producto (1.656 productos × 3 recorridos del stock).
--    Ahora se agrupan una sola vez por producto y se unen. ~7,3 s → ~0,3 s.
--    Única diferencia visible: si un producto tiene dos ubicaciones con la misma sucursal y
--    el mismo código de zona, antes salían en orden al azar; ahora se desempatan por id.
-- 2) public.dash_salud, indicador "Kardex vs stock actual": sumaba el kardex con una
--    subconsulta por cada fila de stock. Ahora agrupa el kardex una vez y une. ~0,5 s → ~0,04 s.
--
-- No escribe en ninguna tabla.

create or replace function analitica.inventario(p_filtros jsonb, p_pagina integer, p_limite integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare r jsonb;
begin
 perform analitica.exigir_acceso();
 if p_pagina<1 or p_pagina>100000 or p_limite<1 or p_limite>100000 then raise exception 'Paginación inválida' using errcode='22023'; end if;
 with fisico as materialized (
   select s.producto_id,u.sucursal_id,s.cantidad_base,sc.nombre sucursal,u.codigo_zona ubicacion,u.id ubicacion_id
   from public.stock_actual s join public.ubicacion u on u.id=s.ubicacion_id join public.sucursal sc on sc.id=u.sucursal_id
   where sc.tipo<>'virtual' and not coalesce(u.excluye_disponible,false)
 ), fisico_producto as (
   -- Una sola pasada por el stock: total global, total de la sucursal filtrada y ubicaciones
   select s.producto_id,
     sum(s.cantidad_base) fisico_global,
     sum(s.cantidad_base) filter (where nullif(p_filtros->>'sucursal','') is null or s.sucursal_id::text=p_filtros->>'sucursal') fisico,
     jsonb_agg(jsonb_build_object('sucursal',s.sucursal,'ubicacion',s.ubicacion,'cantidad',s.cantidad_base) order by s.sucursal,s.ubicacion,s.ubicacion_id)
       filter (where s.cantidad_base<>0 and (nullif(p_filtros->>'sucursal','') is null or s.sucursal_id::text=p_filtros->>'sucursal')) ubicaciones
   from fisico s group by s.producto_id
 ), transito as (
   select l.producto_id, sum(greatest(coalesce(l.cantidad_despachada,0)-coalesce(l.cantidad_recibida,0),0)) cantidad
   from public.solicitud_traslado_linea l join public.solicitud_traslado t on t.id=l.solicitud_id
   where t.estado::text='EN_TRANSITO' and (nullif(p_filtros->>'sucursal','') is null or t.sucursal_destino_id::text=p_filtros->>'sucursal')
   group by l.producto_id
 ), reserva as (select producto_id,sum(pendiente) cantidad from public.v_pedido_linea_reserva where reserva group by producto_id),
 salidas as (select producto_id,sum(-cantidad)/30 diario from analitica.f_stock(p_filtros-'cliente'-'vendedor'-'canal')
   where cantidad<0 and origen in ('VENTA_RETAIL','DESPACHO_PEDIDO') and fecha between (now() at time zone 'America/La_Paz')::date-29 and (now() at time zone 'America/La_Paz')::date group by producto_id),
 base as (
   select pr.id::text id,pr.nombre producto,pr.unidad_base unidad,coalesce(pr.stock_min,0) minimo,coalesce(pr.punto_reorden,0) reorden,
     coalesce(fp.fisico_global,0) fisico_global,
     coalesce(fp.fisico,0) fisico,
     coalesce(rv.cantidad,0) reservado_global,sa.diario,
     coalesce(tr.cantidad,0) transito,
     coalesce(fp.ubicaciones,'[]') ubicaciones
   from public.producto pr
   left join fisico_producto fp on fp.producto_id=pr.id
   left join transito tr on tr.producto_id=pr.id
   left join reserva rv on rv.producto_id=pr.id
   left join salidas sa on sa.producto_id=pr.id
   where pr.activo and (nullif(p_filtros->>'producto','') is null or pr.id::text=p_filtros->>'producto')
 ), disponible as (select *,greatest(least(fisico,fisico_global-reservado_global),0) disponible from base),
 x as materialized (select *,case when diario>0 then round(disponible/diario,1) end cobertura_dias,
   case when disponible<=0 then 'SIN_STOCK' when disponible<greatest(minimo,reorden) then 'BAJO_MINIMO' when diario>0 and disponible/diario<7 then 'RIESGO_7_DIAS' else 'OK' end estado from disponible)
 select jsonb_build_object('total',(select count(*) from x),'sin_stock',(select count(*) from x where estado='SIN_STOCK'),
 'bajo_minimo',(select count(*) from x where estado='BAJO_MINIMO'),'riesgo',(select count(*) from x where estado='RIESGO_7_DIAS'),
 'filas',(select coalesce(jsonb_agg(to_jsonb(s) order by orden,producto,id),'[]') from (select *,case estado when 'SIN_STOCK' then 1 when 'BAJO_MINIMO' then 2 when 'RIESGO_7_DIAS' then 3 else 4 end orden from x order by orden,producto,id limit p_limite offset ((p_pagina-1)*p_limite)) s)) into r;
 return r;
end $function$;

create or replace function public.dash_salud()
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'analitica', 'pg_temp' as $function$
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
      from public.stock_actual s
      left join (select producto_id, ubicacion_id, sum(cantidad) k
                   from public.kardex_transacciones group by producto_id, ubicacion_id) k
        on k.producto_id = s.producto_id and k.ubicacion_id = s.ubicacion_id
     where abs(s.cantidad_base - coalesce(k.k, 0)) > 0.001
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
$function$;

notify pgrst,'reload schema';
