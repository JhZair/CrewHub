-- ============================================================
-- Módulo Jornadas: registro de días trabajados (reemplaza el
-- cuaderno de Katy) con tarifas por persona para el pago.
--   fraccion: 0.5 medio · 1 completo · 1.5 día y medio
--   monto: snapshot en soles al registrar
--     = (tipo=rodaje ? tarifa_rodaje : tarifa_dia) × fraccion
-- Correr en Supabase → SQL Editor.
-- ============================================================

-- Tarifas por persona (en soles)
alter table personas add column if not exists tarifa_dia numeric;     -- jornada normal
alter table personas add column if not exists tarifa_rodaje numeric;  -- jornada de rodaje (opcional)

create table if not exists jornadas (
  id uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references personas(id) on delete cascade,
  fecha          date not null,
  proyecto_id    uuid references proyectos(id) on delete set null,
  tipo           text not null default 'rodaje',   -- rodaje | oficina | scouting
  fraccion       numeric not null default 1,        -- 0.5 | 1 | 1.5
  monto          numeric,                           -- snapshot en soles al registrar
  registrado_por uuid references perfiles(id),
  notas          text,
  creado_en      timestamptz default now()
);
create index if not exists idx_jornadas_fecha on jornadas(fecha);
create index if not exists idx_jornadas_persona on jornadas(persona_id);
create index if not exists idx_jornadas_proyecto on jornadas(proyecto_id);

alter table jornadas enable row level security;
drop policy if exists "j_sel" on jornadas;
drop policy if exists "j_ins" on jornadas;
drop policy if exists "j_upd" on jornadas;
drop policy if exists "j_del" on jornadas;
create policy "j_sel" on jornadas for select to authenticated using (true);
create policy "j_ins" on jornadas for insert to authenticated with check (true);
create policy "j_upd" on jornadas for update to authenticated using (true) with check (true);
create policy "j_del" on jornadas for delete to authenticated using (true);
