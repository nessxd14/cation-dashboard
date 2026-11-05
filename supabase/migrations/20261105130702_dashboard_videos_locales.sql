-- Solo configuración del puente y referencias. Ningún archivo de video se sube a la DB.
create table analitica.video_equipo (
 id uuid primary key,
 nombre text not null check(length(nombre) between 1 and 100),
 clave text not null check(clave ~ '^[a-f0-9]{64}$'),
 activo boolean not null default true,
 creado_por uuid not null references public.perfil(id),
 creado_en timestamptz not null default now()
);
create table analitica.pedido_video_local (
 id uuid primary key default gen_random_uuid(),
 preparacion_id bigint not null references public.almacen_preparacion(id),
 archivo_clave text not null check(archivo_clave ~ '^[a-f0-9]{64}$'),
 archivo_nombre text not null check(length(archivo_nombre) between 1 and 255 and archivo_nombre !~ '[/\\]'),
 bytes bigint not null check(bytes>0),
 camara text not null check(length(camara) between 1 and 160),
 inicio timestamptz,
 fin timestamptz,
 activo boolean not null default true,
 creado_por uuid not null references public.perfil(id),
 creado_en timestamptz not null default now(),
 check((inicio is null and fin is null) or (inicio is not null and fin is not null and fin>inicio))
);
create unique index pedido_video_local_vigente on analitica.pedido_video_local(preparacion_id,archivo_clave) where activo;
create index pedido_video_local_preparacion on analitica.pedido_video_local(preparacion_id,creado_en);
alter table analitica.video_equipo enable row level security;
alter table analitica.pedido_video_local enable row level security;
revoke all on analitica.video_equipo,analitica.pedido_video_local from public,anon,authenticated;

create function analitica.video_registrar_equipo(p_id uuid,p_nombre text,p_clave text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e analitica.video_equipo%rowtype;
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 if p_id is null or p_nombre is null or length(btrim(p_nombre)) not between 1 and 100 or p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then raise exception 'Código de equipo inválido' using errcode='22023'; end if;
 select * into e from analitica.video_equipo where id=p_id;
 if found and (not e.activo or e.clave<>p_clave) then raise exception 'El código no coincide con el equipo registrado' using errcode='22023'; end if;
 insert into analitica.video_equipo(id,nombre,clave,creado_por) values(p_id,btrim(p_nombre),p_clave,auth.uid()) on conflict(id) do nothing;
 return jsonb_build_object('id',p_id,'nombre',(select nombre from analitica.video_equipo where id=p_id));
end $$;

create function analitica.video_acceso(p_equipo uuid,p_reto text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare clave text; carga text; vence bigint;
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 if p_equipo is null or p_reto is null or p_reto !~ '^[a-f0-9]{64}$' then raise exception 'Equipo inválido' using errcode='22023'; end if;
 select e.clave into clave from analitica.video_equipo e where id=p_equipo and e.activo;
 if not found then raise no_data_found using message='Primero vincula esta PC en Videos locales'; end if;
 vence:=extract(epoch from now())::bigint+90;
 carga:=rtrim(translate(replace(encode(convert_to(jsonb_build_object('aud','cation-videos-locales','equipo',p_equipo::text,'usuario',auth.uid()::text,'reto',p_reto,'exp',vence)::text,'UTF8'),'base64'),E'\n',''),'+/','-_'),'=');
 return jsonb_build_object('ticket',carga||'.'||encode(extensions.hmac(carga,clave,'sha256'),'hex'),'expira',vence);
end $$;

create function analitica.videos_locales(p_pedido bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 if not exists(select 1 from public.pedido where id=p_pedido and categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')) then raise no_data_found using message='Pedido WholeSale no encontrado'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',v.id::text,'preparacion_id',v.preparacion_id::text,'archivo_clave',v.archivo_clave,'archivo_nombre',v.archivo_nombre,'bytes',v.bytes,'camara',v.camara,'inicio',v.inicio,'fin',v.fin) order by v.creado_en),'[]')
 from analitica.pedido_video_local v join public.almacen_preparacion a on a.id=v.preparacion_id where a.pedido_id=p_pedido and v.activo);
end $$;

create function analitica.vincular_video_local(p_pedido bigint,p_preparacion bigint,p_archivo text,p_nombre text,p_bytes bigint,p_camara text,p_inicio timestamptz,p_fin timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare resultado uuid;
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 if p_archivo is null or p_archivo !~ '^[a-f0-9]{64}$' or p_nombre is null or length(p_nombre) not between 1 and 255 or p_nombre ~ '[/\\]'
 or p_bytes is null or p_bytes<=0 or p_camara is null or length(btrim(p_camara)) not between 1 and 160
 or not ((p_inicio is null and p_fin is null) or (p_inicio is not null and p_fin is not null and p_fin>p_inicio)) then raise exception 'Referencia de video inválida' using errcode='22023'; end if;
 if not exists(select 1 from public.almacen_preparacion a join public.pedido p on p.id=a.pedido_id where a.id=p_preparacion and p.id=p_pedido and p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')) then raise exception 'La preparación no pertenece al pedido' using errcode='22023'; end if;
 insert into analitica.pedido_video_local(preparacion_id,archivo_clave,archivo_nombre,bytes,camara,inicio,fin,creado_por)
 values(p_preparacion,p_archivo,p_nombre,p_bytes,btrim(p_camara),p_inicio,p_fin,auth.uid())
 on conflict(preparacion_id,archivo_clave) where activo do update set archivo_nombre=excluded.archivo_nombre,bytes=excluded.bytes,camara=excluded.camara,inicio=excluded.inicio,fin=excluded.fin returning id into resultado;
 return resultado;
end $$;

create function analitica.desvincular_video_local(p_video uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.dash_acceso() then raise exception 'Sin acceso al Dashboard' using errcode='42501'; end if;
 update analitica.pedido_video_local set activo=false where id=p_video;
end $$;

create function public.dash_video_registrar_equipo(p_id uuid,p_nombre text,p_clave text) returns jsonb language sql security invoker set search_path='' as $$ select analitica.video_registrar_equipo(p_id,p_nombre,p_clave) $$;
create function public.dash_video_acceso(p_equipo uuid,p_reto text) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.video_acceso(p_equipo,p_reto) $$;
create function public.dash_videos_locales(p_pedido bigint) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.videos_locales(p_pedido) $$;
create function public.dash_vincular_video_local(p_pedido bigint,p_preparacion bigint,p_archivo text,p_nombre text,p_bytes bigint,p_camara text,p_inicio timestamptz,p_fin timestamptz) returns uuid language sql security invoker set search_path='' as $$ select analitica.vincular_video_local(p_pedido,p_preparacion,p_archivo,p_nombre,p_bytes,p_camara,p_inicio,p_fin) $$;
create function public.dash_desvincular_video_local(p_video uuid) returns void language sql security invoker set search_path='' as $$ select analitica.desvincular_video_local(p_video) $$;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='analitica' and p.proname in ('video_registrar_equipo','video_acceso','videos_locales','vincular_video_local','desvincular_video_local')) or
 (n.nspname='public' and p.proname in ('dash_video_registrar_equipo','dash_video_acceso','dash_videos_locales','dash_vincular_video_local','dash_desvincular_video_local')) loop
 execute format('revoke all on function %s from public,anon',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst,'reload schema';
