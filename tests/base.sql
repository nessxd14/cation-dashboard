-- Ejecutar dentro de BEGIN ISOLATION LEVEL REPEATABLE READ y terminar con ROLLBACK.
-- Los costos y metas de prueba nunca se conservan.
select set_config('dashboard.test_usuario',(select perfil_id::text from analitica.acceso order by perfil_id limit 1),true);
select set_config('dashboard.test_filtros',(select jsonb_strip_nulls(jsonb_build_object('sucursal',sucursal_id::text,'vendedor',vendedor_clave,'cliente',cliente_id::text,'producto',producto_id::text,'canal',canal))::text from analitica.venta_dimension where producto_id is not null and cliente_id is not null and sucursal_id is not null and fecha between date '2026-10-01' and date '2026-10-26' order by fecha desc limit 1),true);
set local role authenticated;
do $$
declare f jsonb; r jsonb; v jsonb; a jsonb; fin jsonb; d jsonb; n int:=0; meta jsonb; prod bigint;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  begin
    perform public.dash_catalogos();
    raise exception 'ERROR: cuenta no autorizada leyó catálogos';
  exception when insufficient_privilege then null; end;
  begin
    perform public.dash_guardar_meta(date '2099-11-01','',100,200);
    raise exception 'ERROR: cuenta no autorizada guardó metas';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('authenticated','analitica.meta','select') or has_function_privilege('authenticated','analitica.f_ventas(jsonb)','execute') then raise exception 'Acceso directo a datos privados'; end if;
  if has_function_privilege('anon','public.dash_exportar(text,date,date,jsonb)','execute') then raise exception 'Exportación accesible a anon'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('dashboard.test_usuario'),true);
  for f in select '{}'::jsonb union all select jsonb_build_object(key,value) from jsonb_each(current_setting('dashboard.test_filtros')::jsonb) union all select current_setting('dashboard.test_filtros')::jsonb loop
    r:=public.dash_resumen('2026-10-01','2026-10-26',f);
    v:=public.dash_ventas('2026-10-01','2026-10-26',f);
    a:=public.dash_almacen('2026-10-01','2026-10-26',f);
    fin:=public.dash_finanzas('2026-10-01','2026-10-26',f);
    d:=public.dash_detalle('ventas','2026-10-01','2026-10-26',f,1,1);
    if (r#>>'{vendido,total}')::numeric<>(v->>'total')::numeric or (v->>'total')::numeric<>(d->>'monto')::numeric then raise exception 'Ventas y detalle no coinciden: %',f; end if;
    d:=public.dash_detalle('cobros','2026-10-01','2026-10-26',f,1,1);
    if (r#>>'{cobrado,total}')::numeric<>(fin#>>'{cobranza,total}')::numeric or (r#>>'{cobrado,total}')::numeric<>(d->>'monto')::numeric then raise exception 'Cobros y detalle no coinciden: %',f; end if;
    d:=public.dash_detalle('salidas','2026-10-01','2026-10-26',f,1,1);
    if (r#>>'{salidas,valor_total}')::numeric<>(a->>'salidas_valor')::numeric or (a->>'salidas_valor')::numeric<>(d->>'monto')::numeric then raise exception 'Salidas y detalle no coinciden: %',f; end if;
    n:=n+1;
  end loop;
  a:=public.dash_almacen('2026-10-01','2026-10-26','{"cliente":"9999999999999"}');
  if jsonb_array_length(a#>'{despacho,atrasados}')<>0 then raise exception 'Lista de pedidos ignora filtro de cliente'; end if;
  fin:=public.dash_finanzas('2026-10-01','2026-10-26','{}');
  d:=public.dash_finanzas('2026-10-01','2026-10-26','{"producto":"1"}');
  if (fin#>'{caja,remesas}') is distinct from (d#>'{caja,remesas}') then raise exception 'Caja general cambia con filtro comercial'; end if;
  d:=public.dash_exportar('ventas','2026-10-01','2026-10-26','{}');
  if jsonb_array_length(d->'filas')<>(d->>'total')::int then raise exception 'Exportación truncada'; end if;
  a:=public.dash_exportar('inventario','2026-10-01','2026-10-26','{}');
  if jsonb_array_length(a->'filas')<>(a->>'total')::int then raise exception 'Inventario truncado'; end if;
  if exists(select 1 from jsonb_array_elements(a->'filas') x where (x->>'disponible')::numeric<0 or (x->>'disponible')::numeric>greatest((x->>'fisico')::numeric,0)) then raise exception 'Disponible inválido'; end if;
  perform public.dash_guardar_meta('2099-11-01','',123.45,678.9);
  meta:=public.dash_metas('2099-11-01','');
  if (meta#>>'{meta,ventas}')::numeric<>123.45 or (meta#>>'{meta,cobranza}')::numeric<>678.9 then raise exception 'Meta no persistió'; end if;
  prod:=(current_setting('dashboard.test_filtros')::jsonb->>'producto')::bigint;
  perform public.dash_guardar_costo(prod,'2000-01-01',0.25,'Prueba temporal, se revierte');
  d:=public.dash_margen('2026-10-01','2026-10-26',jsonb_build_object('producto',prod::text));
  if (d->>'con_costo')::numeric<=0 or (d->>'lineas_sin_costo')::int<>0 then raise exception 'Costo vigente no se aplicó'; end if;
  perform public.dash_guardar_costo(prod,'2026-10-01',0.5,'Segundo costo temporal');
  d:=public.dash_margen('2026-09-01','2026-09-30',jsonb_build_object('producto',prod::text));
  if (d->>'vendido')::numeric>0 and (d->>'costo')::numeric is null then raise exception 'Costo histórico perdido'; end if;
  begin perform public.dash_guardar_costo(prod,'2026-10-01',-1,'');raise exception 'Costo negativo aceptado';exception when invalid_parameter_value then null;end;
  begin perform public.dash_resumen('2025-01-01','2026-10-26','{}');raise exception 'Rango excesivo aceptado';exception when invalid_parameter_value then null;end;
  perform set_config('dashboard.test_resultado',format('%s combinaciones de filtros; totales, exportación, inventario, metas, costos y permisos correctos',n),true);
end $$;
reset role;
select current_setting('dashboard.test_resultado') resultado;
