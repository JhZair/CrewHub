-- ============================================================
-- Realtime para la campanita: que las notificaciones nuevas
-- refresquen la campanita al instante. Correr en Supabase → SQL Editor.
-- ============================================================

-- 1) Cada usuario puede leer SUS notificaciones (necesario para el feed
--    y para que Realtime respete RLS y entregue solo las propias).
drop policy if exists "leer_notif" on notificaciones;
create policy "leer_notif" on notificaciones
  for select to authenticated using (usuario_id = auth.uid());

-- 2) Habilitar Realtime en la tabla (agregarla a la publicación). Idempotente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table notificaciones;
  end if;
end $$;

-- (Opcional) para que los eventos de UPDATE/DELETE lleven los valores
-- anteriores; no es necesario para recibir notificaciones nuevas.
-- alter table notificaciones replica identity full;
