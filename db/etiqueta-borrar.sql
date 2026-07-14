-- ============================================================
-- Permitir ELIMINAR etiquetas (política RLS de DELETE).
-- Necesaria para el botón × de "Sin casos" en /etiquetas.
-- Correr en Supabase → SQL Editor.
-- ============================================================
drop policy if exists "borrar_etiqueta" on etiquetas;
create policy "borrar_etiqueta" on etiquetas
  for delete to authenticated using (true);
