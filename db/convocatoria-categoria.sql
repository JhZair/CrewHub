-- ============================================================
-- CONVOCATORIAS: categoría del concurso
--
-- Cada convocatoria pertenece a una categoría DAFO (Producción audiovisual,
-- Videojuego, Cine en construcción, Gestión de proyectos, etc.). La categoría
-- decide las ETAPAS del cronograma de sus postulaciones (ver lib/etapas.ts).
-- Se guarda el NOMBRE de la categoría tal cual (sin tabla de traducción).
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table convocatorias
  add column if not exists categoria text;

comment on column convocatorias.categoria is
  'Categoría DAFO del concurso. Decide las etapas del cronograma de las '
  'postulaciones (lib/etapas.ts). Ej: "Videojuego", "Producción audiovisual".';

select column_name, data_type
from information_schema.columns
where table_name = 'convocatorias' and column_name = 'categoria';
