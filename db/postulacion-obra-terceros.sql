-- ============================================================
-- POSTULACIONES: obra de terceros (condicional)
--
-- Tabla repetible del formulario DAFO que solo aplica cuando la postulación
-- adapta o transforma una obra ajena (el combo "Usa obra de terceros" = Sí).
--   · obra_terceros → [{titulo, autores, titulares}] por fila
--
-- La forma la define lib/tablas-expediente.ts. En la ficha, el plegable aparece
-- solo cuando la respuesta del combo es "Sí".
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table postulaciones add column if not exists obra_terceros jsonb;

comment on column postulaciones.obra_terceros is
  'Obras de terceros adaptadas/transformadas (DAFO): [{titulo, autores, titulares}].';

select
  (select count(*) from information_schema.columns
     where table_name='postulaciones' and column_name='obra_terceros') as tiene_obra_terceros;
