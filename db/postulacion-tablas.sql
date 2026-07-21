-- ============================================================
-- POSTULACIONES: material de archivo + participantes beneficiarios
--
-- Dos tablas repetibles del formulario DAFO que faltaban en el expediente
-- (eran texto plano). Cada una es un arreglo de filas en un jsonb, como el
-- presupuesto: la forma la define lib/tablas-expediente.ts.
--   · material_archivo → { descripcion, autor, fuente } por fila
--   · beneficiarios    → { rol, cantidad } por fila (personal estimado)
--
-- (Los porcentajes del equipo NO se guardan: se calculan desde la ficha de
--  cada persona — nacionalidad y región.)
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table postulaciones add column if not exists material_archivo jsonb;
alter table postulaciones add column if not exists beneficiarios jsonb;

comment on column postulaciones.material_archivo is
  'Material de archivo del proyecto (Sección C DAFO): [{descripcion, autor, fuente}].';
comment on column postulaciones.beneficiarios is
  'Participantes/beneficiarios: personal estimado a emplear: [{rol, cantidad}].';

select
  (select count(*) from information_schema.columns where table_name='postulaciones' and column_name='material_archivo') as tiene_material,
  (select count(*) from information_schema.columns where table_name='postulaciones' and column_name='beneficiarios') as tiene_beneficiarios;
