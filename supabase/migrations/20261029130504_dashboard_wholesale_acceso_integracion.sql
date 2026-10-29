-- Acceso de integración a los contratos privados de aportaciones, sin permisos
-- nuevos sobre operaciones. La conexión a DB de OpenClaw conserva sus permisos.
grant usage on schema analitica to service_role;

-- Seller histórico guardaba el origen en una referencia generada. Se conserva
-- su procedencia explícita y se prefiere siempre la FK cuando esté disponible.
create or replace function analitica.wholesale_fila(p_id bigint) returns jsonb
language sql stable set search_path='' as $$
select jsonb_build_object(
 'id',p.id::text,'numero',p.numero,'categoria',p.categoria,'estado',p.estado,
 'creado_en',p.creado_en,'vendedor',coalesce(pf.nombre,p.creado_por,'Sin responsable'),
 'cliente',coalesce(c.nombre,'Sin cliente'),'cliente_id',p.cliente_id::text,'total',p.total,
 'cotizacion_id',q.id::text,'cotizacion',q.numero,'cotizacion_en',q.creado_en,
 'cotizacion_vinculo_fuente',case when q.id is null then null when p.cotizacion_origen_id is not null then 'FK' else 'REFERENCIA_HISTORICA' end,
 'preparaciones',coalesce(a.n,0),'preparado_en',a.preparado,'verificado_en',a.verificado,
 'ultima_preparacion_estado',(select estado from public.almacen_preparacion where pedido_id=p.id order by creado_en desc,id desc limit 1),
 'salidas',coalesce(s.n,0),'salida_en',s.fecha,'lineas_vigentes',l.vigentes,'lineas_entregadas',l.entregadas,
 'partidas',f.n,'aplicado',f.aplicado,'saldo',case when f.n>0 then f.saldo end,
 'en_revision',f.revision,'total_partidas',f.total_partidas,
 'ultima_actividad',greatest(p.creado_en,a.actividad,s.fecha))
from public.pedido p
left join public.cliente c on c.id=p.cliente_id
left join public.perfil pf on pf.email=p.creado_por
left join public.cotizacion q on q.id=coalesce(p.cotizacion_origen_id,(regexp_match(p.referencia,'^Cotizaci[oó]n #([0-9]{1,15})([^0-9]|$)'))[1]::bigint)
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
notify pgrst,'reload schema';
