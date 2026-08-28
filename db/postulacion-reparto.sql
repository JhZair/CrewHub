-- ============================================================
--  db/postulacion-reparto.sql — EL EQUIPO ARTÍSTICO DEL FONDO
--
--  Quién SALE en la película. No quién la hace: eso es `postulacion_equipo`
--  (la pestaña 👥 Equipo) y son dos listas que no se cruzan —el sonidista no
--  es un personaje y la protagonista no cobra por rubro presupuestal—.
--
--  ── POR QUÉ NO VALE LA LISTA DEL PROYECTO ──
--  `proyecto_actores` ya guarda a quién retrata la obra, con su ficha larga
--  (qué quiere, qué necesita, el arte). Pero esa lista es del PROYECTO, que
--  vive más que el fondo y no sabe de convocatorias.
--  El fondo necesita algo que el proyecto no puede contestar: QUIÉN SE
--  PRESENTÓ en la postulación y quién apareció después, durante la ejecución.
--  Esa distinción es justo la que pregunta DAFO cuando el plantel artístico
--  cambia —y cambia siempre: alguien se enferma, aparece una voz experta que
--  nadie había previsto, un testimonio se cae—.
--  Si el fondo apuntara a la lista del proyecto, quitar a alguien del reparto
--  de ESTE fondo lo borraría del proyecto entero, y con él de los otros dos
--  fondos que cuelgan del mismo proyecto. Lista propia, entonces.
--
--  ── PERO LA FICHA NARRATIVA NO SE DUPLICA ──
--  «Braulia quiere volver a la laguna» es verdad del personaje, no del fondo.
--  Copiarla aquí crearía dos Braulias que divergen a la primera corrección, y
--  a los seis meses nadie sabe cuál es la buena. Por eso `proyecto_actor_id`:
--  la fila del fondo APUNTA a la ficha del proyecto cuando la hay, y lo que
--  guarda de propio es solo lo que es propio del fondo —el rol aquí, de dónde
--  viene, y su cesión—.
--  Puede ser NULL: una voz experta que aparece en el mes catorce entra en el
--  fondo sin pasar por la ficha del proyecto, y eso está bien.
--
--  ── LA CESIÓN ──
--  Sin autorización firmada de uso de imagen y voz, el material de esa persona
--  no se puede usar: ni en la copia final, ni en el tráiler, ni en el material
--  promocional del 5.3.7. Es el papel que más se olvida —se pide en el rodaje,
--  con prisa, y luego nadie sabe cuáles faltan— y el que más caro sale, porque
--  se descubre en montaje, cuando volver a pedirlo significa volver a la
--  comunidad.
--
--  ⚠ QUÉ DICE Y QUÉ NO DICE EL ACTA. La cláusula 5.4 pide «documentación de
--  contratos, convenios de prácticas o prestación de servicios de todo el
--  personal vinculado» más los seguros contra accidentes. NO nombra la cesión
--  de imagen de los actores sociales como entregable aparte: es lo que se
--  rinde ahí junto con lo demás del personal vinculado. Se enlaza a esa
--  cláusula por eso, no porque el acta diga «cesión» — que no lo dice, y
--  escribirlo aquí como si lo dijera sería inventarse una obligación.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ============================================================

create table if not exists postulacion_reparto (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,

  /* Los dos, opcionales, igual que en `proyecto_actores` y por la misma razón:
     en documental la persona ES el personaje; en ficción el personaje existe
     desde el guion y el intérprete llega en casting, meses después. */
  persona_id     uuid references personas(id) on delete set null,
  personaje      text,

  /* De dónde sale la ficha larga —qué quiere, qué necesita, el arte—, para no
     tener dos. `on delete set null`: si alguien limpia el reparto del
     proyecto, la fila del fondo NO se va con él. Lo que hay en un fondo es lo
     que se presentó a un concurso público; no puede evaporarse porque alguien
     ordenó otra pantalla. */
  proyecto_actor_id uuid references proyecto_actores(id) on delete set null,

  /* Protagonista, Conductora, Testimonio, Voz experta, Secundario… Texto libre
     con sugerencias (el combo es un datalist): un proyecto puede tener roles
     que no están en ninguna lista nuestra. */
  rol            text,
  /* La especialidad de una voz experta: «antropóloga», «bióloga», «historiador
     local». Va aparte del rol porque son dos preguntas: QUÉ es en la película
     (voz experta) y DE QUÉ habla (antropología). Metidas en el mismo campo,
     el filtro por rol deja de servir. */
  especialidad   text,

  /* ── LO QUE EL PROYECTO NO PUEDE CONTESTAR ──
     postulacion → estaba en el expediente que ganó el fondo.
     ejecucion   → apareció después, rodando.
     El default es `ejecucion` a propósito: lo que se añade a mano, meses
     después de ganar, casi siempre es de ejecución. Marcar de postulación a
     quien no lo era es una afirmación sobre un expediente presentado al
     Estado, y esa se hace a conciencia, no por descuido del valor por
     defecto. */
  procedencia    text not null default 'ejecucion',

  /* ── LA CESIÓN DE DERECHOS DE IMAGEN Y VOZ ──
     no_aplica → no hace falta (un personaje animado no firma nada)
     pendiente → hace falta y no está          ← el default
     firmada   → está, y `cesion_url` lo prueba
     `pendiente` de default y no `no_aplica`: un papel que falta tiene que
     doler desde el minuto uno. Con `no_aplica` por defecto, el contador diría
     «0 pendientes» el día que se creó la lista y nadie volvería a mirarlo. */
  cesion_estado  text not null default 'pendiente',
  cesion_url     text,
  cesion_fecha   date,

  nota           text,
  orden          int not null default 0,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references perfiles(id)
);

/* ── LA FILA QUE NO NOMBRA A NADIE ──
   Con persona y personaje los dos opcionales, nada impedía guardar una fila
   vacía: aparece en la lista como un hueco que nadie sabe de dónde salió, no
   falla y no se ve. Al menos una de las dos. Misma guarda que
   `proyecto_actores_alguien`. */
alter table postulacion_reparto drop constraint if exists postulacion_reparto_alguien;
alter table postulacion_reparto add constraint postulacion_reparto_alguien
  check (persona_id is not null or nullif(btrim(personaje), '') is not null);

/* Los dos vocabularios cerrados, en la base y no solo en el formulario: una
   pantalla nueva que escriba «postulación» con tilde metería una tercera
   procedencia que ningún contador vería, y los totales dejarían de sumar sin
   que nada se queje. */
alter table postulacion_reparto drop constraint if exists postulacion_reparto_procedencia;
alter table postulacion_reparto add constraint postulacion_reparto_procedencia
  check (procedencia in ('postulacion','ejecucion'));

alter table postulacion_reparto drop constraint if exists postulacion_reparto_cesion;
alter table postulacion_reparto add constraint postulacion_reparto_cesion
  check (cesion_estado in ('no_aplica','pendiente','firmada'));

/* ── LA MISMA PERSONA, DOS VECES EN EL MISMO FONDO ──
   Pasa al traer el reparto del proyecto por segunda vez, y el resultado es un
   contador de cesiones que cuenta a Braulia dos veces: «1 de 2 firmadas»
   cuando en realidad está todo firmado.
   Índice ÚNICO PARCIAL —solo donde hay persona—, porque las filas de puro
   personaje (`persona_id` null) sí pueden repetirse: dos personajes distintos
   sin repartir no son la misma fila, y en SQL dos NULL nunca chocan.
   ⚠ Un índice único parcial NO sirve para `on conflict`: PostgREST devuelve
   42P10 «no unique or exclusion constraint matching». Ya nos pasó. Las
   acciones consultan antes de insertar en vez de fiarse del upsert. */
create unique index if not exists postulacion_reparto_persona_unica
  on postulacion_reparto(postulacion_id, persona_id)
  where persona_id is not null;

create index if not exists idx_reparto_post on postulacion_reparto(postulacion_id, orden);

alter table postulacion_reparto enable row level security;
drop policy if exists "leer_reparto"   on postulacion_reparto;
drop policy if exists "crear_reparto"  on postulacion_reparto;
drop policy if exists "editar_reparto" on postulacion_reparto;
drop policy if exists "borrar_reparto" on postulacion_reparto;
create policy "leer_reparto"   on postulacion_reparto for select to authenticated using (true);
create policy "crear_reparto"  on postulacion_reparto for insert to authenticated with check (true);
create policy "editar_reparto" on postulacion_reparto for update to authenticated using (true) with check (true);
create policy "borrar_reparto" on postulacion_reparto for delete to authenticated using (true);

/* ── QUE SE VEA EN CALIENTE ──
   Sin publicar la tabla, la suscripción de la pestaña se abre, dice
   «SUBSCRIBED» y no emite NADA. No da error: simplemente no llega nunca un
   evento, que es el fallo más caro de diagnosticar. Ya nos pasó con las once
   tablas del fondo (db/realtime-fondo.sql).
   El `do` es porque `alter publication ... add table` revienta si la tabla ya
   está dentro, y este archivo tiene que poder correrse dos veces. */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'postulacion_reparto'
  ) then
    alter publication supabase_realtime add table public.postulacion_reparto;
  end if;
end $$;

-- ── VERIFICACIÓN ──
--  Todo filtrado por esquema: sin `table_schema`/`schemaname`, una tabla
--  homónima en otro esquema haría que el recuento saliera 2 y el resultado
--  esperado fallara sin que nada estuviera mal.
--  Se comprueban también las CUATRO políticas y el índice de lectura, que son
--  justo lo que queda a medias si este archivo se corta por la mitad: sin
--  ellas la tabla existe, se ve vacía y no da ningún error.
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'postulacion_reparto')   as tabla,
  (select count(*) from pg_constraint
     where conname in ('postulacion_reparto_alguien',
                       'postulacion_reparto_procedencia',
                       'postulacion_reparto_cesion'))                        as guardas,
  (select count(*) from pg_indexes
     where schemaname = 'public'
       and indexname = 'postulacion_reparto_persona_unica')                  as unico_persona,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'idx_reparto_post')         as indice_lectura,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'postulacion_reparto')      as politicas,
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'postulacion_reparto')      as en_realtime,
  (select count(*) from postulacion_reparto)                                 as filas;
-- tabla = 1 · guardas = 3 · unico_persona = 1 · indice_lectura = 1
-- politicas = 4 · en_realtime = 1
