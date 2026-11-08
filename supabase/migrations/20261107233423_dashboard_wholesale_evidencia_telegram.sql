-- El lote conserva su destino original, aun después de retirar la copia de Storage.
do $migration$
declare
  definicion text := pg_get_functiondef('analitica.wholesale_expediente(bigint,bigint)'::regprocedure);
  anterior constant text := $sql$'telegram',coalesce(e.telegram,'[]'))$sql$;
  nuevo constant text := $sql$'telegram',coalesce(e.telegram,'[]'),
   'telegram_enlace',case when e.estado='ENVIADO'
    and e.grupo_enlace ~ '^[1-9][0-9]*$' and e.tema_id>0
    and (e.telegram->0->>'message_id') ~ '^[1-9][0-9]*$'
    then 'https://t.me/c/'||e.grupo_enlace||'/'||e.tema_id||'/'||(e.telegram->0->>'message_id') end)$sql$;
begin
  if (length(definicion)-length(replace(definicion,anterior,'')))/length(anterior) <> 1 then
    raise exception 'La definición del expediente WholeSale no coincide con la esperada';
  end if;
  execute replace(definicion,anterior,nuevo);
end
$migration$;
