-- ============================================================
-- EXPEDIENTE: guardar UN campo de forma atómica
--
-- guardarExpediente hacía read-modify-write de todo el jsonb: dos personas
-- editando campos DISTINTOS de la misma postulación a la vez se pisaban (lost
-- update). Esta función toca UN solo campo con jsonb_set en un único UPDATE
-- —atómico—, así ya no se pierden ediciones concurrentes. Devuelve true si
-- afectó una fila (sirve para detectar postulación inexistente o bloqueada).
--
-- Valor vacío = se borra el campo (como hacía la acción antes).
--
-- ⚠ SIN transacción (lección pgBouncer). `create or replace` es idempotente.
-- ============================================================

create or replace function public.set_expediente_campo(
  pid uuid, campo text, valor text, listo boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update postulaciones
  set expediente = case
    when coalesce(btrim(valor), '') = ''
      then coalesce(expediente, '{}'::jsonb) - campo
    else jsonb_set(
      coalesce(expediente, '{}'::jsonb),
      array[campo],
      jsonb_build_object('v', btrim(valor), 'listo', coalesce(listo, false)),
      true)
  end
  where id = pid;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Postgres otorga EXECUTE a PUBLIC por defecto en cada función nueva; con una
-- SECURITY DEFINER eso dejaría a `anon` (la anon key es pública) editar
-- cualquier expediente sin login. Se revoca y se concede solo a `authenticated`.
revoke all on function public.set_expediente_campo(uuid, text, text, boolean) from public;
grant execute on function public.set_expediente_campo(uuid, text, text, boolean) to authenticated;

-- Verificación
select proname from pg_proc where proname = 'set_expediente_campo';
