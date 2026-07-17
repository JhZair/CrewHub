-- ============================================================
--  Plantillas de cronograma — «las coberturas son casi la misma»
--
--  OJO: estas dos tablas YA figuran en db/schema.sql, y no las usa ni una
--  línea de código. Se diseñaron y nunca se construyeron. Como ese archivo
--  está desactualizado (le faltan columnas de personas y la tabla entera de
--  credenciales), no se puede saber desde el repo si existen en la base.
--  Por eso todo va con `if not exists`: si están, esto no hace nada; si no,
--  las crea. Correrlo dos veces es seguro.
--
--  La idea, que ya estaba bien pensada: la plantilla NO guarda fechas, guarda
--  DESPLAZAMIENTOS. La primera actividad es el día 0 y el resto se cuenta
--  desde ahí. Al aplicarla eliges una fecha y el cronograma se arma solo.
--  Es lo mismo que exige el cronograma de un fondo —«corre su inicio hasta la
--  fecha que llega el dinero»—, así que el día que se haga aquello, el motor
--  ya está.
--
--  Y las plantillas no se teclean: se guardan desde un cronograma que ya
--  funcionó. P-086 «15 Emi» tiene siete actividades con sus etapas, sus
--  responsables y sus días — eso ES la plantilla de cobertura, y ya está
--  escrita. Pedirle a alguien que la vuelva a escribir con los offsets
--  calculados de cabeza es pedirle que se equivoque.
-- ============================================================

create table if not exists plantillas_cronograma (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,        -- "Cobertura — un día de rodaje"
  tipo_proyecto text,                 -- cobertura | documental | animacion…
  descripcion   text,
  creado_en     timestamptz default now()
);

create table if not exists plantilla_actividades (
  id            uuid primary key default gen_random_uuid(),
  plantilla_id  uuid not null references plantillas_cronograma(id) on delete cascade,
  orden         int not null default 0,
  nombre        text not null,
  etapa         text,
  offset_dias   int default 0,        -- días desde la primera actividad (día 0)
  duracion_dias int default 0,        -- 0 = un solo día
  rol_sugerido  text
);
create index if not exists plant_act_plant on plantilla_actividades (plantilla_id);

-- Columnas que el esquema viejo no tenía y el guardado sí necesita
alter table plantilla_actividades add column if not exists clase text default 'trabajo';
alter table plantilla_actividades add column if not exists dias_anticipacion int default 7;
/* El responsable se guarda por ID a propósito, y no por «rol sugerido»: en un
   equipo de seis, quien hace el sonido es la misma persona. Guardar el rol y
   volver a elegirla cada vez sería fingir que hay entre quién elegir.
   Si algún día el equipo crece, `rol_sugerido` ya está ahí para eso. */
alter table plantilla_actividades add column if not exists responsable uuid references perfiles(id);

alter table plantillas_cronograma  enable row level security;
alter table plantilla_actividades  enable row level security;

drop policy if exists "leer_pc"   on plantillas_cronograma;
drop policy if exists "crear_pc"  on plantillas_cronograma;
drop policy if exists "editar_pc" on plantillas_cronograma;
drop policy if exists "borrar_pc" on plantillas_cronograma;
create policy "leer_pc"   on plantillas_cronograma for select to authenticated using (true);
create policy "crear_pc"  on plantillas_cronograma for insert to authenticated with check (true);
create policy "editar_pc" on plantillas_cronograma for update to authenticated using (true);
create policy "borrar_pc" on plantillas_cronograma for delete to authenticated using (true);

drop policy if exists "leer_pa"   on plantilla_actividades;
drop policy if exists "crear_pa"  on plantilla_actividades;
drop policy if exists "editar_pa" on plantilla_actividades;
drop policy if exists "borrar_pa" on plantilla_actividades;
create policy "leer_pa"   on plantilla_actividades for select to authenticated using (true);
create policy "crear_pa"  on plantilla_actividades for insert to authenticated with check (true);
create policy "editar_pa" on plantilla_actividades for update to authenticated using (true);
create policy "borrar_pa" on plantilla_actividades for delete to authenticated using (true);

comment on table plantillas_cronograma is
  'Cronogramas que se repiten. No guardan fechas: guardan desplazamientos desde la primera actividad. Se crean guardando un cronograma que ya funcionó, no tecleándolas.';
comment on column plantilla_actividades.offset_dias is
  'Días desde la primera actividad de la plantilla (que es el día 0).';

-- 👀 Qué hay
select p.nombre, p.tipo_proyecto, count(a.id) as actividades
  from plantillas_cronograma p
  left join plantilla_actividades a on a.plantilla_id = p.id
 group by p.id, p.nombre, p.tipo_proyecto
 order by p.nombre;
