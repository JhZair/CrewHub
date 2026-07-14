-- ============================================================
-- Datos flexibles y verificables por credencial.
-- Cada credencial (empresa/persona × plataforma) puede tener
-- una lista libre de datos (correo de contacto, teléfono,
-- pregunta de seguridad, quién administra, PIN…), y cada dato
-- guarda cuándo se verificó por última vez para poder avisar
-- cuando lleva mucho sin revisarse.
-- Correr en Supabase → SQL Editor.
-- ============================================================
create table if not exists credencial_datos (
  id            uuid primary key default gen_random_uuid(),
  credencial_id uuid not null references credenciales(id) on delete cascade,
  etiqueta      text not null,
  valor         text,
  verificado_en date,                 -- última vez que se confirmó vigente
  creado_en     timestamptz default now()
);
create index if not exists idx_credencial_datos_cred on credencial_datos(credencial_id);

alter table credencial_datos enable row level security;
drop policy if exists "cd_sel" on credencial_datos;
drop policy if exists "cd_ins" on credencial_datos;
drop policy if exists "cd_upd" on credencial_datos;
drop policy if exists "cd_del" on credencial_datos;
create policy "cd_sel" on credencial_datos for select to authenticated using (true);
create policy "cd_ins" on credencial_datos for insert to authenticated with check (true);
create policy "cd_upd" on credencial_datos for update to authenticated using (true) with check (true);
create policy "cd_del" on credencial_datos for delete to authenticated using (true);
