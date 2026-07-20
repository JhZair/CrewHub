-- ============================================================
-- CRONOGRAMA: campo de descripción por actividad
--
-- Un nombre de actividad ("Digitalización y transferencia") dice QUÉ, no
-- CÓMO ni con qué ojo. La descripción es la nota que el responsable lee antes
-- de salir al campo o al arranque de la postproducción: qué se espera, qué
-- ojo poner, qué entregar. Opcional: `text` nullable, sin default.
--
-- ⚠ SIN transacción, a propósito (lección de db/archivo-dos-ejes.sql): el
--   editor SQL de Supabase corre sobre pgBouncer en modo transacción, y un
--   begin…commit que no cierra en la misma tanda se revierte al soltar la
--   conexión. Un solo `alter` se auto-commitea. Idempotente por el IF NOT EXISTS.
-- ============================================================

alter table cronograma_actividades
  add column if not exists descripcion text;

comment on column cronograma_actividades.descripcion is
  'Nota libre de la actividad: qué se espera, cómo hacerla, qué entregar. '
  'Opcional. El nombre dice qué; esto dice cómo.';

-- Verificación: debe listar la columna.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'cronograma_actividades' and column_name = 'descripcion';
