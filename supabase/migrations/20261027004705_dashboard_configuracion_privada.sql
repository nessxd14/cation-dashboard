-- Acceso directo denegado explícitamente. Las RPC autorizadas ejecutan las
-- operaciones de configuración como propietario, después de exigir_acceso().
create policy sin_acceso_directo on analitica.meta
  for all to authenticated using (false) with check (false);
create policy sin_acceso_directo on analitica.costo_producto
  for all to authenticated using (false) with check (false);
