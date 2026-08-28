-- ============================================================
--  db/crono-caso-unico.sql — UN CASO, UNA ACTIVIDAD
--
--  `cronograma_actividades.publicacion_id` apunta al caso de esa actividad.
--  Nada impedía que DOS actividades apuntaran al mismo caso: no había índice.
--
--  ── POR QUÉ IMPORTA AHORA ──
--  Hasta hoy esa columna solo se llenaba materializando —que crea un caso
--  nuevo cada vez, así que el duplicado no podía ocurrir—. Desde que se puede
--  ATAR un caso que ya existe, sí puede: dos pestañas a la vez, o un caso
--  vinculado a dos fondos cuya otra actividad el usuario no puede leer (la
--  comprobación previa es un `select`, y un `select` pasa por RLS).
--
--  Con dos actividades sobre el mismo caso, `correrCronograma` mueve las
--  fechas de ese caso DOS VECES, la segunda pisando a la primera, y nada lo
--  delata. Una comprobación en la aplicación no puede cerrar esa carrera; un
--  índice único sí.
--
--  ── PARCIAL, Y AQUÍ ES OBLIGATORIO ──
--  `where publicacion_id is not null`: la inmensa mayoría de las actividades
--  no tienen caso, y sin el `where` todos esos NULL competirían entre sí.
--  ⚠ Un índice único PARCIAL no sirve para `on conflict` (error 42P10) — pero
--  aquí no hace falta: nadie hace upsert sobre esta columna.
--
--  ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · ANTES — ¿hay algún caso ya duplicado? Debe salir 0 filas.
--     Si sale alguna, el índice de abajo FALLARÁ: hay que decidir a mano cuál
--     actividad se queda con el caso y soltar la otra desde la pantalla.
-- ------------------------------------------------------------
select ca.publicacion_id,
       count(*)                     as actividades,
       string_agg(ca.nombre, ' | ') as cuales
  from cronograma_actividades ca
 where ca.publicacion_id is not null
 group by ca.publicacion_id
having count(*) > 1;

-- ------------------------------------------------------------
-- 2 · EL ÍNDICE
-- ------------------------------------------------------------
create unique index if not exists uq_crono_caso
  on cronograma_actividades(publicacion_id)
  where publicacion_id is not null;

comment on index uq_crono_caso is
  'Un caso cuelga como mucho de UNA actividad de cronograma. Sin esto, atar el '
  'mismo caso dos veces hacía que correrCronograma moviera sus fechas dos '
  'veces, la segunda pisando a la primera, sin ningún error.';

-- ------------------------------------------------------------
-- 3 · VERIFICACIÓN — debe decir 1
-- ------------------------------------------------------------
select count(*) as indice_creado
  from pg_indexes
 where tablename = 'cronograma_actividades' and indexname = 'uq_crono_caso';
