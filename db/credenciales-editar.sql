-- ============================================================
-- Permitir EDITAR credenciales (faltaba la política RLS de UPDATE).
-- Correr en Supabase → SQL Editor.
-- ============================================================
drop policy if exists "editar_cred" on credenciales;
create policy "editar_cred" on credenciales
  for update to authenticated using (true) with check (true);
