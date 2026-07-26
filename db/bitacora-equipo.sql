-- ============================================================
-- BITÁCORA DEL EQUIPO — comentarios sueltos a nivel del equipamiento
--
-- Hasta ahora un comentario de equipo colgaba de un USO (prestamo_id): quedaba
-- atado a quién tenía el equipo. Pero hay asuntos del EQUIPO mismo que no son de
-- ningún uso: «buscando técnico», o un daño viejo que pasó en otra salida ya no
-- registrada. Se agrega un CUARTO dueño, `equipamiento_id`, para dejar esos
-- comentarios sueltos en la bitácora del equipo, independientes de un préstamo.
--
-- Además `fecha_evento`: CUÁNDO ocurrió el hecho (p. ej. la caída del 9-feb),
-- distinto de `creado_en` (cuándo se registró). Así un daño viejo se registra
-- hoy pero muestra su fecha real.
--
-- `imagenes`, `etiquetas`, `es_dano` ya existen. Idempotente, SIN transacción
-- externa (lección pgBouncer).
-- ============================================================

alter table comentarios add column if not exists equipamiento_id uuid
  references equipamiento(id) on delete cascade;
alter table comentarios add column if not exists fecha_evento date;

comment on column comentarios.equipamiento_id is
  'Cuarto dueño: comentario suelto de la bitácora del equipo (no de un uso).';
comment on column comentarios.fecha_evento is
  'Cuándo ocurrió el hecho (p. ej. la caída), distinto de creado_en (registro).';

-- Exactamente UNO de los cuatro dueños: publicación, objeto, préstamo o equipo.
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk
  check (
    (publicacion_id is not null)::int
    + (objeto_id is not null)::int
    + (prestamo_id is not null)::int
    + (equipamiento_id is not null)::int
    = 1
  );

create index if not exists idx_com_equipamiento on comentarios(equipamiento_id, creado_en);

-- ── Notificaciones: una @mención en la bitácora apunta directo al equipo ──
-- (las de un uso llegan por prestamo_id→equipamiento; estas ya traen el id).
alter table notificaciones add column if not exists equipamiento_id uuid
  references equipamiento(id) on delete cascade;
create index if not exists idx_notif_equipamiento on notificaciones(equipamiento_id) where equipamiento_id is not null;

select
  (select count(*) from information_schema.columns
     where table_name='comentarios' and column_name='equipamiento_id') as com_tiene_equipo,
  (select count(*) from information_schema.columns
     where table_name='comentarios' and column_name='fecha_evento') as com_tiene_fecha,
  (select count(*) from information_schema.columns
     where table_name='notificaciones' and column_name='equipamiento_id') as notif_tiene_equipo;
