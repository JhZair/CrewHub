-- ============================================================
-- POSTULACIONES: precontratos (cartas de compromiso del equipo)
--
-- DAFO pide un compromiso firmado con el equipo clave donde consta el rol y el
-- honorario acordado, coherente con el presupuesto. Se guarda como arreglo en
-- un jsonb (como material_archivo / beneficiarios): la forma la define
-- lib/precontratos.ts.
--   precontratos → [{ id, persona_id, cargo, item_id, estado, firmado_en,
--                      forma_pago, notas }]
--     · persona_id → persona del equipo nombrado (proyecto o postulación)
--     · item_id    → id del ítem del presupuesto del que HEREDA el monto
--                    (no se guarda el monto: se deriva del presupuesto vivo)
--     · estado     → 'pendiente' | 'firmado'
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table postulaciones add column if not exists precontratos jsonb;

comment on column postulaciones.precontratos is
  'Precontratos/cartas de compromiso del equipo: [{id, persona_id, cargo, item_id, estado, firmado_en, forma_pago, notas}]. El monto se hereda del ítem del presupuesto (item_id), no se guarda aquí.';

select
  (select count(*) from information_schema.columns
    where table_name='postulaciones' and column_name='precontratos') as tiene_precontratos;
