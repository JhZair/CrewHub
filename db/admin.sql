-- ============================================================
-- Flag de administrador en los perfiles (cuentas).
-- La página /admin (tarifas y otros temas de gestión) solo es
-- visible para quienes tengan es_admin = true.
-- Correr en Supabase → SQL Editor. AJUSTA el nombre a tu cuenta.
-- ============================================================
alter table perfiles add column if not exists es_admin boolean default false;

-- Marca al administrador (cambia 'John Oros' por tu nombre de perfil):
update perfiles set es_admin = true where nombre = 'John Oros';
