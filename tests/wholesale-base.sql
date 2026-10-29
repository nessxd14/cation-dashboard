-- Solo lectura de operaciones, pruebas dentro de transacción y ROLLBACK.
begin isolation level repeatable read;
select set_config('dashboard.test_usuario',(select perfil_id::text from analitica.acceso order by perfil_id limit 1),true);
select set_config('dashboard.test_pedido',(select id::text from public.pedido where categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO') order by creado_en desc limit 1),true);
select set_config('dashboard.test_retail',(select id::text from public.pedido where categoria::text='TIENDA' limit 1),true);
set local role authenticated;
do $$ declare d jsonb; r jsonb; f jsonb; pid bigint; begin
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin perform public.dash_wholesale_lista('2026-10-01','2026-10-29','{}','',1); raise exception 'Se permitió una cuenta no autorizada'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','analitica.pedido_lectura_ia','insert') or has_table_privilege('authenticated','analitica.pedido_clip','select') or has_function_privilege('anon','public.dash_wholesale_expediente(bigint,bigint)','execute') then raise exception 'Permisos incorrectos'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('dashboard.test_usuario'),true);
 r:=public.dash_wholesale_lista('2026-10-01','2026-10-29','{}','',1);
 if jsonb_array_length(r->'filas')>25 or exists(select 1 from jsonb_array_elements(r->'filas') p where p->>'categoria' not in ('MAYOR','INSTITUCIONAL','CORPORATIVO')) then raise exception 'Paginación o categorías incorrectas'; end if;
 pid:=current_setting('dashboard.test_pedido')::bigint;
 d:=public.dash_wholesale_expediente(pid);
 if d#>>'{pedido,id}'<>pid::text then raise exception 'Pedido equivocado'; end if;
 if public.dash_wholesale_archivo(pid,'operacion','no-existe',0) is not null then raise exception 'Archivo ficticio'; end if;
 if current_setting('dashboard.test_retail',true)<>'' then
  begin perform public.dash_wholesale_expediente(current_setting('dashboard.test_retail')::bigint); raise exception 'Retail expuesto'; exception when no_data_found then null; end;
 end if;
 for f in select '{}'::jsonb union all select jsonb_build_object('canal','INSTITUCIONAL') union all select jsonb_build_object('cliente',d#>>'{pedido,cliente_id}') loop
  r:=public.dash_wholesale_lista('2026-10-01','2026-10-29',f,'',1);
  if exists(select 1 from jsonb_array_elements(r->'filas') x where (f ? 'canal' and x->>'categoria'<>f->>'canal') or (f ? 'cliente' and x->>'cliente_id'<>f->>'cliente')) then raise exception 'Filtro ignorado'; end if;
 end loop;
 r:=public.dash_wholesale_lista('2026-10-01','2026-10-29','{}','%_sin_coincidencia_',1);
 if (r->>'total')::int<>0 then raise exception 'Búsqueda interpretó comodines'; end if;
 begin perform public.dash_wholesale_lista('2020-01-01','2026-10-29','{}','',1); raise exception 'Período excesivo aceptado'; exception when invalid_parameter_value then null; end;
 perform set_config('dashboard.test_resultado','WholeSale: acceso, retail excluido, paginación, filtros, búsqueda literal, período y archivos correctos',true);
end $$;
reset role;
select current_setting('dashboard.test_resultado') resultado;
rollback;
