-- ============================================================
--  db/kits.sql — DESPERTAR LOS KITS
--
--  `kits` y `kit_equipos` existen desde el schema original (líneas 197-211)
--  con su comentario y todo: «Al publicar desde rodaje se vincula el kit
--  completo en un clic». Nunca se escribió ese clic. Dos tablas, dos
--  políticas de lectura, cero filas y cero líneas de código que las
--  nombren: el inventario lleva un año entregándose pieza por pieza al
--  lado de un modelo que ya decía cómo hacerlo de una vez.
--
--  Esto no crea el modelo, lo termina:
--    · lo que faltaba para EDITAR (update/delete no tenían política — se
--      podía crear un kit y no corregirlo nunca)
--    · `equipo_prestamos.kit_id`, para que la salida recuerde que fue un
--      kit y la vuelta pueda decir «faltan 2 de 5»
--    · fechas y orden, que un kit sin `creado_en` no se puede listar por
--      lo último que se armó
--
--  Idempotente y sin transacción (pgBouncer). Al final verifica.
-- ============================================================

-- ── 1. Las tablas, por si el schema base no se corrió entero ──
create table if not exists kits (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  uso         text,
  descripcion text
);
create table if not exists kit_equipos (
  id              uuid primary key default gen_random_uuid(),
  kit_id          uuid not null references kits(id) on delete cascade,
  equipamiento_id uuid not null references equipamiento(id) on delete cascade,
  rol             text default 'equipo',
  unique (kit_id, equipamiento_id)
);

-- ── 2. Lo que le faltaba a `kits` ──
alter table kits add column if not exists creado_en timestamptz default now();
alter table kits add column if not exists creado_por uuid references perfiles(id);
-- Un kit que ya no se arma no se borra (sus préstamos lo nombran): se retira.
alter table kits add column if not exists retirado_en timestamptz;

-- ── 3. El préstamo recuerda de qué kit salió ──
--    `on delete set null`: borrar un kit no puede llevarse por delante el
--    historial de una salida a rodaje. Se pierde la etiqueta, no el hecho.
alter table equipo_prestamos add column if not exists kit_id uuid
  references kits(id) on delete set null;

create index if not exists idx_kit_equipos_kit on kit_equipos(kit_id);
create index if not exists idx_kit_equipos_eq  on kit_equipos(equipamiento_id);
create index if not exists idx_prestamos_kit   on equipo_prestamos(kit_id);
-- La consulta que más se hace: qué hay fuera ahora mismo.
create index if not exists idx_prestamos_abiertos on equipo_prestamos(hasta)
  where hasta is null;

-- ── 4. RLS — faltaba TODO lo que no es leer o insertar ──
/* Las políticas originales dejaban crear un kit y leerlo, nada más.
   Un kit mal armado era para siempre: no se podía quitar una pieza ni
   corregir el nombre. Eso no se ve como un error —el botón simplemente
   no hace nada y la fila vuelve al recargar—, que es la peor forma. */
alter table kits        enable row level security;
alter table kit_equipos enable row level security;

drop policy if exists "leer_kit"    on kits;
drop policy if exists "crear_kit"   on kits;
drop policy if exists "editar_kit"  on kits;
drop policy if exists "borrar_kit"  on kits;
create policy "leer_kit"   on kits for select to authenticated using (true);
create policy "crear_kit"  on kits for insert to authenticated with check (true);
create policy "editar_kit" on kits for update to authenticated using (true) with check (true);
create policy "borrar_kit" on kits for delete to authenticated using (true);

drop policy if exists "leer_ke"   on kit_equipos;
drop policy if exists "crear_ke"  on kit_equipos;
drop policy if exists "editar_ke" on kit_equipos;
drop policy if exists "borrar_ke" on kit_equipos;
create policy "leer_ke"   on kit_equipos for select to authenticated using (true);
create policy "crear_ke"  on kit_equipos for insert to authenticated with check (true);
create policy "editar_ke" on kit_equipos for update to authenticated using (true) with check (true);
create policy "borrar_ke" on kit_equipos for delete to authenticated using (true);

-- ── 5. VERIFICACIÓN — si algo de arriba no corrió, aquí se ve ──
select 'kits.creado_en'            as que, count(*) as ok from information_schema.columns
 where table_name = 'kits' and column_name = 'creado_en'
union all
select 'kits.retirado_en',         count(*) from information_schema.columns
 where table_name = 'kits' and column_name = 'retirado_en'
union all
select 'equipo_prestamos.kit_id',  count(*) from information_schema.columns
 where table_name = 'equipo_prestamos' and column_name = 'kit_id'
union all
select 'políticas de kits (4)',    count(*) from pg_policies
 where tablename = 'kits'
union all
select 'políticas de kit_equipos (4)', count(*) from pg_policies
 where tablename = 'kit_equipos';
