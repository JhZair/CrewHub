-- ============================================================
-- REPOSITORIO — la cola infinita de una entidad.
--
-- Una persona tiene datos estructurados (nombre, DNI, región) que caben en un
-- formulario, y una cola que NO termina nunca: obras, investigaciones, libros,
-- prensa, premios, redes, certificados, notas. Eso no es un campo más: es una
-- colección abierta, y cada vez que se intentó meter en el formulario nació
-- otra columna `*_url` (hay ~22 repartidas en 11 tablas).
--
-- Esta tabla es la GENERALIZACIÓN de `persona_cv`, que ya probó la forma:
--   entidad + clasificador + url + fecha + unicidad.
-- Solo que sirve para cualquier entidad y cualquier tipo de objeto.
--
-- NO guarda archivos: guarda OBJETOS. El archivo vive en Drive (doctrina de la
-- casa), aquí vive lo que se sabe de él. Por eso `url` puede ser null: una nota
-- o una obra registrada no siempre tienen link.
--
-- Hereda gratis dos cosas genéricas que ya existen:
--   · `link_verificaciones` (entidad_tipo, entidad_id, campo) → miniatura y
--     veredicto ✓/✗ del link, para que el repositorio no se vuelva un
--     cementerio de enlaces muertos.
--   · `actividad` (entidad_tipo, entidad_id) → bitácora de quién puso qué.
--
-- Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

create table if not exists objetos (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,             -- persona | empresa | proyecto | postulacion | convocatoria…
  entidad_id   uuid not null,
  tipo         text not null,             -- cv | obra | investigacion | publicacion | prensa | premio…
  titulo       text not null,
  url          text,                      -- null a propósito: una nota no tiene link
  -- Cuándo OCURRIÓ (se publicó la obra, se ganó el premio), no cuándo se cargó.
  fecha        date,
  notas        text,
  -- Lo específico de cada tipo sin inventar columnas: ISBN, festival, rol…
  datos        jsonb not null default '{}',
  -- Última vez que se refrescó. El CV lo usa para el aviso de «lleva un año».
  actualizado  date,
  creado_por   uuid references perfiles(id),
  creado_en    timestamptz not null default now()
);

create index if not exists idx_objetos_entidad on objetos(entidad_tipo, entidad_id, tipo);

-- Un CV por enfoque: se actualiza, no se duplica. Es la regla que traía
-- `persona_cv` (unique persona_id, enfoque) y que no se puede perder.
create unique index if not exists idx_objetos_cv_unico
  on objetos(entidad_tipo, entidad_id, titulo) where tipo = 'cv';

alter table objetos enable row level security;
drop policy if exists "leer_objetos" on objetos;
create policy "leer_objetos" on objetos for select to authenticated using (true);
drop policy if exists "crear_objetos" on objetos;
create policy "crear_objetos" on objetos for insert to authenticated with check (creado_por = auth.uid());
drop policy if exists "editar_objetos" on objetos;
create policy "editar_objetos" on objetos for update to authenticated using (true) with check (true);
drop policy if exists "borrar_objetos" on objetos;
create policy "borrar_objetos" on objetos for delete to authenticated using (true);

-- ── Migrar los CVs existentes ──
-- `persona_cv` NO se borra: si algo sale mal, el dato original sigue ahí. El
-- drop va comentado, como se hizo con `personas.cv_url`.
-- El guard es POR PERSONA, no por (persona, título). Con el guard por título,
-- re-correr esto después de días de uso resucitaría un CV borrado desde la
-- ficha, y duplicaría los que cambiaron de enfoque (el título viejo no
-- coincide, así que se volvía a insertar). Con el guard por persona, quien ya
-- tiene su repositorio no se toca nunca más.
insert into objetos (entidad_tipo, entidad_id, tipo, titulo, url, actualizado, creado_en)
select 'persona', c.persona_id, 'cv', c.enfoque, c.url, c.actualizado, c.creado_en
from persona_cv c
where not exists (
  select 1 from objetos o
  where o.entidad_tipo = 'persona' and o.entidad_id = c.persona_id and o.tipo = 'cv'
);

-- Cuando el repositorio lleve semanas funcionando:
-- drop table persona_cv;

-- ------------------------------------------------------------
-- VÍNCULOS DE UN OBJETO — un dueño, muchas relaciones.
--
-- El «Libro Khipukamaq» ES de Jesús (ahí vive y ahí se edita) y ADEMÁS es la
-- base del proyecto «Los Khipus». Duplicarlo en el proyecto sería tener dos
-- libros; moverlo sería quitárselo a su autor. Es el mismo patrón que un caso:
-- un autor y muchos vínculos.
--
-- Con esto, la ficha del proyecto muestra los objetos que le apuntan, y una
-- postulación puede juntar los del proyecto más los de su equipo.
-- ------------------------------------------------------------
create table if not exists objeto_vinculos (
  id           uuid primary key default gen_random_uuid(),
  objeto_id    uuid not null references objetos(id) on delete cascade,
  entidad_tipo text not null,
  entidad_id   uuid not null,
  creado_en    timestamptz not null default now(),
  unique (objeto_id, entidad_tipo, entidad_id)
);
create index if not exists idx_objvinc_entidad on objeto_vinculos(entidad_tipo, entidad_id);

alter table objeto_vinculos enable row level security;
drop policy if exists "leer_objvinc" on objeto_vinculos;
create policy "leer_objvinc" on objeto_vinculos for select to authenticated using (true);
drop policy if exists "crear_objvinc" on objeto_vinculos;
create policy "crear_objvinc" on objeto_vinculos for insert to authenticated with check (true);
drop policy if exists "borrar_objvinc" on objeto_vinculos;
create policy "borrar_objvinc" on objeto_vinculos for delete to authenticated using (true);

-- Realtime: el repositorio se ve en vivo como el resto de la ficha.
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='objetos') then
    alter publication supabase_realtime add table objetos;
  end if;
end $$;
