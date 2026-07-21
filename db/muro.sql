-- ============================================================
-- MURO — mensajes efímeros de oficina ("prendí el hervidor", "almuerzo listo",
-- "abre la puerta"). NO es un chat ni deja historial que importe: se ven los de
-- HOY y se limpian solos (la app filtra por el día en hora de Lima). Un 👍 de un
-- toque como acuse. Reemplaza el último uso de Google Chat del equipo.
--
-- Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

create table if not exists muro_mensajes (
  id        uuid primary key default gen_random_uuid(),
  autor_id  uuid not null references perfiles(id),
  texto     text not null,
  vistos    uuid[] not null default '{}',   -- quiénes dieron 👍
  creado_en timestamptz not null default now()
);
create index if not exists idx_muro_creado on muro_mensajes(creado_en desc);

alter table muro_mensajes enable row level security;
drop policy if exists "leer_muro" on muro_mensajes;
create policy "leer_muro"  on muro_mensajes for select to authenticated using (true);
drop policy if exists "crear_muro" on muro_mensajes;
create policy "crear_muro" on muro_mensajes for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists "borrar_muro" on muro_mensajes;
create policy "borrar_muro" on muro_mensajes for delete to authenticated using (autor_id = auth.uid());

-- 👍 atómico: agrega/quita a quien llama del arreglo `vistos`, sin carreras.
-- SECURITY DEFINER (salta RLS para tocar filas ajenas), por eso se revoca a public.
create or replace function public.muro_toggle_visto(mid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;   -- sin sesión no toca nada
  update muro_mensajes set vistos = case
    when auth.uid() = any(vistos) then array_remove(vistos, auth.uid())
    else array_append(vistos, auth.uid()) end
  where id = mid;
end $$;
revoke all on function public.muro_toggle_visto(uuid) from public;
grant execute on function public.muro_toggle_visto(uuid) to authenticated;

-- Realtime: el muro se actualiza en vivo para todos.
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='muro_mensajes') then
    alter publication supabase_realtime add table muro_mensajes;
  end if;
end $$;

-- (Opcional) limpieza de lo viejo. No es necesaria —la app solo muestra HOY—,
-- pero mantiene la tabla chica. Puedes correrla a mano o en el cron matutino:
-- delete from muro_mensajes where creado_en < now() - interval '2 days';
