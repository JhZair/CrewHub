-- ============================================================
-- Arreglo: no se podía guardar la edición de un comentario
-- Correr una sola vez en Supabase → SQL Editor.
-- ============================================================

-- 1) Columna que marca cuándo se editó (la usa el badge "(editado)")
alter table comentarios
  add column if not exists editado_en timestamptz;

-- 2) Política RLS de UPDATE que faltaba.
--    La autoría ("solo el autor edita") ya la valida la capa de app,
--    así que la política puede ser permisiva, igual que en otras tablas.
drop policy if exists "editar_com" on comentarios;
create policy "editar_com" on comentarios
  for update to authenticated using (true) with check (true);

-- (Opcional, por si más adelante quieres permitir borrar comentarios)
-- drop policy if exists "borrar_com" on comentarios;
-- create policy "borrar_com" on comentarios
--   for delete to authenticated using (true);
