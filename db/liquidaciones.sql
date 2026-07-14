-- ============================================================
-- Ciclo de pago mensual: cada persona CONFIRMA su mes y el admin
-- lo LIQUIDA (genera el recibo interno, congelando lo aprobado).
--   sin fila           = mes abierto (se puede registrar/editar)
--   estado=confirmado  = la persona firmó su mes (bloqueado para ella)
--   estado=liquidado   = admin generó el recibo (bloqueado del todo)
-- Correr en Supabase → SQL Editor.
-- ============================================================
create table if not exists liquidaciones (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references personas(id) on delete cascade,
  anio           int not null,
  mes            int not null,                 -- 1-12
  estado         text not null default 'confirmado',  -- confirmado | liquidado
  confirmado_en  timestamptz,
  confirmado_por uuid references perfiles(id),
  total_jornadas numeric,                      -- snapshot del recibo
  total_monto    numeric,
  liquidado_en   timestamptz,
  liquidado_por  uuid references perfiles(id),
  creado_en      timestamptz default now(),
  unique (persona_id, anio, mes)
);
create index if not exists idx_liquidaciones_pm on liquidaciones(persona_id, anio, mes);

alter table liquidaciones enable row level security;
drop policy if exists "liq_sel" on liquidaciones;
drop policy if exists "liq_ins" on liquidaciones;
drop policy if exists "liq_upd" on liquidaciones;
drop policy if exists "liq_del" on liquidaciones;
create policy "liq_sel" on liquidaciones for select to authenticated using (true);
create policy "liq_ins" on liquidaciones for insert to authenticated with check (true);
create policy "liq_upd" on liquidaciones for update to authenticated using (true) with check (true);
create policy "liq_del" on liquidaciones for delete to authenticated using (true);
