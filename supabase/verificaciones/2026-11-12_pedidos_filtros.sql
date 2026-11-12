-- Verificación de 20261112010000_pedidos_filtros.sql (solo lectura).
-- Correr DESPUÉS de aplicar la migración, completo, en el SQL Editor.
-- Simula una sesión con acceso al dashboard dentro de una transacción que se revierte.
-- Esperado (datos del 11/11/2026, últimos 30 días; los números se moverán con el tiempo):
--   funciones_nuevas = 3
--   sin_filtros_ok = true (sin filtros nuevos la función devuelve un objeto con total, orden y filas)
--   abiertos ≈ 29, por_alistar ≈ 11, alistando ≈ 2, listo ≈ 4, en_salida ≈ 12
--   cobro_con_saldo ≈ 33, problemas ≈ 13, sin_mov_7 ≈ 42 (igual con período "hoy": ignora el período)
--   aviso "invalido: 22023" en la pestaña de mensajes

begin;

select set_config('request.jwt.claims', json_build_object('sub', (
  select a.perfil_id from analitica.acceso a join public.perfil p on p.id=a.perfil_id
  where p.activo limit 1), 'role', 'authenticated')::text, true);

create temp table _v on commit drop as
with d as (select (now() at time zone 'America/La_Paz')::date hoy)
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='analitica'
      and p.proname in ('wholesale_etapa','wholesale_cobro_estado','actividad_familia')) as funciones_nuevas,
  (select analitica.wholesale_lista(hoy-29, hoy, '{}', '', 1) ?& array['total','orden','filas']) as sin_filtros_ok,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"estado":"abierto"}', '', 1)->>'total') as abiertos,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"estado":"por_alistar"}', '', 1)->>'total') as por_alistar,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"estado":"alistando"}', '', 1)->>'total') as alistando,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"estado":"listo"}', '', 1)->>'total') as listo,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"estado":"en_salida"}', '', 1)->>'total') as en_salida,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"cobro":"con_saldo"}', '', 1)->>'total') as cobro_con_saldo,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"actividad":"problemas"}', '', 1)->>'total') as problemas,
  (select analitica.wholesale_lista(hoy-29, hoy, '{"sin_mov":"7"}', '', 1)->>'total') as sin_mov_7,
  (select analitica.wholesale_lista(hoy, hoy, '{"sin_mov":"7"}', '', 1)->>'total') as sin_mov_7_hoy
from d;

do $$ begin
  perform analitica.wholesale_lista(current_date-1, current_date, '{"estado":"x"}', '', 1);
  raise notice 'invalido: NO FALLÓ';
exception when sqlstate '22023' then
  raise notice 'invalido: 22023';
end $$;

select * from _v;

rollback;
