-- ============================================================
-- CRONOGRAMA POR POSTULACIÓN + FOTO DE LO POSTULADO
--
-- Cada postulación arma SU propio cronograma (independiente del de otras
-- postulaciones del mismo proyecto). Ese cronograma vivo es el de trabajo; al
-- enviarlo a DAFO se congela una FOTO (`cronograma_postulado`) = lo que se
-- presentó. Si el fondo se gana, el vivo se sigue editando (ejecución) y
-- siempre se puede comparar contra la foto para ver qué cambió.
--
-- 1) cronograma_actividades gana un tercer dueño posible: la postulación
--    (ya tenía proyecto_id / convocatoria_id).
-- 2) postulaciones guarda la foto (jsonb) y cuándo se tomó.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table cronograma_actividades
  add column if not exists postulacion_id uuid references postulaciones(id);

create index if not exists idx_crono_postulacion
  on cronograma_actividades(postulacion_id, fecha_inicio);

comment on column cronograma_actividades.postulacion_id is
  'Dueño alternativo: el cronograma propio de una postulación (distinto del '
  'plan general del proyecto). Uno solo de proyecto_id/convocatoria_id/'
  'postulacion_id está lleno por fila.';

alter table postulaciones
  add column if not exists cronograma_postulado jsonb;
alter table postulaciones
  add column if not exists cronograma_postulado_en timestamptz;

comment on column postulaciones.cronograma_postulado is
  'Foto congelada del cronograma tal como se envió a DAFO (arreglo de '
  'actividades). El cronograma vivo sigue en cronograma_actividades; esto es '
  'el registro de lo presentado, para el expediente y para comparar cambios.';

-- Verificación
select
  (select count(*) from information_schema.columns
     where table_name='cronograma_actividades' and column_name='postulacion_id') as tiene_postulacion_id,
  (select count(*) from information_schema.columns
     where table_name='postulaciones' and column_name='cronograma_postulado') as tiene_foto;
