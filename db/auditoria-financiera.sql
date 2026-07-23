-- ============================================================
--  AUDITORÍA FINANCIERA — rastro inmutable de cada dato de plata
--
--  Dos garantías, ambas a nivel de BASE DE DATOS (no del código, que se
--  puede saltar yendo directo a la API):
--
--  1) TRAZABILIDAD: cada INSERT / UPDATE / DELETE sobre `rhe`,
--     `estado_cuenta` y `movimiento_banco` deja una fila con QUIÉN, CUÁNDO,
--     la ACCIÓN, y el ANTES → DESPUÉS completo. De cualquier cifra se puede
--     preguntar «quién la puso, cuándo, y qué decía antes».
--
--  2) PERMISOS EN LA BASE: escribir esas tres tablas exige `es_admin`. Hasta
--     hoy esa regla vivía solo en el servidor; ahora la exige el motor.
--
--  La bitácora de auditoría es APÉND-ONLY: se puede leer, pero NADIE la puede
--  editar ni borrar desde la app (solo el trigger, que corre como definer).
--
--  Idempotente y sin transacción externa (pgBouncer).
-- ============================================================

-- ── 0) ¿Es admin el usuario actual? (definer: evita recursión de RLS) ──
create or replace function public.es_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false);
$$;

-- ── 1) La bitácora inmutable ────────────────────────────────
create table if not exists auditoria_financiera (
  id         uuid primary key default gen_random_uuid(),
  tabla      text not null,          -- rhe | estado_cuenta | movimiento_banco
  fila_id    uuid,                   -- id de la fila afectada
  accion     text not null,          -- insert | update | delete
  actor_id   uuid,                   -- auth.uid() al momento (null = carga directa/sistema)
  antes      jsonb,                  -- la fila antes (update/delete)
  despues    jsonb,                  -- la fila después (insert/update)
  campos     text[],                 -- qué campos cambiaron (update)
  creado_en  timestamptz default now()
);
create index if not exists idx_audfin_tabla    on auditoria_financiera(tabla, fila_id, creado_en);
create index if not exists idx_audfin_reciente on auditoria_financiera(creado_en desc);

-- Solo lectura para el equipo; nadie escribe a mano (lo hace el trigger).
alter table auditoria_financiera enable row level security;
drop policy if exists "leer_audfin" on auditoria_financiera;
create policy "leer_audfin" on auditoria_financiera for select to authenticated using (true);
-- (a propósito NO hay policy de insert/update/delete → inalterable desde la app)

-- ── 2) La función del trigger ───────────────────────────────
create or replace function public.audit_financiera()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  vold    jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  vnew    jsonb := case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end;
  cambios text[] := '{}';
  k       text;
  fid     uuid;
begin
  fid := case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(vnew) loop
      if (vnew->>k) is distinct from (vold->>k) then
        cambios := array_append(cambios, k);
      end if;
    end loop;
    -- Un update que no cambió nada real no ensucia la bitácora.
    if array_length(cambios, 1) is null then
      return new;
    end if;
  end if;
  insert into public.auditoria_financiera (tabla, fila_id, accion, actor_id, antes, despues, campos)
  values (tg_table_name, fid, lower(tg_op), auth.uid(), vold, vnew, cambios);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ── 3) Instalar el trigger en las tres tablas financieras ───
do $$
declare t text;
begin
  foreach t in array array['rhe','estado_cuenta','movimiento_banco'] loop
    execute format('drop trigger if exists trg_audfin_%I on %I', t, t);
    execute format('create trigger trg_audfin_%I after insert or update or delete on %I
                    for each row execute function audit_financiera()', t, t);
  end loop;
end $$;

-- ── 4) Endurecer la RLS: escribir exige es_admin ────────────
--  La lectura sigue abierta al equipo (using true, como hoy). Solo el ESCRIBIR
--  pasa a exigir es_admin en la propia base. Las cargas por SQL (rol postgres)
--  saltan RLS, así que los scripts de datos siguen funcionando.

-- rhe
drop policy if exists "crear_rhe"  on rhe;
drop policy if exists "editar_rhe" on rhe;
drop policy if exists "borrar_rhe" on rhe;
create policy "crear_rhe"  on rhe for insert to authenticated with check (public.es_admin());
create policy "editar_rhe" on rhe for update to authenticated using (public.es_admin());
create policy "borrar_rhe" on rhe for delete to authenticated using (public.es_admin());

-- estado_cuenta
drop policy if exists "crear_estcta"  on estado_cuenta;
drop policy if exists "editar_estcta" on estado_cuenta;
drop policy if exists "borrar_estcta" on estado_cuenta;
create policy "crear_estcta"  on estado_cuenta for insert to authenticated with check (public.es_admin());
create policy "editar_estcta" on estado_cuenta for update to authenticated using (public.es_admin());
create policy "borrar_estcta" on estado_cuenta for delete to authenticated using (public.es_admin());

-- movimiento_banco
drop policy if exists "crear_movbanco"  on movimiento_banco;
drop policy if exists "editar_movbanco" on movimiento_banco;
drop policy if exists "borrar_movbanco" on movimiento_banco;
create policy "crear_movbanco"  on movimiento_banco for insert to authenticated with check (public.es_admin());
create policy "editar_movbanco" on movimiento_banco for update to authenticated using (public.es_admin());
create policy "borrar_movbanco" on movimiento_banco for delete to authenticated using (public.es_admin());

-- ── 5) Comprobación ─────────────────────────────────────────
select 'triggers instalados' as que, count(*) as n
  from pg_trigger where tgname like 'trg_audfin_%'
union all
select 'políticas de escritura (deben ser 9)', count(*)
  from pg_policies
 where tablename in ('rhe','estado_cuenta','movimiento_banco')
   and policyname ~ '^(crear|editar|borrar)_';
