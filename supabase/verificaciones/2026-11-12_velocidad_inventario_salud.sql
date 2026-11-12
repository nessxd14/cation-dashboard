-- Verificación de 20261112020000_velocidad_inventario_salud.sql (solo lectura).
-- Correr DESPUÉS de aplicar la migración, completo, en el SQL Editor. Se revierte al final.
-- Esperado (12/11/2026):
--   inventario_nuevo = true, salud_nueva = true
--   productos ≈ 1656, filas_pagina = 50, indicadores_salud = 7
--   El SQL Editor muestra el tiempo total abajo: debería ser < 1 s
--   (antes, solo el inventario tardaba ≈ 7 s).

begin;

select set_config('request.jwt.claims', json_build_object('sub', (
  select a.perfil_id from analitica.acceso a join public.perfil p on p.id=a.perfil_id
  where p.activo limit 1), 'role', 'authenticated')::text, true);

with inv as (select analitica.inventario('{}', 1, 50) r),
sal as (select public.dash_salud() r)
select
  position('fisico_producto' in pg_get_functiondef('analitica.inventario(jsonb,integer,integer)'::regprocedure))>0 as inventario_nuevo,
  position('group by producto_id, ubicacion_id' in pg_get_functiondef('public.dash_salud()'::regprocedure))>0 as salud_nueva,
  (select (r->>'total')::int from inv) as productos,
  (select jsonb_array_length(r->'filas') from inv) as filas_pagina,
  (select jsonb_array_length(r) from sal) as indicadores_salud;

rollback;
