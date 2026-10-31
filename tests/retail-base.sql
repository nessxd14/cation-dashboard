-- Comprueba contratos de lectura, filtros y permisos sin conservar cambios.
begin isolation level repeatable read;
select set_config('request.jwt.claim.sub',(select perfil_id::text from analitica.acceso order by perfil_id limit 1),true);
select set_config('retail.test.id',(select id::text from public.venta order by id desc limit 1),true);
select set_config('retail.test.vendedor',(select email from public.perfil where id in(select vendedor_id from public.venta where vendedor_id is not null) and email is not null limit 1),true);
select set_config('retail.test.esperado',(select jsonb_build_object('total',count(*),'importe',coalesce(sum(total) filter(where estado::text<>'ANULADA'),0))::text from public.venta where creado_en>=('2026-10-01'::timestamp at time zone 'America/La_Paz') and creado_en<('2026-11-01'::timestamp at time zone 'America/La_Paz')),true);
set local role authenticated;
do $$
declare r jsonb; a jsonb; b jsonb; d jsonb; e text; f jsonb; expected jsonb;
begin
 r:=public.dash_retail_lista('2026-10-01','2026-10-31','{}','TODAS','todos',1);
 expected:=current_setting('retail.test.esperado')::jsonb;
 if r->>'total'<>expected->>'total' or (r#>>'{resumen,importe}')::numeric<>(expected->>'importe')::numeric then raise exception 'Importe o documentos no coinciden con venta'; end if;
 if jsonb_array_length(r->'filas')>25 then raise exception 'Paginación sin límite'; end if;
 a:=public.dash_retail_lista('2026-10-01','2026-10-31','{}','VTD','todos',1);
 b:=public.dash_retail_lista('2026-10-01','2026-10-31','{}','VTA','todos',1);
 if (a->>'total')::int+(b->>'total')::int<>(r->>'total')::int then raise exception 'Tipos duplicados o perdidos'; end if;
 if exists(select 1 from jsonb_array_elements(a->'filas') x where x->>'tipo'<>'VTD' or jsonb_typeof(x->'entrega_pendiente')<>'boolean') then raise exception 'VTD o booleano inválido'; end if;
 for e in select unnest(array['entrega','cobro','revision','retorno','anulados']) loop
  a:=public.dash_retail_lista('2026-10-01','2026-10-31','{}','TODAS',e,1);
  if exists(select 1 from jsonb_array_elements(a->'filas') x where
   (e='entrega' and not (x->>'entrega_pendiente')::boolean) or
   (e='cobro' and (x->>'pendiente')::numeric<=0) or
   (e='revision' and ((x->>'en_revision')::numeric<=0 or (x->>'anulada')::boolean)) or
   (e='retorno' and not (x->>'retorno_pendiente')::boolean) or
   (e='anulados' and not (x->>'anulada')::boolean)) then raise exception 'Filtro de estado ignorado'; end if;
 end loop;
 for f in select '{}'::jsonb union all select '{"canal":"VTD"}'::jsonb union all select '{"canal":"MOSTRADOR"}'::jsonb union all select jsonb_build_object('vendedor',current_setting('retail.test.vendedor')) loop
  a:=public.dash_retail_lista('2026-10-01','2026-10-31',f,'TODAS','todos',1);
  for d in select value from jsonb_array_elements(a->'filas') loop
   b:=public.dash_retail_expediente((d->>'id')::bigint);
   if (b->>'cobrado')::numeric is distinct from (d->>'cobrado')::numeric or (b->>'pendiente')::numeric is distinct from (d->>'pendiente')::numeric then raise exception 'Lista y expediente difieren'; end if;
   if (b->>'cobrado')::numeric<>coalesce((select sum((p->>'monto')::numeric) from jsonb_array_elements(b->'pagos') p where p->>'estado' in ('NO_APLICA','VERIFICADO')),0) then raise exception 'Cobro duplicado o sin confirmar'; end if;
  end loop;
 end loop;
 if (public.dash_retail_lista('2026-10-01','2026-10-31','{"canal":"MAYOR"}','TODAS','todos',1)->>'total')::int<>0 then raise exception 'WholeSale mezclado'; end if;
 begin perform public.dash_retail_lista('2020-01-01','2026-10-31','{}','TODAS','todos',1); raise exception 'Rango excesivo aceptado'; exception when invalid_parameter_value then null; end;
 begin perform public.dash_retail_expediente(9223372036854775807); raise exception 'Documento inexistente aceptado'; exception when no_data_found then null; end;
 begin perform analitica.retail_documentos('2026-10-01','2026-10-31','{}'); raise exception 'Acceso directo al helper'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin perform public.dash_retail_expediente(current_setting('retail.test.id')::bigint); raise exception 'Cuenta no autorizada accedió'; exception when insufficient_privilege then null; end;
 begin perform public.dash_retail_lista('2026-10-01','2026-10-31','{}','TODAS','todos',1); raise exception 'Lista sin autorización'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.dash_retail_lista(date,date,jsonb,text,text,integer)','execute') or has_function_privilege('anon','public.dash_retail_expediente(bigint)','execute') then raise exception 'RPC expuesta a anon'; end if;
end $$;
rollback;
select 'Retail: totales, documentos completos, VTD/VTA, estados, pagos, límites y permisos correctos' resultado;
