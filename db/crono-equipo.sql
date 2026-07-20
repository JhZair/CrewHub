-- ============================================================
-- CRONOGRAMA: equipo de apoyo por actividad
--
-- Una actividad tiene UN responsable (quien rinde cuentas), pero muchas
-- necesitan más de una persona: «Realización de entrevistas» es, mínimo, el
-- entrevistador (responsable) y el operador de cámara (apoyo). En vez de
-- partir la actividad en dos filas —que duplica fechas y descripción y llena
-- el cronograma—, se guarda el resto del equipo aquí.
--
-- `uuid[]` de ids de `perfiles` (los mismos que `responsable`). Un arreglo, no
-- una tabla puente: ya hay tres tablas de equipo casi iguales en el sistema
-- (proyecto_equipo, postulacion_equipo, empresa_miembros) y esto es una lista
-- simple de personas, sin cargo ni orden — no amerita la cuarta.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table cronograma_actividades
  add column if not exists equipo uuid[];

comment on column cronograma_actividades.equipo is
  'Equipo de apoyo (ids de perfiles). El responsable rinde cuentas; estos son '
  'los demás que trabajan la actividad. Lista simple, sin cargo.';

-- Verificación: debe listar la columna como ARRAY.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'cronograma_actividades' and column_name = 'equipo';
