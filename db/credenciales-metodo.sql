-- ============================================================
-- "Método de acceso" en credenciales: distinguir login directo
-- (correo + contraseña) de login federado (Con Google, etc.).
-- Correr en Supabase → SQL Editor.
-- ============================================================
alter table credenciales add column if not exists metodo_acceso text;
