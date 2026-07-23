-- ============================================================
--  Mujunakuy (PO-005) — Banco COMPLETO en un solo archivo
--  Crea la tabla movimiento_banco Y carga los 31 movimientos.
--  Corre solo ESTE archivo (el orden ya no importa). Idempotente.
-- ============================================================

-- ── 1) La tabla (si no existe) ──────────────────────────────
create table if not exists movimiento_banco (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  fecha          date not null,
  glosa          text not null,
  medio          text,
  tipo           text not null default 'cargo' check (tipo in ('abono', 'cargo')),
  monto          numeric(12,2) not null,
  saldo          numeric(12,2),
  categoria      text not null default 'otro'
                 check (categoria in ('desembolso', 'retiro', 'comision', 'interes', 'otro')),
  rhe_id         uuid references rhe(id) on delete set null,
  nota           text,
  creado_en      timestamptz default now(),
  creado_por     uuid references perfiles(id),
  unique (postulacion_id, fecha, glosa, monto, tipo)
);

create index if not exists idx_movbanco_post on movimiento_banco(postulacion_id, fecha);

alter table movimiento_banco enable row level security;
drop policy if exists "leer_movbanco"   on movimiento_banco;
drop policy if exists "crear_movbanco"  on movimiento_banco;
drop policy if exists "editar_movbanco" on movimiento_banco;
drop policy if exists "borrar_movbanco" on movimiento_banco;
create policy "leer_movbanco"   on movimiento_banco for select to authenticated using (true);
create policy "crear_movbanco"  on movimiento_banco for insert to authenticated with check (true);
create policy "editar_movbanco" on movimiento_banco for update to authenticated using (true);
create policy "borrar_movbanco" on movimiento_banco for delete to authenticated using (true);

-- ── 2) Los 31 movimientos (BCP 285-1154499-0-91, oct-23 a may-24) ──
with f as (
  select id from postulaciones where codigo = 'PO-005' limit 1
)
insert into movimiento_banco (postulacion_id, fecha, glosa, medio, tipo, monto, saldo, categoria)
select f.id, d.fecha::date, d.glosa, d.medio, d.tipo, d.monto, d.saldo, d.categoria
from f cross join (values
  ('2023-10-14', 'TRAN.CTAS.TERC.BM',            'BPI', 'abono',   5.00,    5.00, 'otro'),
  ('2023-10-20', 'BCO.NACION · desembolso estímulo DAFO', 'VEN', 'abono', 200000.00, 200005.00, 'desembolso'),
  ('2023-10-31', 'IMPUESTO ITF',                 'INT', 'cargo',  10.00, 199995.00, 'comision'),
  ('2023-10-31', 'NOTA DE DEBITO',               'VEN', 'cargo', 19800.00, 180195.00, 'retiro'),
  ('2023-10-31', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50, 180191.50, 'comision'),
  ('2023-10-31', 'COM.MANTENIM',                 'INT', 'cargo',  35.00, 180156.50, 'comision'),
  ('2023-11-25', 'COMISIONES CARTA ORDEN',       'VEN', 'cargo',  60.00, 180096.50, 'comision'),
  ('2023-11-25', 'EMIS.CHEQ GEREN VENT',         'VEN', 'cargo', 23510.00, 156586.50, 'retiro'),
  ('2023-11-30', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50, 156583.00, 'comision'),
  ('2023-11-30', 'COM.MANTENIM',                 'INT', 'cargo',  35.00, 156548.00, 'comision'),
  ('2023-12-23', 'COMISIONES CARTA ORDEN',       'VEN', 'cargo',  60.00, 156488.00, 'comision'),
  ('2023-12-23', 'NOTA DE DEBITO',               'VEN', 'cargo', 27610.00, 128878.00, 'retiro'),
  ('2023-12-30', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50, 128874.50, 'comision'),
  ('2023-12-30', 'COM.MANTENIM',                 'INT', 'cargo',  35.00, 128839.50, 'comision'),
  ('2024-01-28', 'EMIS.CHEQ GEREN VENT',         'VEN', 'cargo', 33910.00,  94929.50, 'retiro'),
  ('2024-01-31', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50,  94926.00, 'comision'),
  ('2024-01-31', 'COM.MANTENIM',                 'INT', 'cargo',  35.00,  94891.00, 'comision'),
  ('2024-02-16', 'REG.RET.EFECTIVO',             'VEN', 'cargo', 39130.00,  55761.00, 'retiro'),
  ('2024-02-29', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50,  55757.50, 'comision'),
  ('2024-02-29', 'COM.MANTENIM',                 'INT', 'cargo',  35.00,  55722.50, 'comision'),
  ('2024-03-30', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50,  55719.00, 'comision'),
  ('2024-03-30', 'COM.MANTENIM',                 'INT', 'cargo',  35.00,  55684.00, 'comision'),
  ('2024-04-01', 'REG.OP CON DEV ITF',           'VEN', 'cargo', 21720.00,  33964.00, 'retiro'),
  ('2024-04-30', 'ENVIO.EST.CTA',                'INT', 'cargo',   3.50,  33960.50, 'comision'),
  ('2024-04-30', 'COM.MANTENIM',                 'INT', 'cargo',  35.00,  33925.50, 'comision'),
  ('2024-05-09', 'REG.RET.EFECTIVO',             'VEN', 'cargo', 33923.85,      1.65, 'retiro'),
  ('2024-05-09', 'PORTE N CARGO',                'INT', 'cargo',   3.50,     -1.85, 'comision'),
  ('2024-05-09', 'REPOSICION.DEBITO',            'INT', 'cargo',   7.00,     -8.85, 'comision'),
  ('2024-05-31', 'ENVIO.EST.CTA',                'INT', 'cargo',   5.50,    -14.35, 'comision'),
  ('2024-05-31', 'INTERESES DEUDORES',           'INT', 'cargo',   0.37,    -14.72, 'interes'),
  ('2024-05-31', 'COM.MANTENIM',                 'INT', 'cargo',  35.00,    -49.72, 'comision')
) as d(fecha, glosa, medio, tipo, monto, saldo, categoria)
on conflict (postulacion_id, fecha, glosa, monto, tipo) do nothing;

-- ── 3) Comprobación ─────────────────────────────────────────
select m.categoria, count(*) as movimientos, sum(m.monto) as total
  from movimiento_banco m
  join postulaciones p on p.id = m.postulacion_id
 where p.codigo = 'PO-005'
 group by m.categoria order by m.categoria;
