-- Consolidado WholeSale: solo lectura de operaciones. Las dos tablas nuevas
-- reciben exclusivamente clips e interpretaciones externas, nunca estados operativos.
create table analitica.pedido_lectura_ia (
 id uuid primary key default gen_random_uuid(),
 pedido_id bigint not null references public.pedido(id),
 resumen text not null check(length(resumen) between 1 and 12000),
 observaciones jsonb not null default '[]' check(jsonb_typeof(observaciones)='array'),
 fuentes jsonb not null default '[]' check(jsonb_typeof(fuentes)='array'),
 agente text not null default 'OpenClaw' check(length(agente)<=120),
 generado_en timestamptz not null default now(),
 datos_hasta timestamptz not null,
 check(datos_hasta<=generado_en)
);
create index pedido_lectura_ia_pedido_idx on analitica.pedido_lectura_ia(pedido_id,generado_en desc);
create table analitica.pedido_clip (
 id uuid primary key default gen_random_uuid(),
 preparacion_id bigint not null references public.almacen_preparacion(id),
 camara text not null check(length(camara) between 1 and 160),
 inicio timestamptz not null,
 fin timestamptz not null check(fin>inicio),
 bucket text not null default 'wholesale-clips' check(bucket='wholesale-clips'),
 ruta text not null unique check(length(ruta) between 1 and 1000 and ruta !~ '(^/|\.\.)'),
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
 creado_en timestamptz not null default now()
);
create index pedido_clip_preparacion_idx on analitica.pedido_clip(preparacion_id,inicio);
alter table analitica.pedido_lectura_ia enable row level security;
alter table analitica.pedido_clip enable row level security;
create policy sin_acceso_directo on analitica.pedido_lectura_ia for all to authenticated using(false) with check(false);
create policy sin_acceso_directo on analitica.pedido_clip for all to authenticated using(false) with check(false);
revoke all on analitica.pedido_lectura_ia,analitica.pedido_clip from public,anon,authenticated;
grant select,insert on analitica.pedido_lectura_ia,analitica.pedido_clip to service_role;
insert into storage.buckets(id,name,public) values('wholesale-clips','wholesale-clips',false) on conflict(id) do nothing;

create function analitica.wholesale_fila(p_id bigint) returns jsonb
language sql stable set search_path='' as $$
select jsonb_build_object(
 'id',p.id::text,'numero',p.numero,'categoria',p.categoria,'estado',p.estado,
 'creado_en',p.creado_en,'vendedor',coalesce(pf.nombre,p.creado_por,'Sin responsable'),
 'cliente',coalesce(c.nombre,'Sin cliente'),'cliente_id',p.cliente_id::text,'total',p.total,
 'cotizacion_id',q.id::text,'cotizacion',q.numero,'cotizacion_en',q.creado_en,
 'preparaciones',coalesce(a.n,0),'preparado_en',a.preparado,'verificado_en',a.verificado,
 'ultima_preparacion_estado',(select estado from public.almacen_preparacion where pedido_id=p.id order by creado_en desc,id desc limit 1),
 'salidas',coalesce(s.n,0),'salida_en',s.fecha,'lineas_vigentes',l.vigentes,'lineas_entregadas',l.entregadas,
 'partidas',f.n,'aplicado',f.aplicado,'saldo',case when f.n>0 then f.saldo end,
 'en_revision',f.revision,'total_partidas',f.total_partidas,
 'ultima_actividad',greatest(p.creado_en,a.actividad,s.fecha))
from public.pedido p
left join public.cliente c on c.id=p.cliente_id
left join public.perfil pf on pf.email=p.creado_por
left join public.cotizacion q on q.id=p.cotizacion_origen_id
left join lateral(select count(*) n,max(preparado_en) preparado,max(verificado_en) verificado,max(actualizado_en) actividad
 from public.almacen_preparacion where pedido_id=p.id and estado<>'ANULADO') a on true
left join lateral(select count(*) n,max(e.creado_en) fecha from public.pedido_despacho_evento e
 join public.pedido_linea pl on pl.id=e.pedido_linea_id where pl.pedido_id=p.id and not coalesce(e.revertido,false)) s on true
left join lateral(select count(*) filter(where estado::text not in ('RECHAZADO','CAMBIADA','RETIRADA')) vigentes,
 count(*) filter(where estado::text not in ('RECHAZADO','CAMBIADA','RETIRADA') and cantidad_despachada>=cantidad_base) entregadas
 from public.pedido_linea where pedido_id=p.id) l on true
left join lateral(select count(*) n,coalesce(sum(imputado),0) aplicado,coalesce(sum(pendiente),0) saldo,
 coalesce(sum(en_revision),0) revision,coalesce(sum(total),0) total_partidas
 from hermes.v_partida_estado where pedido_id=p.id and estado::text<>'ANULADA') f on true
where p.id=p_id and p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO');
$$;

create function analitica.wholesale_lista(p_desde date,p_hasta date,p_filtros jsonb,p_buscar text,p_pagina integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_desde,p_hasta);
 if p_pagina is null or p_pagina<1 or p_pagina>100000 or length(coalesce(p_buscar,''))>120 or jsonb_typeof(p_filtros)<>'object' then
  raise exception 'Filtros inválidos' using errcode='22023'; end if;
 with filtrados as materialized (
  select p.id,p.creado_en from public.pedido p
  left join public.cliente c on c.id=p.cliente_id
  left join public.perfil pf on pf.email=p.creado_por
  where p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')
   and p.creado_en>=(p_desde::timestamp at time zone 'America/La_Paz')
   and p.creado_en<((p_hasta+1)::timestamp at time zone 'America/La_Paz')
   and (nullif(p_filtros->>'canal','') is null or p.categoria::text=p_filtros->>'canal')
   and (nullif(p_filtros->>'cliente','') is null or p.cliente_id::text=p_filtros->>'cliente')
   and (nullif(p_filtros->>'vendedor','') is null or p.creado_por=p_filtros->>'vendedor')
   and (nullif(p_filtros->>'producto','') is null or exists(select 1 from public.pedido_linea l where l.pedido_id=p.id and l.producto_id::text=p_filtros->>'producto'))
   and (nullif(p_filtros->>'sucursal','') is null or exists(select 1 from public.pedido_linea l where l.pedido_id=p.id and coalesce(l.sucursal_origen_id,pf.sucursal_id)::text=p_filtros->>'sucursal'))
   and (nullif(trim(p_buscar),'') is null or strpos(lower(coalesce(p.numero,'')||' '||coalesce(c.nombre,'')),lower(trim(p_buscar)))>0)
 ), pagina as (select * from filtrados order by creado_en desc,id desc offset (p_pagina-1)*25 limit 25)
 select jsonb_build_object('total',(select count(*) from filtrados),'filas',coalesce((select jsonb_agg(analitica.wholesale_fila(id) order by creado_en desc,id desc) from pagina),'[]'::jsonb)) into r;
 return r;
end $$;

create function analitica.wholesale_expediente(p_pedido bigint,p_antes bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cab jsonb; r jsonb;
begin
 perform analitica.exigir_acceso();
 cab:=analitica.wholesale_fila(p_pedido);
 if cab is null then raise exception 'Pedido WholeSale no encontrado' using errcode='P0002'; end if;
 select jsonb_build_object('pedido',cab,'consultado_en',statement_timestamp(),
 'cotizacion',(select jsonb_build_object('id',q.id::text,'numero',q.numero,'estado',q.estado,'version',q.version,
  'total',q.total,'creado_en',q.creado_en,'creado_por',q.creado_por,'notas',q.notas,'condiciones',q.condiciones_comerciales,
  'lineas',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id::text,'descripcion',coalesce(l.descripcion,pr.nombre),'cantidad',l.cantidad_base,'unidad',coalesce(l.unidad_medida,pr.unidad_base),'subtotal',l.subtotal) order by l.id),'[]') from public.cotizacion_linea l left join public.producto pr on pr.id=l.producto_id where l.cotizacion_id=q.id))
  from public.cotizacion q where q.id=(cab->>'cotizacion_id')::bigint),
 'lineas',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id::text,'producto_id',l.producto_id::text,'descripcion',coalesce(l.descripcion,pr.nombre,'Personalizado'),
  'cantidad',l.cantidad_base,'unidad',coalesce(l.unidad_medida,pr.unidad_base,'Unidad base'),'despachada',l.cantidad_despachada,
  'estado',l.estado,'subtotal',l.subtotal,'nota',l.nota) order by l.id),'[]') from public.pedido_linea l left join public.producto pr on pr.id=l.producto_id where l.pedido_id=p_pedido),
 'preparaciones',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'sucursal',s.nombre,'sucursal_id',a.sucursal_id::text,'estado',a.estado,
  'version',a.version,'preparador',a.preparador_nombre,'verificador',a.revisor_nombre,'creado_en',a.creado_en,'actualizado_en',a.actualizado_en,
  'preparado_en',a.preparado_en,'verificado_en',a.verificado_en,'dos_actores',a.flujo_dos_actores,
  'lineas',(select coalesce(jsonb_agg(jsonb_build_object('linea_id',l.pedido_linea_id::text,'vigente',l.vigente,'preparada',l.preparada_base,
   'verificada',l.revisada_base,'verificada_en',l.revisada_en,'observacion',l.observacion,'observacion_revision',l.observacion_revision,
   'descripcion',coalesce(l.snapshot->>'nombre',l.snapshot->>'descripcion'),'unidad',l.snapshot->>'unidad_base') order by l.pedido_linea_id),'[]') from public.almacen_preparacion_linea l where l.preparacion_id=a.id),
  'eventos',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'accion',e.accion,'actor',e.actor_nombre,'creado_en',e.creado_en,'detalle',e.detalle) order by e.creado_en,e.id),'[]') from public.almacen_preparacion_evento e where e.preparacion_id=a.id),
  'retiro',(select jsonb_build_object('responsable',transportista_nombre,'destino',destino,'retirado_en',retirado_en,'estado',estado) from evidencia_operacion.retiro where preparacion_id=a.id)) order by a.creado_en,a.id),'[]') from public.almacen_preparacion a left join public.sucursal s on s.id=a.sucursal_id where a.pedido_id=p_pedido),
 'salidas',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'linea_id',e.pedido_linea_id::text,'cantidad',e.cantidad_base,'creado_en',e.creado_en,
  'actor',e.creado_por,'revertido',coalesce(e.revertido,false),'revertido_en',e.revertido_en,'motivo',e.correccion_documental_motivo) order by e.creado_en,e.id),'[]') from public.pedido_despacho_evento e join public.pedido_linea l on l.id=e.pedido_linea_id where l.pedido_id=p_pedido),
 'eventos',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'accion',e.accion,'titulo',e.titulo,'actor',e.usuario,'creado_en',e.creado_en,'motivo',e.motivo) order by e.creado_en,e.id),'[]') from public.pedido_evento e where e.pedido_id=p_pedido),
 'cobros',hermes.detalle_cobro_interno(p_pedido,null,p_antes,100),
 'evidencias',(select coalesce(jsonb_agg(x order by x->>'creado_en'),'[]') from (
  select jsonb_build_object('id',e.id::text,'tipo','operacion','etapa',e.etapa,'preparacion_id',e.preparacion_id::text,'estado',e.estado,
   'creado_en',e.creado_en,'descripcion',e.caption,'eliminado_en',e.eliminado_en,
   'archivos',(select coalesce(jsonb_agg(jsonb_build_object('indice',r.n-1,'disponible',exists(select 1 from storage.objects o where o.bucket_id='evidencias_operaciones' and o.name=r.ruta)) order by r.n),'[]') from jsonb_array_elements_text(e.rutas) with ordinality r(ruta,n)),
   'telegram',coalesce(e.telegram,'[]')) x from evidencia_operacion.lote e where e.tipo='PEDIDO' and e.documento_id=p_pedido
  union all select jsonb_build_object('id',e.id::text,'tipo','pago','etapa','PAGO','estado',p.estado,'creado_en',e.subido_en,'descripcion',e.nombre_original,
   'archivos',jsonb_build_array(jsonb_build_object('indice',0,'disponible',exists(select 1 from storage.objects o where o.bucket_id='documentos-expediente' and o.name=e.storage_path))),'mime',e.mime_type)
   from hermes.evidencia e join hermes.pago p on p.evidencia_id=e.id where exists(select 1 from hermes.pago_aplicacion a join hermes.partida_abierta pa on pa.id=a.partida_id where a.pago_id=p.id and pa.pedido_id=p_pedido)
 ) q),
 'clips',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'preparacion_id',c.preparacion_id::text,'camara',c.camara,'inicio',c.inicio,'fin',c.fin,
  'disponible',exists(select 1 from storage.objects o where o.bucket_id=c.bucket and o.name=c.ruta)) order by c.inicio),'[]') from analitica.pedido_clip c join public.almacen_preparacion a on a.id=c.preparacion_id where a.pedido_id=p_pedido),
 'lecturas_ia',(select coalesce(jsonb_agg(to_jsonb(x) order by x.generado_en desc),'[]') from (select id::text,resumen,observaciones,fuentes,agente,generado_en,datos_hasta from analitica.pedido_lectura_ia where pedido_id=p_pedido order by generado_en desc limit 10) x)
 ) into r;
 return r;
end $$;

-- Resolución de archivos por identificadores, nunca por rutas proporcionadas por el navegador.
create function analitica.wholesale_archivo(p_pedido bigint,p_tipo text,p_id text,p_indice integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b text; r text;
begin
 perform analitica.exigir_acceso();
 if not exists(select 1 from public.pedido where id=p_pedido and categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')) then return null; end if;
 if p_indice is null or p_indice<0 or p_indice>9 then return null; end if;
 if p_tipo='operacion' then
  select 'evidencias_operaciones',e.rutas->>p_indice into b,r from evidencia_operacion.lote e where e.id::text=p_id and e.tipo='PEDIDO' and e.documento_id=p_pedido;
 elsif p_tipo='pago' and p_indice=0 then
  select 'documentos-expediente',e.storage_path into b,r from hermes.evidencia e where e.id::text=p_id and exists(select 1 from hermes.pago p join hermes.pago_aplicacion a on a.pago_id=p.id join hermes.partida_abierta pa on pa.id=a.partida_id where p.evidencia_id=e.id and pa.pedido_id=p_pedido);
 elsif p_tipo='clip' and p_indice=0 then
  select c.bucket,c.ruta into b,r from analitica.pedido_clip c join public.almacen_preparacion a on a.id=c.preparacion_id where c.id::text=p_id and a.pedido_id=p_pedido;
 end if;
 if r is null or not exists(select 1 from storage.objects where bucket_id=b and name=r) then return null; end if;
 return jsonb_build_object('bucket',b,'ruta',r);
end $$;

create function analitica.wholesale_objeto_permitido(p_bucket text,p_ruta text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.dash_acceso() then return false; end if;
 return (p_bucket='evidencias_operaciones' and exists(select 1 from evidencia_operacion.lote e join public.pedido p on p.id=e.documento_id where e.tipo='PEDIDO' and p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO') and e.rutas ? p_ruta))
 or (p_bucket='documentos-expediente' and exists(select 1 from hermes.evidencia e join hermes.pago pg on pg.evidencia_id=e.id join hermes.pago_aplicacion a on a.pago_id=pg.id join hermes.partida_abierta pa on pa.id=a.partida_id join public.pedido p on p.id=pa.pedido_id where e.storage_path=p_ruta and p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')))
 or (p_bucket='wholesale-clips' and exists(select 1 from analitica.pedido_clip c join public.almacen_preparacion a on a.id=c.preparacion_id join public.pedido p on p.id=a.pedido_id where c.ruta=p_ruta and p.categoria::text in ('MAYOR','INSTITUCIONAL','CORPORATIVO')));
end $$;
create policy dashboard_wholesale_lectura on storage.objects for select to authenticated
using(bucket_id in ('evidencias_operaciones','documentos-expediente','wholesale-clips') and analitica.wholesale_objeto_permitido(bucket_id,name));

create function public.dash_wholesale_lista(p_desde date,p_hasta date,p_filtros jsonb,p_buscar text,p_pagina integer)
returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.wholesale_lista(p_desde,p_hasta,p_filtros,p_buscar,p_pagina) $$;
create function public.dash_wholesale_expediente(p_pedido bigint,p_antes bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.wholesale_expediente(p_pedido,p_antes) $$;
create function public.dash_wholesale_archivo(p_pedido bigint,p_tipo text,p_id text,p_indice integer)
returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.wholesale_archivo(p_pedido,p_tipo,p_id,p_indice) $$;
revoke all on function analitica.wholesale_fila(bigint) from public,anon,authenticated;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='analitica' and p.proname in ('wholesale_lista','wholesale_expediente','wholesale_archivo','wholesale_objeto_permitido')) or (n.nspname='public' and p.proname in ('dash_wholesale_lista','dash_wholesale_expediente','dash_wholesale_archivo')) loop
  execute format('revoke all on function %s from public,anon',f);
  execute format('grant execute on function %s to authenticated,service_role',f);
 end loop;
end $$;
notify pgrst,'reload schema';
