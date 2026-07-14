-- ============================================================
-- Pernocte: cuando un rodaje incluye noche de camping en la puna,
-- se paga también la noche (por defecto = tarifa de rodaje, o una
-- tarifa de noche propia si se define).
--   monto = base×fraccion + (noche ? tarifa_noche : 0)
-- Correr en Supabase → SQL Editor.
-- ============================================================
alter table personas add column if not exists tarifa_noche numeric;   -- pernocte (noche)
alter table jornadas add column if not exists noche boolean default false;
