-- Dashboard operativo. No modifica ventas, stock, cartera ni auditoría.
-- Únicas escrituras: metas y costos de referencia propios del dashboard.
create table analitica.meta (
  mes date not null check (extract(day from mes)=1),
  ambito text not null,
  ventas numeric not null check (ventas>=0 and ventas<=1e12),
  cobranza numeric not null check (cobranza>=0 and cobranza<=1e12),
  actualizado_por uuid not null references public.perfil(id),
  actualizado_en timestamptz not null default now(),
  primary key(mes,ambito)
);
create table analitica.costo_producto (
  producto_id bigint not null references public.producto(id),
  desde date not null,
  costo_base numeric not null check(costo_base>0 and costo_base<=1e12),
  nota text not null default '' check(length(nota)<=500),
  actualizado_por uuid not null references public.perfil(id),
  actualizado_en timestamptz not null default now(),
  primary key(producto_id,desde)
);
alter table analitica.meta enable row level security;
alter table analitica.costo_producto enable row level security;
revoke all on analitica.meta,analitica.costo_producto from public,anon,authenticated;
grant usage on schema analitica to authenticated;

create function analitica.exigir_acceso() returns void language plpgsql stable set search_path='' as $$
begin
  if auth.uid() is null or not public.dash_acceso() then
    raise exception 'sin acceso al dashboard' using errcode='42501';
  end if;
end $$;
create function analitica.validar_periodo(d date,h date) returns void language plpgsql immutable set search_path='' as $$
begin
  if d is null or h is null or d>h or h-d+1>400 or d<date '2000-01-01' or h>date '2100-12-31' then
    raise exception 'El período debe tener fechas válidas y un máximo de 400 días.' using errcode='22023';
  end if;
end $$;

create view analitica.venta_dimension as
select h.*, coalesce(u.sucursal_id,pl.sucursal_origen_id,pf.sucursal_id) sucursal_id,
       coalesce(pf.email,h.vendedor) vendedor_clave,
       coalesce(pf.nombre,h.vendedor,'Sin vendedor') vendedor_nombre
from analitica.hecho_venta h
left join public.venta v on h.origen='RETAIL' and v.id=h.doc_id
left join public.ubicacion u on u.id=v.ubicacion_id
left join public.pedido_linea pl on h.origen='PEDIDO' and pl.id=h.linea_id
left join public.perfil pf on (h.origen='RETAIL' and pf.id=v.vendedor_id)
  or (h.origen='PEDIDO' and pf.email=h.vendedor);

create function analitica.f_ventas(f jsonb) returns setof analitica.venta_dimension language sql stable set search_path='' as $$
 select h.* from analitica.venta_dimension h
 where (nullif(f->>'sucursal','') is null or h.sucursal_id::text=f->>'sucursal')
   and (nullif(f->>'vendedor','') is null or h.vendedor_clave=f->>'vendedor')
   and (nullif(f->>'cliente','') is null or h.cliente_id::text=f->>'cliente')
   and (nullif(f->>'canal','') is null or h.canal=f->>'canal')
   and (nullif(f->>'producto','') is null or h.producto_id::text=f->>'producto');
$$;
create function analitica.f_pedidos(f jsonb) returns setof public.pedido language sql stable set search_path='' as $$
 select p.* from public.pedido p where p.id in(select h.doc_id from analitica.f_ventas(f) h where h.origen='PEDIDO');
$$;
create function analitica.f_stock(f jsonb) returns setof analitica.hecho_stock language sql stable set search_path='' as $$
 select h.* from analitica.hecho_stock h
 where (nullif(f->>'sucursal','') is null or h.sucursal_id::text=f->>'sucursal')
 and (nullif(f->>'producto','') is null or h.producto_id::text=f->>'producto')
 and (not (f ?| array['cliente','vendedor','canal']) or h.venta_id in(select doc_id from analitica.f_ventas(f-'sucursal') where origen='RETAIL') or h.pedido_id in(select doc_id from analitica.f_ventas(f-'sucursal') where origen='PEDIDO'))
 -- Las salidas revertidas conservan el kardex original; no deben contar como vigentes.
 and (h.origen<>'VENTA_RETAIL' or exists(select 1 from public.venta v where v.id=h.venta_id and v.estado='COMPLETADA'))
 and (h.origen<>'DESPACHO_PEDIDO' or exists(
   select 1 from public.pedido_despacho_movimiento m
   join public.pedido_despacho_evento e on e.id=m.evento_id
   join public.pedido p on p.id=h.pedido_id
   where m.kardex_transaccion_id=h.kardex_id and not coalesce(e.revertido,false) and p.estado<>'CANCELADO'));
$$;
create function analitica.f_dinero(f jsonb) returns setof analitica.hecho_dinero language sql stable set search_path='' as $$
 select h.* from analitica.hecho_dinero h
 where (nullif(f->>'cliente','') is null or h.cliente_id::text=f->>'cliente')
 and (
   (h.tipo='COBRO_RETAIL' and h.venta_id in(select doc_id from analitica.f_ventas(f) where origen='RETAIL'))
   or (h.tipo<>'COBRO_RETAIL' and not (f ?| array['sucursal','vendedor','canal','producto']))
 );
$$;
create function analitica.f_cartera(f jsonb) returns setof hermes.v_cliente_cartera language sql stable set search_path='' as $$
 select c.* from hermes.v_cliente_cartera c
 where (nullif(f->>'cliente','') is null or c.cliente_id::text=f->>'cliente')
 and (not (f ?| array['sucursal','vendedor','canal','producto']) or c.cliente_id in(select cliente_id from analitica.f_ventas(f)));
$$;
create function analitica.f_compras(f jsonb) returns setof public.compra_solicitud language sql stable set search_path='' as $$
 select c.* from public.compra_solicitud c
 where (nullif(f->>'producto','') is null or c.producto_id::text=f->>'producto')
 and (not (f ?| array['sucursal','vendedor','cliente','canal']) or c.pedido_linea_id in(
   select pl.id from public.pedido_linea pl join analitica.f_pedidos(f) p on p.id=pl.pedido_id));
$$;
create function analitica.f_traslados(f jsonb) returns setof public.solicitud_traslado language sql stable set search_path='' as $$
 select t.* from public.solicitud_traslado t
 where (nullif(f->>'sucursal','') is null or t.sucursal_origen_id::text=f->>'sucursal' or t.sucursal_destino_id::text=f->>'sucursal')
 and (nullif(f->>'producto','') is null or exists(select 1 from public.solicitud_traslado_linea l where l.solicitud_id=t.id and l.producto_id::text=f->>'producto'));
$$;

create function analitica.catalogos() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform analitica.exigir_acceso();
 return jsonb_build_object(
 'sucursales',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'nombre',nombre) order by nombre),'[]') from public.sucursal where activo and tipo<>'virtual'),
 'vendedores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre) order by nombre),'[]') from (select distinct vendedor_clave id,vendedor_nombre nombre from analitica.venta_dimension where vendedor_clave is not null) v),
 'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'nombre',nombre) order by nombre),'[]') from public.cliente),
 'canales',(select coalesce(jsonb_agg(jsonb_build_object('id',canal,'nombre',canal) order by canal),'[]') from (select distinct canal from analitica.hecho_venta) v),
 'productos',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'nombre',nombre||' · '||unidad_base) order by nombre),'[]') from public.producto where activo));
end $$;

create function analitica.f_alerta(clave text)
returns table(id text,fecha date,documento text,cliente text,concepto text,cantidad numeric,monto numeric,origen text,referencia_id text,producto_id text)
language sql stable set search_path='' as $$
 select 'rechazada:'||pl.id,(p.creado_en at time zone 'America/La_Paz')::date,p.numero,coalesce(c.nombre,'Sin cliente'),coalesce(pl.descripcion,pr.nombre,'Línea rechazada'),pl.cantidad_base,pl.subtotal,'PEDIDO',p.id::text,pl.producto_id::text
 from public.pedido_linea pl join public.pedido p on p.id=pl.pedido_id left join public.cliente c on c.id=p.cliente_id left join public.producto pr on pr.id=pl.producto_id
 where clave='lineas_rechazadas_cobradas' and pl.estado='RECHAZADO' and p.estado<>'CANCELADO' and p.categoria<>'TIENDA'
 union all
 select 'qr:'||vp.id,(vp.creado_en at time zone 'America/La_Paz')::date,v.numero,coalesce(c.nombre,'Sin cliente'),'QR sin verificar',null::numeric,vp.monto,'RETAIL',v.id::text,null::text
 from public.venta_pago vp join public.venta v on v.id=vp.venta_id left join public.cliente c on c.id=v.cliente_id
 where clave='qr_sin_verificar' and v.estado='COMPLETADA' and vp.metodo='QR' and vp.estado_verificacion='PENDIENTE'
 union all
 select 'stock:'||h.kardex_id,h.fecha,'Kardex #'||h.kardex_id,'—',coalesce(pr.nombre,'Sin producto'),-h.cantidad,h.valor_venta,'PRODUCTO',null::text,h.producto_id::text
 from analitica.hecho_stock h left join public.producto pr on pr.id=h.producto_id
 where clave='salidas_sin_enlace' and h.origen='OTRO' and h.cantidad<0
 union all
 select 'traslado:'||t.id,(t.despachado_en at time zone 'America/La_Paz')::date,coalesce(t.numero,'#'||t.id),'—','Traslado despachado sin recibir',null::numeric,null::numeric,'TRASLADO',t.id::text,null::text
 from public.solicitud_traslado t where clave='traslados_en_transito' and t.estado::text='EN_TRANSITO'
 union all
 select 'producto:'||p.id,null::date,p.sku_interno,'—',p.nombre,null::numeric,p.precio_base,'PRODUCTO',null::text,p.id::text
 from public.producto p where clave='productos_sin_precio' and p.activo and coalesce(p.precio_base,0)=0
 union all
 select 'turno:'||s.id,(s.abierta_en at time zone 'America/La_Paz')::date,'Turno #'||s.id,coalesce(pf.nombre,s.abierta_por),'Abierto hace más de 24 h',null::numeric,s.diferencia,'RETAIL',null::text,null::text
 from public.sesion_caja s left join public.perfil pf on pf.id=s.cajero_id where clave='turnos_abiertos_24h' and s.estado='ABIERTA' and s.abierta_en<now()-interval '24 hours'
 union all
 select 'diferencia:'||s.producto_id||':'||s.ubicacion_id,null::date,'Ubicación #'||s.ubicacion_id,'—',p.nombre,
 s.cantidad_base-coalesce(k.cantidad,0),null::numeric,'PRODUCTO',null::text,s.producto_id::text
 from public.stock_actual s join public.producto p on p.id=s.producto_id left join lateral(select sum(cantidad) cantidad from public.kardex_transacciones k where k.producto_id=s.producto_id and k.ubicacion_id=s.ubicacion_id) k on true
 where clave='kardex_vs_stock' and abs(s.cantidad_base-coalesce(k.cantidad,0))>0.001;
$$;

create function analitica.f_detalle(t text,d date,h date,f jsonb)
returns table(id text,fecha date,documento text,cliente text,concepto text,cantidad numeric,monto numeric,origen text,referencia_id text,producto_id text)
language sql stable set search_path='' as $$
 select v.origen||':'||v.linea_id,v.fecha,v.doc_numero,coalesce(c.nombre,'Sin cliente'),coalesce(v.descripcion,'Sin descripción'),
        v.cantidad_base,v.monto,v.origen,v.doc_id::text,v.producto_id::text
 from analitica.f_ventas(f) v left join public.cliente c on c.id=v.cliente_id
 where t='ventas' and v.fecha between d and h
 union all
 select v.fuente||':'||v.fuente_id,v.fecha,coalesce(ve.numero,v.fuente||' #'||v.fuente_id),coalesce(c.nombre,'Sin cliente'),v.medio,
        null::numeric,v.monto,case when v.tipo='COBRO_RETAIL' then 'RETAIL' else 'CUENTA' end,
        coalesce(v.venta_id,v.cliente_id)::text,null::text
 from analitica.f_dinero(f) v left join public.cliente c on c.id=v.cliente_id left join public.venta ve on ve.id=v.venta_id
 where t='cobros' and v.tipo in ('COBRO_RETAIL','COBRO_CUENTA') and v.fecha between d and h
 union all
 select v.kardex_id::text,v.fecha,coalesce(p.numero,ve.numero,'Kardex #'||v.kardex_id),coalesce(c.nombre,'—'),coalesce(pr.nombre,'Sin producto'),
        -v.cantidad,v.valor_venta,case when v.pedido_id is not null then 'PEDIDO' else 'RETAIL' end,
        coalesce(v.pedido_id,v.venta_id)::text,v.producto_id::text
 from analitica.f_stock(f) v left join public.producto pr on pr.id=v.producto_id
 left join public.pedido p on p.id=v.pedido_id left join public.venta ve on ve.id=v.venta_id
 left join public.cliente c on c.id=coalesce(p.cliente_id,ve.cliente_id)
 where t='salidas' and v.cantidad<0 and v.origen in ('VENTA_RETAIL','DESPACHO_PEDIDO') and v.fecha between d and h
 union all
 select a.partida_id::text,a.fecha_vencimiento,a.documento_interno,a.cliente,a.estado_reloj,null::numeric,a.saldo_partida,
        'CUENTA',a.cliente_id::text,null::text
 from hermes.v_antiguedad a join analitica.f_cartera(f) c on c.cliente_id=a.cliente_id
 where t='cartera' and a.saldo_partida>0
 union all select * from analitica.f_alerta(f->>'alerta') where t='alertas';
$$;
create function analitica.detalle(p_tipo text,p_desde date,p_hasta date,p_filtros jsonb,p_pagina int,p_limite int)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_desde,p_hasta);
 if p_tipo not in ('ventas','cobros','salidas','cartera','alertas') or p_pagina<1 or p_pagina>100000 or p_limite<1 or p_limite>500 then raise exception 'Detalle inválido' using errcode='22023'; end if;
 with x as materialized (select * from analitica.f_detalle(p_tipo,p_desde,p_hasta,p_filtros))
 select jsonb_build_object('total',(select count(*) from x),'monto',(select coalesce(sum(monto),0) from x),
 'filas',(select coalesce(jsonb_agg(to_jsonb(s) order by fecha desc nulls last,id),'[]') from (
 select * from x order by fecha desc nulls last,id limit p_limite offset ((p_pagina-1)*p_limite)) s)) into r;
 return r;
end $$;

create function analitica.inventario(p_filtros jsonb,p_pagina int,p_limite int) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform analitica.exigir_acceso();
 if p_pagina<1 or p_pagina>100000 or p_limite<1 or p_limite>100000 then raise exception 'Paginación inválida' using errcode='22023'; end if;
 with fisico as materialized (
   select s.producto_id,u.sucursal_id,s.cantidad_base,sc.nombre sucursal,u.codigo_zona ubicacion
   from public.stock_actual s join public.ubicacion u on u.id=s.ubicacion_id join public.sucursal sc on sc.id=u.sucursal_id
   where sc.tipo<>'virtual' and not coalesce(u.excluye_disponible,false)
 ), reserva as (select producto_id,sum(pendiente) cantidad from public.v_pedido_linea_reserva where reserva group by producto_id),
 salidas as (select producto_id,sum(-cantidad)/30 diario from analitica.f_stock(p_filtros-'cliente'-'vendedor'-'canal')
   where cantidad<0 and origen in ('VENTA_RETAIL','DESPACHO_PEDIDO') and fecha between (now() at time zone 'America/La_Paz')::date-29 and (now() at time zone 'America/La_Paz')::date group by producto_id),
 base as (
   select pr.id::text id,pr.nombre producto,pr.unidad_base unidad,coalesce(pr.stock_min,0) minimo,coalesce(pr.punto_reorden,0) reorden,
     coalesce((select sum(cantidad_base) from fisico s where s.producto_id=pr.id),0) fisico_global,
     coalesce((select sum(cantidad_base) from fisico s where s.producto_id=pr.id and (nullif(p_filtros->>'sucursal','') is null or s.sucursal_id::text=p_filtros->>'sucursal')),0) fisico,
     coalesce(rv.cantidad,0) reservado_global,sa.diario,
     coalesce((select sum(greatest(coalesce(l.cantidad_despachada,0)-coalesce(l.cantidad_recibida,0),0)) from public.solicitud_traslado_linea l join public.solicitud_traslado t on t.id=l.solicitud_id where l.producto_id=pr.id and t.estado::text='EN_TRANSITO' and (nullif(p_filtros->>'sucursal','') is null or t.sucursal_destino_id::text=p_filtros->>'sucursal')),0) transito,
     coalesce((select jsonb_agg(jsonb_build_object('sucursal',s.sucursal,'ubicacion',s.ubicacion,'cantidad',s.cantidad_base) order by s.sucursal,s.ubicacion) from fisico s where s.producto_id=pr.id and s.cantidad_base<>0 and (nullif(p_filtros->>'sucursal','') is null or s.sucursal_id::text=p_filtros->>'sucursal')),'[]') ubicaciones
   from public.producto pr left join reserva rv on rv.producto_id=pr.id left join salidas sa on sa.producto_id=pr.id
   where pr.activo and (nullif(p_filtros->>'producto','') is null or pr.id::text=p_filtros->>'producto')
 ), disponible as (select *,greatest(least(fisico,fisico_global-reservado_global),0) disponible from base),
 x as materialized (select *,case when diario>0 then round(disponible/diario,1) end cobertura_dias,
   case when disponible<=0 then 'SIN_STOCK' when disponible<greatest(minimo,reorden) then 'BAJO_MINIMO' when diario>0 and disponible/diario<7 then 'RIESGO_7_DIAS' else 'OK' end estado from disponible)
 select jsonb_build_object('total',(select count(*) from x),'sin_stock',(select count(*) from x where estado='SIN_STOCK'),
 'bajo_minimo',(select count(*) from x where estado='BAJO_MINIMO'),'riesgo',(select count(*) from x where estado='RIESGO_7_DIAS'),
 'filas',(select coalesce(jsonb_agg(to_jsonb(s) order by orden,producto,id),'[]') from (select *,case estado when 'SIN_STOCK' then 1 when 'BAJO_MINIMO' then 2 when 'RIESGO_7_DIAS' then 3 else 4 end orden from x order by orden,producto,id limit p_limite offset ((p_pagina-1)*p_limite)) s)) into r;
 return r;
end $$;

create function analitica.margen(p_desde date,p_hasta date,p_filtros jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_desde,p_hasta);
 with x as materialized (
 select v.*,c.costo_base*v.cantidad_base costo from analitica.f_ventas(p_filtros) v
 left join lateral (select costo_base from analitica.costo_producto c where c.producto_id=v.producto_id and c.desde<=v.fecha order by c.desde desc limit 1) c on true
 where v.fecha between p_desde and p_hasta
 ), grupos as (
 select 'producto' dimension,coalesce(descripcion,'Sin descripción') nombre,sum(monto) vendido,sum(monto) filter(where costo is not null) con_costo,sum(costo) costo from x group by descripcion
 union all select 'canal',canal,sum(monto),sum(monto) filter(where costo is not null),sum(costo) from x group by canal
 union all select 'vendedor',vendedor_nombre,sum(monto),sum(monto) filter(where costo is not null),sum(costo) from x group by vendedor_nombre
 ) select jsonb_build_object('vendido',(select coalesce(sum(monto),0) from x),'con_costo',(select coalesce(sum(monto) filter(where costo is not null),0) from x),
 'costo',(select sum(costo) from x),'utilidad',(select sum(monto-costo) filter(where costo is not null) from x),
 'lineas_sin_costo',(select count(*) from x where costo is null),
 'grupos',(select coalesce(jsonb_agg(to_jsonb(g) order by dimension,vendido desc),'[]') from grupos g),
 'costos',(select coalesce(jsonb_agg(jsonb_build_object('producto_id',c.producto_id::text,'producto',p.nombre,'unidad',p.unidad_base,'desde',c.desde,'costo_base',c.costo_base,'nota',c.nota) order by c.desde desc,p.nombre),'[]') from analitica.costo_producto c join public.producto p on p.id=c.producto_id where nullif(p_filtros->>'producto','') is null or c.producto_id::text=p_filtros->>'producto')) into r;
 return r;
end $$;

create function analitica.cobranza(p_filtros jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform analitica.exigir_acceso();
 return jsonb_build_object('clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',cliente_id::text,'cliente',cliente,'saldo',saldo_confirmado,'vencido',monto_vencido,'dias_vencido',dias_vencido_max,'ultimo_pago',ultimo_pago_en,'sin_partida',saldo_sin_partida,'por_verificar',pagos_por_verificar,'prioridad',case when monto_vencido>0 and dias_vencido_max>=30 then 'ALTA' when monto_vencido>0 then 'MEDIA' else 'PREVENTIVA' end) order by (monto_vencido>0) desc,dias_vencido_max desc nulls last,monto_vencido desc,saldo_confirmado desc),'[]') from analitica.f_cartera(p_filtros) where saldo_confirmado>0));
end $$;

create function analitica.metas(p_mes date,p_sucursal text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m date:=date_trunc('month',p_mes)::date; h date; f jsonb; r jsonb;
begin
 perform analitica.exigir_acceso();
 h:=(m+interval '1 month'-interval '1 day')::date;
 perform analitica.validar_periodo(m,h);
 f:=case when nullif(p_sucursal,'') is null then '{}'::jsonb else jsonb_build_object('sucursal',p_sucursal) end;
 select jsonb_build_object('mes',m,'hasta',h,'hoy',(now() at time zone 'America/La_Paz')::date,'ventas',(select coalesce(sum(monto),0) from analitica.f_ventas(f) where fecha between m and h),
 'cobranza',(select coalesce(sum(monto),0) from analitica.f_dinero(f) where tipo in ('COBRO_RETAIL','COBRO_CUENTA') and fecha between m and h),
 'meta',(select jsonb_build_object('ventas',ventas,'cobranza',cobranza) from analitica.meta where mes=m and ambito=coalesce(nullif(p_sucursal,''),'global'))) into r;
 return r;
end $$;
create function analitica.guardar_meta(p_mes date,p_sucursal text,p_ventas numeric,p_cobranza numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_mes,p_mes);
 if extract(day from p_mes)<>1 or p_ventas is null or p_cobranza is null or p_ventas<0 or p_cobranza<0 or p_ventas>1e12 or p_cobranza>1e12 then raise exception 'Metas inválidas' using errcode='22023'; end if;
 if nullif(p_sucursal,'') is not null and not exists(select 1 from public.sucursal where id::text=p_sucursal and activo and tipo<>'virtual') then raise exception 'Sucursal inválida' using errcode='22023'; end if;
 insert into analitica.meta(mes,ambito,ventas,cobranza,actualizado_por) values(p_mes,coalesce(nullif(p_sucursal,''),'global'),p_ventas,p_cobranza,auth.uid())
 on conflict(mes,ambito) do update set ventas=excluded.ventas,cobranza=excluded.cobranza,actualizado_por=auth.uid(),actualizado_en=now();
end $$;
create function analitica.guardar_costo(p_producto bigint,p_desde date,p_costo numeric,p_nota text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_desde,p_desde);
 if p_costo is null or p_costo<=0 or p_costo>1e12 or p_nota is null or length(p_nota)>500 or not exists(select 1 from public.producto where id=p_producto) then raise exception 'Costo inválido' using errcode='22023'; end if;
 insert into analitica.costo_producto(producto_id,desde,costo_base,nota,actualizado_por) values(p_producto,p_desde,p_costo,p_nota,auth.uid())
 on conflict(producto_id,desde) do update set costo_base=excluded.costo_base,nota=excluded.nota,actualizado_por=auth.uid(),actualizado_en=now();
end $$;

-- API pública invoker; el código privilegiado vive en el esquema privado.
create function public.dash_catalogos() returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.catalogos() $$;
create function public.dash_detalle(p_tipo text,p_desde date,p_hasta date,p_filtros jsonb,p_pagina int,p_limite int) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.detalle(p_tipo,p_desde,p_hasta,p_filtros,p_pagina,p_limite) $$;
create function public.dash_inventario(p_filtros jsonb,p_pagina int,p_limite int) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.inventario(p_filtros,p_pagina,case when p_limite<=500 then p_limite else -1 end) $$;
create function public.dash_margen(p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.margen(p_desde,p_hasta,p_filtros) $$;
create function public.dash_cobranza(p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.cobranza(p_filtros) $$;
create function public.dash_metas(p_mes date,p_sucursal text) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.metas(p_mes,p_sucursal) $$;
create function public.dash_guardar_meta(p_mes date,p_sucursal text,p_ventas numeric,p_cobranza numeric) returns void language sql security invoker set search_path='' as $$ select analitica.guardar_meta(p_mes,p_sucursal,p_ventas,p_cobranza) $$;
create function public.dash_guardar_costo(p_producto bigint,p_desde date,p_costo numeric,p_nota text) returns void language sql security invoker set search_path='' as $$ select analitica.guardar_costo(p_producto,p_desde,p_costo,p_nota) $$;

-- Un solo snapshot para que la paginación no duplique ni omita filas durante una exportación.
create function analitica.exportar(p_tipo text,p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform analitica.exigir_acceso(); perform analitica.validar_periodo(p_desde,p_hasta);
 if p_tipo='inventario' then
   r:=analitica.inventario(p_filtros,1,100000);
 elsif p_tipo in ('ventas','cobros','salidas','cartera','alertas') then
   select jsonb_build_object('total',count(*),'monto',coalesce(sum(monto),0),'filas',coalesce(jsonb_agg(to_jsonb(x) order by fecha desc nulls last,id),'[]')) into r
   from analitica.f_detalle(p_tipo,p_desde,p_hasta,p_filtros) x;
 else raise exception 'Reporte inválido' using errcode='22023'; end if;
 if (r->>'total')::int>100000 then raise exception 'El reporte supera 100000 registros; reduce el rango o agrega filtros.' using errcode='22023'; end if;
 return r;
end $$;
create function public.dash_exportar(p_tipo text,p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.exportar(p_tipo,p_desde,p_hasta,p_filtros) $$;

revoke all on all tables in schema analitica from public,anon,authenticated;
revoke all on all functions in schema analitica from public,anon,authenticated;
do $$ declare x regprocedure; begin
 for x in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='analitica' and p.proname in ('catalogos','detalle','inventario','margen','cobranza','metas','guardar_meta','guardar_costo','exportar')) or (n.nspname='public' and p.proname in ('dash_catalogos','dash_detalle','dash_inventario','dash_margen','dash_cobranza','dash_metas','dash_guardar_meta','dash_guardar_costo','dash_exportar')) loop
 execute format('revoke all on function %s from public,anon',x);
 execute format('grant execute on function %s to authenticated',x);
 end loop;
end $$;

-- RPC_FILTRADAS: variantes con filtros y validación compartida.

create or replace function analitica.dash_resumen(p_desde date, p_hasta date, p_filtros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias   int  := (p_hasta - p_desde) + 1;
  v_pdesde date := p_desde - ((p_hasta - p_desde) + 1);
  v_phasta date := p_desde - 1;
  v_hoy    date := (now() at time zone 'America/La_Paz')::date;
  r jsonb;
begin
  perform analitica.exigir_acceso();
  perform analitica.validar_periodo(p_desde,p_hasta);
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
      'total', (select coalesce(round(sum(monto), 2), 0) from analitica.f_ventas(p_filtros)
                 where fecha between p_desde and p_hasta),
      'prev',  (select coalesce(round(sum(monto), 2), 0) from analitica.f_ventas(p_filtros)
                 where fecha between v_pdesde and v_phasta),
      'pedidos', (select count(distinct doc_id) from analitica.f_ventas(p_filtros)
                   where origen = 'PEDIDO' and fecha between p_desde and p_hasta),
      'ventas_retail', (select count(distinct doc_id) from analitica.f_ventas(p_filtros)
                         where origen = 'RETAIL' and fecha between p_desde and p_hasta),
      'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('canal', canal, 'monto', monto) order by monto desc), '[]'::jsonb)
                    from (select canal, round(sum(monto), 2) monto from analitica.f_ventas(p_filtros)
                          where fecha between p_desde and p_hasta group by canal) s)),

    'cobrado', jsonb_build_object(
      'total', (select coalesce(round(sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
                 where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta),
      'prev',  (select coalesce(round(sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
                 where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between v_pdesde and v_phasta),
      'retail', (select coalesce(round(sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
                  where tipo = 'COBRO_RETAIL' and fecha between p_desde and p_hasta),
      'cuenta', (select coalesce(round(sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
                  where tipo = 'COBRO_CUENTA' and fecha between p_desde and p_hasta),
      'qr_sin_verificar', (select count(*) from analitica.f_dinero(p_filtros)
                            where tipo = 'COBRO_RETAIL' and medio = 'QR' and estado = 'PENDIENTE'
                              and fecha between p_desde and p_hasta),
      'por_medio', (select coalesce(jsonb_agg(jsonb_build_object('medio', medio, 'monto', monto) order by monto desc), '[]'::jsonb)
                    from (select medio, round(sum(monto), 2) monto from analitica.f_dinero(p_filtros)
                          where tipo in ('COBRO_RETAIL', 'COBRO_CUENTA') and fecha between p_desde and p_hasta
                          group by medio) s)),

    'egresos_caja', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'monto', monto)), '[]'::jsonb)
                     from (select tipo, round(sum(monto), 2) monto from analitica.f_dinero(p_filtros)
                           where tipo like 'EGRESO%' and fecha between p_desde and p_hasta group by tipo) s),

    'cartera', jsonb_build_object(
      'total',    (select coalesce(round(sum(saldo_confirmado), 2), 0) from analitica.f_cartera(p_filtros) where saldo_confirmado > 0),
      'clientes', (select count(*) from analitica.f_cartera(p_filtros) where saldo_confirmado > 0),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
              from (select cliente, round(saldo_confirmado, 2) saldo from analitica.f_cartera(p_filtros)
                    where saldo_confirmado > 0 order by saldo_confirmado desc limit 6) s)),

    'salidas', jsonb_build_object(
      'valor_total', (select coalesce(round(sum(valor_venta), 2), 0) from analitica.f_stock(p_filtros)
                       where cantidad < 0 and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO')
                         and fecha between p_desde and p_hasta),
      'por_origen', (select coalesce(jsonb_agg(jsonb_build_object('origen', origen, 'unidades', unidades, 'valor', valor) order by unidades desc), '[]'::jsonb)
                     from (select origen, round(sum(-cantidad), 2) unidades, round(sum(valor_venta), 2) valor
                           from analitica.f_stock(p_filtros)
                           where cantidad < 0
                             and origen in ('VENTA_RETAIL', 'DESPACHO_PEDIDO', 'AJUSTE', 'OTRO', 'REPOSICION_TIENDA')
                             and fecha between p_desde and p_hasta
                           group by origen) s)),

    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'pedidos', coalesce(x.pedidos, 0), 'retail', coalesce(x.retail, 0)) order by d.fecha), '[]'::jsonb)
              from (select generate_series(p_desde, p_hasta, interval '1 day')::date fecha) d
              left join (select fecha,
                                round(sum(monto) filter (where origen = 'PEDIDO'), 2) pedidos,
                                round(sum(monto) filter (where origen = 'RETAIL'), 2) retail
                         from analitica.f_ventas(p_filtros) where fecha between p_desde and p_hasta group by fecha) x
                on x.fecha = d.fecha),

    'top_productos', (select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'monto', monto) order by monto desc), '[]'::jsonb)
                      from (select descripcion, round(sum(monto), 2) monto from analitica.f_ventas(p_filtros)
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
      'vendido', (select coalesce(round(sum(monto), 2), 0) from analitica.f_ventas(p_filtros) where fecha = v_hoy),
      'turno_abierto', (select jsonb_build_object('id', s.id, 'cajero', coalesce(pf.nombre, s.abierta_por))
                        from public.sesion_caja s left join public.perfil pf on pf.id = s.cajero_id
                        where s.estado = 'ABIERTA' order by s.id desc limit 1),
      'pedidos_abiertos', (select count(*) from analitica.f_pedidos(p_filtros) where estado = 'ABIERTO' and categoria <> 'TIENDA'),
      'lineas_por_despachar', (select count(*) from public.pedido_linea pl join analitica.f_pedidos(p_filtros) p on p.id = pl.pedido_id
                               where pl.estado = 'POR_DESPACHAR' and p.estado = 'ABIERTO' and p.categoria <> 'TIENDA'),
      'por_comprar', (select count(*) from analitica.f_compras(p_filtros)
                      where estado = 'SOLICITADA'))
  ) into r;

  return r;
end;
$$;
revoke all on function analitica.dash_resumen(date,date,jsonb) from public,anon;
grant execute on function analitica.dash_resumen(date,date,jsonb) to authenticated;
create function public.dash_resumen(p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.dash_resumen(p_desde,p_hasta,p_filtros) $$;
revoke all on function public.dash_resumen(date,date,jsonb) from public,anon;
grant execute on function public.dash_resumen(date,date,jsonb) to authenticated;

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
                           from public.pedido p
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
revoke all on function analitica.dash_ventas(date,date,jsonb) from public,anon;
grant execute on function analitica.dash_ventas(date,date,jsonb) to authenticated;
create function public.dash_ventas(p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.dash_ventas(p_desde,p_hasta,p_filtros) $$;
revoke all on function public.dash_ventas(date,date,jsonb) from public,anon;
grant execute on function public.dash_ventas(date,date,jsonb) to authenticated;

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
                            from public.pedido p
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
revoke all on function analitica.dash_almacen(date,date,jsonb) from public,anon;
grant execute on function analitica.dash_almacen(date,date,jsonb) to authenticated;
create function public.dash_almacen(p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.dash_almacen(p_desde,p_hasta,p_filtros) $$;
revoke all on function public.dash_almacen(date,date,jsonb) from public,anon;
grant execute on function public.dash_almacen(date,date,jsonb) to authenticated;

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
      'remesas', (select coalesce(round(-sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
                  where tipo = 'EGRESO_REMESA' and fecha between p_desde and p_hasta),
      'inyecciones', (select coalesce(round(sum(monto), 2), 0) from analitica.f_dinero(p_filtros)
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
revoke all on function analitica.dash_finanzas(date,date,jsonb) from public,anon;
grant execute on function analitica.dash_finanzas(date,date,jsonb) to authenticated;
create function public.dash_finanzas(p_desde date,p_hasta date,p_filtros jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select analitica.dash_finanzas(p_desde,p_hasta,p_filtros) $$;
revoke all on function public.dash_finanzas(date,date,jsonb) from public,anon;
grant execute on function public.dash_finanzas(date,date,jsonb) to authenticated;

notify pgrst,'reload schema';
