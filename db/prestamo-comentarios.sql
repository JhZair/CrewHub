-- ============================================================
-- COMENTARIOS SOBRE UN PRÉSTAMO DE EQUIPO
--
-- Cada vez que un equipo sale (préstamo) puede necesitar una conversación:
-- «lo devolvió con el parasol rayado», «se lo pasó a Carlos el 12», «falta el
-- cargador». Eso no es un caso (no es trabajo con estado/responsable/plazo), es
-- la bitácora de ESE préstamo. Reusa la MISMA tabla `comentarios` y el mismo
-- motor —una sola bodega, ahora tres puertas: publicación, objeto o préstamo—
-- igual que se hizo con los objetos del repositorio (db/objeto-comentarios.sql).
--
-- Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

alter table comentarios add column if not exists prestamo_id uuid
  references equipo_prestamos(id) on delete cascade;

-- Exactamente UNO de los tres dueños. El XOR de dos (`<>`) ya no basta con tres:
-- se cuenta cuántos vienen no nulos y se exige que sea exactamente uno.
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk
  check (
    (publicacion_id is not null)::int
    + (objeto_id is not null)::int
    + (prestamo_id is not null)::int
    = 1
  );

create index if not exists idx_com_prestamo on comentarios(prestamo_id, creado_en);

-- La policy de INSERT ya es «el autor es quien comenta» (autor_id = auth.uid()),
-- sirve igual sea cual sea la puerta. Se redeclara por si el proyecto se montó
-- sin haber corrido db/objeto-comentarios.sql.
drop policy if exists "crear_com" on comentarios;
create policy "crear_com" on comentarios
  for insert to authenticated with check (autor_id = auth.uid());

-- ── Notificaciones: también pueden apuntar a un préstamo ──
-- Para que «@Katy» en un comentario de préstamo le LLEGUE y la lleve al equipo.
-- El destino (ficha del equipo) lo resuelven las pantallas: del préstamo salen
-- a su equipamiento. `publicacion_id` ya era nullable.
alter table notificaciones add column if not exists prestamo_id uuid
  references equipo_prestamos(id) on delete cascade;
create index if not exists idx_notif_prestamo on notificaciones(prestamo_id) where prestamo_id is not null;

select
  (select count(*) from information_schema.columns
     where table_name='comentarios' and column_name='prestamo_id') as tiene_prestamo_id,
  (select count(*) from information_schema.columns
     where table_name='notificaciones' and column_name='prestamo_id') as notif_tiene_prestamo_id;
