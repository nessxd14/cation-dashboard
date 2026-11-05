-- Referencias ficticias y equipo temporal; nunca conserva cambios operativos ni de configuración.
begin;
select set_config('request.jwt.claim.sub',(select perfil_id::text from analitica.acceso order by perfil_id limit 1),true);
select set_config('videos.test.preparacion',(select a.id::text from public.almacen_preparacion a join public.pedido p on p.id=a.pedido_id where p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO') order by a.id limit 1),true);
select set_config('videos.test.pedido',(select pedido_id::text from public.almacen_preparacion where id=current_setting('videos.test.preparacion')::bigint),true);
select set_config('videos.test.equipo',gen_random_uuid()::text,true);
set local role authenticated;
do $$
declare r jsonb; permiso jsonb; vinculo uuid; otro uuid; pedido bigint:=current_setting('videos.test.pedido')::bigint; prep bigint:=current_setting('videos.test.preparacion')::bigint; equipo uuid:=current_setting('videos.test.equipo')::uuid;
begin
 r:=public.dash_video_registrar_equipo(equipo,'Equipo temporal de prueba',repeat('a',64));
 if r->>'id'<>equipo::text or r ? 'clave' then raise exception 'Registro expone la clave'; end if;
 permiso:=public.dash_video_acceso(equipo,repeat('b',64));
 if length(permiso->>'ticket')<100 or (permiso->>'expira')::bigint<=extract(epoch from now()) then raise exception 'Permiso local inválido'; end if;
 perform set_config('videos.test.ticket',permiso->>'ticket',true);
 begin perform public.dash_video_registrar_equipo(equipo,'Otro equipo',repeat('c',64)); raise exception 'Clave distinta aceptada'; exception when invalid_parameter_value then null; end;
 vinculo:=public.dash_vincular_video_local(pedido,prep,repeat('d',64),'video-prueba.mp4',2048,'Cámara de prueba',null,null);
 otro:=public.dash_vincular_video_local(pedido,prep,repeat('d',64),'video-prueba.mp4',2048,'Cámara de prueba',null,null);
 if vinculo<>otro then raise exception 'Vínculo duplicado'; end if;
 r:=public.dash_videos_locales(pedido);
 if not exists(select 1 from jsonb_array_elements(r) v where v->>'id'=vinculo::text and v->>'archivo_clave'=repeat('d',64) and v->'inicio'='null'::jsonb) then raise exception 'Referencia ausente u horario inventado'; end if;
 begin perform public.dash_vincular_video_local(pedido,9223372036854775807,repeat('e',64),'otro.mp4',1,'Cámara',null,null); raise exception 'Preparación ajena aceptada'; exception when invalid_parameter_value then null; end;
 begin perform public.dash_vincular_video_local(pedido,prep,repeat('e',64),'../fuera.mp4',1,'Cámara',null,null); raise exception 'Ruta arbitraria aceptada'; exception when invalid_parameter_value then null; end;
 perform public.dash_desvincular_video_local(vinculo);
 if exists(select 1 from jsonb_array_elements(public.dash_videos_locales(pedido)) v where v->>'id'=vinculo::text) then raise exception 'Vínculo sigue activo'; end if;
 begin perform 1 from analitica.video_equipo; raise exception 'Clave accesible directamente'; exception when insufficient_privilege then null; end;
 begin perform 1 from analitica.pedido_video_local; raise exception 'Tabla accesible directamente'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin perform public.dash_video_acceso(equipo,repeat('b',64)); raise exception 'Equipo accesible sin autorización'; exception when insufficient_privilege then null; end;
 begin perform public.dash_videos_locales(pedido); raise exception 'Referencias sin autorización'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare carga text; sign text; begin
 if has_function_privilege('anon','public.dash_video_acceso(uuid,text)','execute') or has_function_privilege('anon','public.dash_vincular_video_local(bigint,bigint,text,text,bigint,text,timestamptz,timestamptz)','execute') then raise exception 'RPC accesible a anon'; end if;
 carga:=split_part(current_setting('videos.test.ticket'),'.',1);sign:=split_part(current_setting('videos.test.ticket'),'.',2);
 if sign<>encode(extensions.hmac(carga,repeat('a',64),'sha256'),'hex') then raise exception 'Firma incorrecta'; end if;
end $$;
select current_setting('videos.test.ticket') ticket_temporal, current_setting('videos.test.equipo') equipo_temporal;
rollback;
