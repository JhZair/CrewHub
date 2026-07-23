-- ============================================================
--  MOVIMIENTO DE BANCO — el libro línea a línea del estado de cuenta
--
--  El saldo mensual esconde información: no distingue una comisión
--  automática del banco de un retiro real para pagar a alguien. Este
--  es el detalle que sí lo separa —la sección ACTIVIDADES de cada
--  estado— para que:
--    · las comisiones del banco se sumen solas (¿cuánto cobró el banco?),
--    · cada retiro grande se pueda atar al RHE/comprobante que financió,
--    · el saldo cuadre movimiento a movimiento.
--
--  Categoría, para leer el libro sin adivinar:
--    desembolso · el estímulo entrando
--    retiro     · salida real a gastos (cheque gerencia, nota débito, retiro)
--    comision   · cobro automático del banco (ITF, mantenimiento, envío, etc.)
--    interes    · interés (acreedor suma, deudor resta)
--    otro       · lo que no cae en las anteriores
--
--  Idempotente: unique (postulacion_id, fecha, glosa, monto, tipo) +
--  on conflict do nothing en la carga, para poder correrla dos veces.
-- ============================================================

create table if not exists movimiento_banco (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  fecha          date not null,
  glosa          text not null,              -- la descripción del banco
  medio          text,                       -- BPI / VEN / INT / etc.
  tipo           text not null default 'cargo' check (tipo in ('abono', 'cargo')),
  monto          numeric(12,2) not null,     -- siempre positivo; el signo lo da `tipo`
  saldo          numeric(12,2),              -- saldo contable después del movimiento
  categoria      text not null default 'otro'
                 check (categoria in ('desembolso', 'retiro', 'comision', 'interes', 'otro')),
  -- El RHE (u otro comprobante) que este retiro financió, cuando aplica.
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
