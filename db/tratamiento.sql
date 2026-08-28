-- ============================================================
--  db/tratamiento.sql — VARIOS TRATAMIENTOS POR PELÍCULA
--
--  ── POR QUÉ EL GUION SE QUEDÓ A MEDIAS ──
--  Las cuatro tablas de db/guion.sql cuelgan de `proyecto_id`, y la plantilla
--  es una columna de `proyectos`. O sea: UN PROYECTO, UN GUION. En cuanto hizo
--  falta un segundo tratamiento —el que se presentó a DAFO frente al que se
--  está escribiendo ahora— no había dónde ponerlo. No faltaba trabajo:
--  faltaba una pieza, y esta es.
--
--  ── LA PIEZA: LA CABECERA DEL DOCUMENTO ──
--  Un `tratamiento` con su nombre, su versión, su estado y su nivel. Las
--  secuencias, los actos, los hilos y los beats pasan a colgar de él. A partir
--  de aquí, una película puede tener los tratamientos que haga falta y cada uno
--  es un documento entero e independiente.
--
--  ── TRES NIVELES, NO DOS DOCUMENTOS ──
--     sinopsis  →  secuenciado  →  guion
--  El documental para en el secuenciado; la ficción y la animación siguen. Y
--  como el guion se escribe SOBRE el secuenciado —la escena cuelga de la
--  secuencia—, no son dos cosas distintas sino hasta dónde ha llegado la misma.
--  `nivel` guarda eso, y por eso las escenas (la vuelta que falta) van a poder
--  entrar sin volver a mover nada.
--
--  ── DE QUIÉN ES: DEL PROYECTO, CON MARCA DE FONDO ──
--  El tratamiento es de la PELÍCULA. `postulacion_id` es opcional y dice a qué
--  fondo se presentó ese documento concreto — así la pestaña Audiovisual de
--  PO-001 puede enseñar «el tratamiento que vio el jurado» sin que el texto
--  viva en dos sitios. Si el tratamiento colgara del fondo, la misma película
--  con tres fondos tendría tres copias del mismo texto divergiendo.
--  ⚠ Un fondo SIEMPRE cuelga de un proyecto, así que no se pierde nada. Que el
--  fondo marcado sea EL de ese proyecto NO lo puede comprobar un `check` —en
--  Postgres un check no puede consultar otra tabla— así que lo valida la
--  acción, igual que `traerRepartoDelProyecto`. Se dice aquí para que nadie
--  dé por hecha una guarda que la base no tiene.
--
--  ── LO ESCRITO ESTÁ EN DRIVE, NO AQUÍ ──
--  Los tratamientos reales de esta productora viven en Drive. Por eso
--  `tratamiento.url`: un documento puede existir en el sistema siendo solo su
--  enlace —«2ª entrega DAFO · v3 · ↗ Drive»— y trocearse en secuencias más
--  tarde, o nunca. Sin eso, registrar un tratamiento exigiría transcribirlo
--  primero, que es la forma segura de que nadie registre ninguno.
--
--  ⚠ AUN ASÍ, ESTA MIGRACIÓN MUEVE TEXTO. Lo poco o mucho que haya escrito
--  DENTRO del sistema —las secuencias de ROBOTRASH, por ejemplo— se reasigna a
--  un tratamiento sembrado por proyecto. No borra ni reescribe una palabra, y
--  `proyecto_id` se queda en las cuatro tablas como red. Verifica al final que
--  no quede nada huérfano.
--
--  Correr DESPUÉS de db/guion.sql y db/guion-beats.sql.
--  Idempotente y sin transacción (pgBouncer).
-- ============================================================

-- ── 1. LA CABECERA ──
create table if not exists tratamiento (
  id             uuid primary key default gen_random_uuid(),
  proyecto_id    uuid not null references proyectos(id) on delete cascade,
  /* A qué fondo se presentó ESTE documento. `set null` y no `cascade`: borrar
     la postulación no puede llevarse por delante el tratamiento — el texto es
     de la película y le sobrevive al concurso. */
  postulacion_id uuid references postulaciones(id) on delete set null,

  nombre         text not null default 'Tratamiento',
  /* La versión, como TEXTO: «v3», «2ª entrega DAFO», «post-rodaje». Un entero
     obligaría a inventar un número donde la gente escribe una etiqueta, y a
     los tres documentos alguien pondría «2.5». */
  version        text,

  /* sinopsis | secuenciado | guion — hasta dónde ha llegado.
     Arranca en `secuenciado` porque es lo que hace la pantalla que ya existe:
     actos y secuencias con su texto. `sinopsis` es para el documento corto que
     todavía no está dividido; `guion` se activará cuando lleguen las escenas. */
  nivel          text not null default 'secuenciado',

  /* borrador | presentado | descartado
     `presentado` es un hecho con fecha —se entregó a alguien— y por eso no se
     deduce de tener `postulacion_id`: se puede preparar un tratamiento PARA un
     fondo y no llegar a mandarlo. */
  estado         text not null default 'borrador',
  presentado_en  date,

  /* Contra qué modelo estructural se escribe. Estaba en `proyectos` y sube
     aquí: dos tratamientos de la misma película pueden usar plantillas
     distintas —es justo lo que se hace al reestructurar—, y con la columna en
     el proyecto cambiarla en uno la cambiaba en todos. */
  plantilla      text,

  /* El que manda hoy. Uno solo por proyecto, forzado por el índice de abajo:
     dos vigentes es la pregunta «¿cuál leo?» sin respuesta. */
  vigente        boolean not null default false,

  /* ── DONDE VIVE EL DOCUMENTO DE VERDAD ──
     Los tratamientos escritos están en Drive, en Word, en PDF. Sin esta
     columna, registrarlos aquí obligaría a trocearlos en secuencias ANTES de
     poder siquiera nombrarlos — y eso significa que nadie los registra, y que
     la lista de tratamientos de la película sigue estando en la cabeza de
     alguien.
     Con `url`, un tratamiento puede existir el primer día siendo solo su
     enlace: «2ª entrega DAFO · v3 · ↗ Drive». Escribir las secuencias aquí
     dentro es lo que se hace DESPUÉS, y con el que toque — no con los cinco. */
  url            text,

  nota           text,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references perfiles(id),
  editado_en     timestamptz
);

/* Vocabularios cerrados en la base y no solo en el formulario: una pantalla
   nueva que escriba «Secuenciado» con mayúscula metería un nivel que ninguna
   vista reconocería, y el documento se pintaría como si estuviera vacío. */
alter table tratamiento drop constraint if exists tratamiento_nivel;
alter table tratamiento add constraint tratamiento_nivel
  check (nivel in ('sinopsis','secuenciado','guion'));

alter table tratamiento drop constraint if exists tratamiento_estado;
alter table tratamiento add constraint tratamiento_estado
  check (estado in ('borrador','presentado','descartado'));

/* Un solo vigente por película. Índice PARCIAL —solo donde `vigente`— porque
   los no vigentes pueden ser los que haga falta.
   ⚠ Al ser parcial NO sirve para `on conflict` (42P10, la lección de
   `postulacion_reparto_persona_unica`): la acción apaga los otros y enciende
   este en dos pasos, no con un upsert. */
create unique index if not exists tratamiento_un_vigente
  on tratamiento(proyecto_id) where vigente;

create index if not exists idx_tratamiento_proy on tratamiento(proyecto_id, creado_en desc);
create index if not exists idx_tratamiento_post on tratamiento(postulacion_id);

-- ── 2. LAS CUATRO TABLAS PASAN A COLGAR DEL TRATAMIENTO ──
--  Se AÑADE la columna, no se reemplaza todavía: `proyecto_id` se queda por
--  ahora. Quitarla en la misma migración dejaría sin red la comprobación de
--  que todo se mudó bien, y el precio de mantenerla es una columna redundante
--  en cuatro tablas.
alter table guion_actos      add column if not exists tratamiento_id uuid references tratamiento(id) on delete cascade;
alter table guion_secuencias add column if not exists tratamiento_id uuid references tratamiento(id) on delete cascade;
alter table guion_hilos      add column if not exists tratamiento_id uuid references tratamiento(id) on delete cascade;
alter table guion_beats      add column if not exists tratamiento_id uuid references tratamiento(id) on delete cascade;

-- ── 3. SEMBRAR UN TRATAMIENTO POR CADA PROYECTO QUE YA TENGA ALGO ESCRITO ──
--  ⚠ Solo los que tienen contenido. Crear uno vacío en los 40 proyectos
--  llenaría las listas de documentos que nadie escribió y que hay que borrar
--  a mano.
--  Se llama «Tratamiento» y toma la plantilla que el proyecto tuviera. Queda
--  VIGENTE porque es el único que hay: lo que estaba escrito es, por
--  definición, lo que manda hoy.
--  `where not exists`: correr esto dos veces no puede crear un segundo.
insert into tratamiento (proyecto_id, nombre, nivel, estado, plantilla, vigente, nota)
select p.id, 'Tratamiento', 'secuenciado', 'borrador', p.guion_plantilla, true,
       'Creado al separar el guion en tratamientos: recoge todo lo que estaba escrito en el proyecto.'
  from proyectos p
 where (
        exists (select 1 from guion_secuencias s where s.proyecto_id = p.id)
     or exists (select 1 from guion_actos      a where a.proyecto_id = p.id)
     or exists (select 1 from guion_hilos      h where h.proyecto_id = p.id)
     or exists (select 1 from guion_beats      b where b.proyecto_id = p.id)
       )
   and not exists (select 1 from tratamiento t where t.proyecto_id = p.id);

-- ── 4. MUDAR LO ESCRITO ──
--  Cada fila al tratamiento vigente de SU proyecto. `where tratamiento_id is
--  null` para que re-correr esto no toque lo que ya se movió (ni pise lo que
--  alguien haya reasignado a mano después).
update guion_actos a
   set tratamiento_id = t.id
  from tratamiento t
 where t.proyecto_id = a.proyecto_id and t.vigente and a.tratamiento_id is null;

update guion_secuencias s
   set tratamiento_id = t.id
  from tratamiento t
 where t.proyecto_id = s.proyecto_id and t.vigente and s.tratamiento_id is null;

update guion_hilos h
   set tratamiento_id = t.id
  from tratamiento t
 where t.proyecto_id = h.proyecto_id and t.vigente and h.tratamiento_id is null;

update guion_beats b
   set tratamiento_id = t.id
  from tratamiento t
 where t.proyecto_id = b.proyecto_id and t.vigente and b.tratamiento_id is null;

-- ── 5. LOS ÍNDICES NUEVOS ──
create index if not exists idx_guion_actos_trat on guion_actos(tratamiento_id, orden);
create index if not exists idx_guion_secs_trat  on guion_secuencias(tratamiento_id, orden);
create index if not exists idx_guion_hilos_trat on guion_hilos(tratamiento_id, orden);
create index if not exists idx_guion_beats_trat on guion_beats(tratamiento_id, orden);

/* El índice único de los beats sembrados pasa a ser por TRATAMIENTO. Con el
   viejo (por proyecto), duplicar un tratamiento fallaría: los beats copiados
   traen la misma `clave` y chocarían con los del original. */
drop index if exists idx_guion_beats_unico;
create unique index if not exists idx_guion_beats_unico_trat
  on guion_beats(tratamiento_id, clave) where clave is not null;

-- ── 6. RLS ──
alter table tratamiento enable row level security;
drop policy if exists tr_sel on tratamiento;
drop policy if exists tr_ins on tratamiento;
drop policy if exists tr_upd on tratamiento;
drop policy if exists tr_del on tratamiento;
create policy tr_sel on tratamiento for select to authenticated using (true);
create policy tr_ins on tratamiento for insert to authenticated with check (true);
create policy tr_upd on tratamiento for update to authenticated using (true) with check (true);
create policy tr_del on tratamiento for delete to authenticated using (true);

/* ── QUE SE VEA EN CALIENTE ──
   Sin publicar la tabla, la suscripción se abre, dice SUBSCRIBED y no emite
   nada: no da error, simplemente no llega nunca un evento. */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'tratamiento'
  ) then
    alter publication supabase_realtime add table public.tratamiento;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — ⚠ ESTA MIGRACIÓN MUEVE TEXTO ESCRITO. LEE LOS NÚMEROS.
-- ══════════════════════════════════════════════════════════════════════════
--  `huerfanas` es el que importa: cuántas filas se quedaron SIN tratamiento.
--  Tiene que ser 0 en las cuatro. Si no lo es, hay contenido de un proyecto
--  que no recibió cabecera —lo que solo puede pasar si alguien creó un
--  tratamiento a mano y lo dejó no vigente antes de correr esto—.
--  NADA se ha borrado: `proyecto_id` sigue en las cuatro tablas, así que
--  cualquier fila huérfana se puede reasignar sin haber perdido una palabra.
select
  (select count(*) from tratamiento)                                        as tratamientos,
  (select count(*) from tratamiento where vigente)                          as vigentes,
  (select count(*) from guion_secuencias)                                   as secuencias,
  (select count(*) from guion_secuencias where tratamiento_id is null)      as secs_huerfanas,
  (select count(*) from guion_actos      where tratamiento_id is null)      as actos_huerfanos,
  (select count(*) from guion_hilos      where tratamiento_id is null)      as hilos_huerfanos,
  (select count(*) from guion_beats      where tratamiento_id is null)      as beats_huerfanos,
  /* Cuánto texto hay, para poder compararlo con el de después. Si este número
     cambia, algo se perdió — y no debería cambiar: esta migración no toca
     `texto`, solo añade una columna. */
  (select coalesce(sum(length(coalesce(texto, ''))), 0) from guion_secuencias) as caracteres_escritos;
-- secs_huerfanas · actos_huerfanos · hilos_huerfanos · beats_huerfanos = 0
-- tratamientos = un proyecto por cada uno que tuviera algo escrito
-- vigentes = tratamientos (cada proyecto arranca con el suyo vigente)
