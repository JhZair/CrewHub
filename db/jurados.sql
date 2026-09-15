-- ============================================================
--  db/jurados.sql
--
--  QUIÉN JUZGA CADA CONVOCATORIA.
--
--  DAFO publica, junto a las bases de cada concurso, un PDF con la
--  mesa que lo va a decidir: cinco personas con su nombre, su
--  especialidad y un párrafo de trayectoria. Ese documento se lee una
--  vez, se cierra, y a los dos años nadie recuerda quién estaba.
--
--  ── POR QUÉ ES UNA TABLA Y NO UNA NOTA EN EL MURO ──
--  Porque lo que se quiere saber no cabe en una nota suelta:
--  «¿este jurado ya nos leyó antes, y cómo nos fue?». La misma persona
--  vuelve: juzga varias ediciones y varios concursos. Esa pregunta
--  solo se puede contestar si cada mesa queda guardada como FILAS que
--  se cruzan entre años — exactamente la misma razón por la que la
--  competencia es una tabla y no un comentario.
--
--  Y hay una lectura que se usa ANTES de postular, no después: si en
--  la mesa hay un diseñador de sonido, la propuesta sonora del
--  proyecto la va a leer alguien con criterio, y eso cambia cómo se
--  escribe esa parte. Por eso la ESPECIALIDAD es una columna y no un
--  adorno: es el criterio con el que DAFO compone la mesa.
--
--  ── PERSONAS DE VERDAD, Y POR ESO CON MÁS CUIDADO ──
--  Esto son personas nombradas en un documento público de un proceso
--  público. Se guarda LO QUE ESE DOCUMENTO DICE y de dónde salió, y
--  nada más: no se busca su RUC, ni sus redes, ni su correo, ni se
--  cruza con ninguna otra fuente. Y no se dan de alta en `personas`,
--  igual que los competidores no se dan de alta en `empresas`: una
--  ficha del sistema es algo vivo que alguien mantiene; esto es una
--  cita de un papel con su fecha.
--
--  ⚠ EL PAÍS SE GUARDA SOLO SI EL PAPEL LO DICE. En 2022 va en una
--  columna aparte y en 2023 entre paréntesis detrás de la
--  especialidad; en 2024, 2025 y 2026 no está. La biografía de 2026
--  dice «Cineasta panameña» y deducir «Panamá» de ahí sería inventar
--  un dato con aspecto de leído. Lo que no dice el papel queda nulo.
--
--  Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

create table if not exists convocatoria_jurado (
  id              uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references convocatorias(id) on delete cascade,

  nombre          text not null,
  -- «Directora documentalista», «Técnico especialista de la
  -- cinematografía», «Especialista de la cultura de destacada
  -- trayectoria». Es el asiento que ocupa en la mesa.
  rol             text,
  -- Solo si el documento lo escribe. Nunca deducido de la biografía.
  pais            text,
  -- El párrafo de trayectoria, tal cual.
  sumilla         text,

  -- ⚠ Lo que el lector no pudo asegurar, y el texto tal como venía. Un
  -- PDF maquetado como cartel no es un dato limpio, y fingir que sí lo
  -- es se paga en la primera duda: con esto cualquiera comprueba una
  -- fila rara sin volver a abrir el PDF.
  avisos          text[] not null default '{}',
  crudo           text,
  fuente          text,

  creado_en       timestamptz not null default now(),
  creado_por      uuid references perfiles(id),
  visto_en        timestamptz not null default now()
);

-- Una persona no puede estar dos veces en la misma mesa. Sin RUC ni
-- nada parecido, lo único que hay es el nombre: se compara en
-- minúsculas para que volver a subir el mismo PDF actualice en vez de
-- duplicar.
create unique index if not exists idx_jurado_nombre
  on convocatoria_jurado (convocatoria_id, lower(nombre));

create index if not exists idx_jurado_conv
  on convocatoria_jurado (convocatoria_id);

alter table convocatoria_jurado enable row level security;

drop policy if exists jurado_lee on convocatoria_jurado;
create policy jurado_lee on convocatoria_jurado
  for select to authenticated using (true);

drop policy if exists jurado_escribe on convocatoria_jurado;
create policy jurado_escribe on convocatoria_jurado
  for all to authenticated using (true) with check (true);

comment on table convocatoria_jurado is
  'La mesa que juzga una convocatoria, leída del PDF de sumillas que publica DAFO. Lo que dice ese documento y nada más: no son personas del sistema y no se enriquecen con ninguna otra fuente.';


-- ── LA PUERTA CATORCE DE LOS COMENTARIOS ──
-- Lo que averigüemos de un jurado —qué premió, qué le interesa, dónde
-- coincidimos— va aquí, con su autor y su fecha, y NO mezclado con lo
-- que dice la resolución. Misma tabla `comentarios` que los casos, los
-- objetos, los préstamos, la rendición y los competidores.
alter table comentarios add column if not exists jurado_id uuid
  references convocatoria_jurado(id) on delete cascade;
create index if not exists idx_com_jurado on comentarios (jurado_id, creado_en);

-- Exactamente UNO de los catorce dueños. Se reconstruye entero: este
-- constraint es de toda la tabla, no de esta migración.
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk check (
    (publicacion_id is not null)::int
  + (objeto_id is not null)::int
  + (prestamo_id is not null)::int
  + (equipamiento_id is not null)::int
  + (postulacion_id is not null)::int
  + (movimiento_caja_id is not null)::int
  + (comprobante_id is not null)::int
  + (estado_cuenta_id is not null)::int
  + (rhe_id is not null)::int
  + (gasto_dj_id is not null)::int
  + (movimiento_banco_id is not null)::int
  + (obligacion_periodo_id is not null)::int
  + (competencia_id is not null)::int
  + (jurado_id is not null)::int
  = 1
);

drop policy if exists "crear_com" on comentarios;
create policy "crear_com" on comentarios
  for insert to authenticated with check (autor_id = auth.uid());

-- ── Y LOS DOS GUARDIANES DE `reacciones` ──
-- La columna sola no basta: hay un check de dueño y un unique que
-- enumeran las columnas una por una. Añadir la columna y olvidarlos
-- deja el 👀 contestando «violates check constraint» con el dato ya
-- guardable — pasó con `competencia_id` y está anotado ahí.
alter table reacciones add column if not exists jurado_id uuid
  references convocatoria_jurado(id) on delete cascade;
create index if not exists idx_rx_jurado on reacciones (jurado_id);

alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null
  or postulacion_id is not null or movimiento_caja_id is not null
  or comprobante_id is not null or estado_cuenta_id is not null
  or rhe_id is not null or gasto_dj_id is not null
  or movimiento_banco_id is not null or obligacion_periodo_id is not null
  or competencia_id is not null or jurado_id is not null
);

-- Un unique que no mira la columna nueva trata a DOS jurados distintos
-- como el mismo dueño —los dos con todas las demás en null— y el
-- segundo 👀 muere con un error de duplicado que no significa nada en
-- pantalla.
drop index if exists uq_reacciones_dueno;
create unique index uq_reacciones_dueno on reacciones (
  coalesce(publicacion_id::text, ''),
  coalesce(comentario_id::text, ''),
  coalesce(postulacion_id::text, ''),
  coalesce(movimiento_caja_id::text, ''),
  coalesce(comprobante_id::text, ''),
  coalesce(estado_cuenta_id::text, ''),
  coalesce(rhe_id::text, ''),
  coalesce(gasto_dj_id::text, ''),
  coalesce(movimiento_banco_id::text, ''),
  coalesce(obligacion_periodo_id::text, ''),
  coalesce(competencia_id::text, ''),
  coalesce(jurado_id::text, ''),
  usuario_id, emoji
);

-- Para que un «@Katy» escrito en la ficha de un jurado le LLEGUE.
alter table notificaciones add column if not exists jurado_id uuid
  references convocatoria_jurado(id) on delete cascade;
create index if not exists idx_notif_jurado on notificaciones (jurado_id)
  where jurado_id is not null;

-- Si alguno sale en 0, algo no se aplicó.
select
  (select count(*) from information_schema.tables
     where table_name='convocatoria_jurado') as tabla,
  (select count(*) from information_schema.columns
     where table_name='comentarios' and column_name='jurado_id') as com,
  (select count(*) from pg_constraint
     where conname='reacciones_dueno_chk'
       and pg_get_constraintdef(oid) like '%jurado_id%') as rx_chk,
  (select count(*) from pg_indexes
     where indexname='uq_reacciones_dueno' and indexdef like '%jurado_id%') as rx_uq,
  (select count(*) from information_schema.columns
     where table_name='notificaciones' and column_name='jurado_id') as notif;
