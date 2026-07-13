-- ============================================================
-- "Ocultar de mi feed": cada usuario puede quitar de SU feed los
-- casos resueltos que ya no quiere ver (no los borra; siguen en el
-- tablero y la búsqueda). Correr una vez en Supabase → SQL Editor.
-- ============================================================

create table if not exists feed_ocultos (
  usuario_id     uuid not null references perfiles(id)      on delete cascade,
  publicacion_id uuid not null references publicaciones(id) on delete cascade,
  creado_en      timestamptz default now(),
  primary key (usuario_id, publicacion_id)
);

alter table feed_ocultos enable row level security;

-- Cada quien ve solo su propia lista de ocultos
drop policy if exists "leer_focul" on feed_ocultos;
create policy "leer_focul" on feed_ocultos
  for select to authenticated using (usuario_id = auth.uid());

-- Cada quien solo puede ocultar en su propio feed
drop policy if exists "crear_focul" on feed_ocultos;
create policy "crear_focul" on feed_ocultos
  for insert to authenticated with check (usuario_id = auth.uid());

-- Borrado permisivo: al reabrir un caso, la app limpia el oculto de
-- todos para que reaparezca en sus feeds.
drop policy if exists "borrar_focul" on feed_ocultos;
create policy "borrar_focul" on feed_ocultos
  for delete to authenticated using (true);
