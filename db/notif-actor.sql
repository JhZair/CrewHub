-- ============================================================
-- "Quién" en las notificaciones: guardar el nombre de quien hizo la
-- acción, para distinguir de un vistazo lo tuyo de lo ajeno.
-- Correr en Supabase → SQL Editor.
-- ============================================================
alter table notificaciones add column if not exists actor_nombre text;
