-- ============================================================
-- POLÍTICAS RLS de `notificaciones` (INSERT / UPDATE).
--
-- La de SELECT vive en db/realtime-notificaciones.sql. Faltaban en el repo las
-- de escritura: sin ellas, con RLS activo, TODO insert de notificación desde la
-- app (asignación, comentario, mención, vínculo…) fallaría en silencio —el
-- código no revisa el error—. En la base actual ya funcionan (las campanitas
-- muestran avisos), así que esto es sobre todo para que un deploy limpio no se
-- rompa y quede documentado. Idempotente, SIN transacción (lección pgBouncer).
--
--   INSERT: cualquier usuario autenticado puede CREAR una notificación para
--           otro —necesario para avisar a terceros (te asignaron, te
--           vincularon, te mencionaron)—. El destinatario va en usuario_id.
--   UPDATE: cada quien solo puede tocar (marcar leída) las SUYAS.
-- ============================================================

alter table notificaciones enable row level security;

drop policy if exists "crear_notif" on notificaciones;
create policy "crear_notif" on notificaciones
  for insert to authenticated with check (true);

drop policy if exists "marcar_notif" on notificaciones;
create policy "marcar_notif" on notificaciones
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

select
  (select count(*) from pg_policies
    where tablename = 'notificaciones' and cmd = 'INSERT') as tiene_insert,
  (select count(*) from pg_policies
    where tablename = 'notificaciones' and cmd = 'UPDATE') as tiene_update;
