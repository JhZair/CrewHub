-- ============================================================
-- POSTULACIONES: prototipo / vertical slice (solo videojuego)
--
-- Tabla repetible del formulario DAFO de videojuego: "Prototipo o vertical
-- slice ejecutable o registro audiovisual de la experiencia del usuario".
-- Un arreglo de filas en un jsonb, como material_archivo/beneficiarios.
--   · prototipo → [{material, requisitos, enlace, pass}] por fila
--
-- La forma la define lib/tablas-expediente.ts. Se muestra solo cuando la
-- convocatoria es de categoría videojuego.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table postulaciones add column if not exists prototipo jsonb;

comment on column postulaciones.prototipo is
  'Prototipo/vertical slice ejecutable (DAFO videojuego): [{material, requisitos, enlace, pass}].';

select
  (select count(*) from information_schema.columns
     where table_name='postulaciones' and column_name='prototipo') as tiene_prototipo;
