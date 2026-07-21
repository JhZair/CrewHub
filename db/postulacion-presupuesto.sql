-- ============================================================
-- POSTULACIONES: presupuesto detallado (Sección D del formulario DAFO)
--
-- Tabla de costos por rubro (ítems con cantidad × costo unitario), el split
-- estímulo / otras fuentes con la regla del 70%, el tipo de cambio para el
-- dólar, y el plan de financiamiento (fuentes). Todo en un jsonb, como el
-- expediente: la forma la define lib/rubros.ts (Presupuesto).
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table postulaciones
  add column if not exists presupuesto jsonb;

comment on column postulaciones.presupuesto is
  'Presupuesto detallado (Sección D DAFO): { tipo_cambio, items[], fuentes[] }. '
  'Los rubros salen de la categoría de la convocatoria (lib/rubros.ts).';

select column_name, data_type
from information_schema.columns
where table_name = 'postulaciones' and column_name = 'presupuesto';
