-- ============================================================
-- Aprobación de jornadas: cada jornada la debe aprobar un admin.
-- "A pagar" cuenta solo lo aprobado. Editar una jornada la regresa
-- a pendiente (aprobada = false) para que se vuelva a aprobar.
-- Correr en Supabase → SQL Editor.
-- ============================================================
alter table jornadas add column if not exists aprobada boolean default false;
alter table jornadas add column if not exists aprobada_por uuid references perfiles(id);
alter table jornadas add column if not exists aprobada_en timestamptz;
