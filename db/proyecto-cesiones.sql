-- ══════════════════════════════════════════════════════════════════════════
-- LAS CESIONES DEL REPARTO DE UN PROYECTO
--
-- El caso que lo pidió, tal cual: Jennifer Pachaqutec lidera «Las Patronas»,
-- la banda que toca en el cargo de Lino. Su música NO se compuso para el
-- documental —existía sin nosotros— y aun así entra en la pieza. Además la
-- entrevistamos, y ella y su banda tienen una secuencia.
--
-- Así que Jennifer necesita DOS autorizaciones distintas, que nadie firma en
-- el mismo papel:
--    · que se le grabe, hable y salga en la pieza    → imagen, voz y testimonio
--    · que su tema suene dentro de la pieza          → música
--
-- ── POR QUÉ UNA TABLA Y NO TRES COLUMNAS ──
-- El fondo resuelve la cesión con tres columnas en la fila del reparto
-- (`cesion_estado`, `cesion_url`, `cesion_fecha`), y ahí alcanza porque solo
-- hay una pregunta: ¿autorizó su imagen? Aquí hay al menos dos, y el día que
-- aparezca una tercera —el archivo de una foto familiar, un texto leído en
-- off— con columnas habría que migrar la tabla otra vez.
-- Es la misma lección de db/postulacion-papel.sql, que hizo tabla aparte para
-- los papeles de la cláusula 5.4 por exactamente este motivo.
--
-- ── POR QUÉ NO SE OBLIGA A ELEGIR ENTRE IMAGEN Y MÚSICA ──
-- Porque no son excluyentes y Jennifer lo demuestra. Una persona puede tener
-- las dos, una, o ninguna; el único límite es que no haya DOS del mismo tipo
-- para la misma persona en el mismo proyecto — eso sería una firma duplicada,
-- y entonces nadie sabe cuál vale.
--
-- ── ESTO NO ES SOLO PARA DAFO ──
-- Al contrario: los fondos ya tienen su cláusula 5.4 que lo exige. Esto es
-- para los proyectos que NUNCA van a tener fondo —los de encargo y los
-- autofinanciados, que son la mayoría—, donde nadie te obliga a guardar el
-- papel hasta el día que la pieza va a un festival o a una emisión y alguien
-- pregunta quién autorizó esa música. Ese día el papel existe o no existe.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ⚠ Requiere db/proyecto-actores.sql corrido antes.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists proyecto_cesion (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,

  /* ── A QUIÉN ──
     `persona_id` y no la fila del reparto: la cesión la firma una PERSONA, y
     sigue valiendo aunque su fila del reparto se reordene, cambie de rol o se
     borre y se vuelva a crear. Atarla a `proyecto_actores.id` habría hecho
     que quitar a alguien del reparto por error se llevara por delante la
     prueba de que autorizó — que es justo lo que no se puede perder. */
  persona_id  uuid not null references personas(id) on delete cascade,

  /* ── QUÉ AUTORIZA ──
     `imagen`  → que se le grabe, que su voz suene y que su testimonio aparezca
                 en la pieza. Se rotula «imagen, voz y testimonio» porque es el
                 nombre del papel que de verdad se firma, y las tres cosas van
                 en el mismo documento: quien sale en cámara también habla, y lo
                 que cuenta es suyo aparte de su cara. UN tipo y no tres — el
                 mundo real firma un papel, y partirlo dejaría a todos con dos
                 tercios de cesión para siempre.
     `musica`  → que una obra suya suene dentro de la pieza
     `otro`    → lo que no cabe en las dos y hay que poder guardar igual:
                 una foto de archivo, un texto leído, un dibujo.
     Vocabulario cerrado en la base: una pantalla nueva que escriba «imágen»
     con tilde metería un cuarto tipo que ningún recuento vería, y esa cesión
     dejaría de contar sin que nada se queje. */
  tipo        text not null default 'imagen'
              check (tipo in ('imagen','musica','otro')),

  /* ── EN QUÉ ESTADO ──
     Las mismas tres palabras que la cesión del fondo (`cesion_estado`), a
     propósito: es la misma pregunta y con vocabularios distintos habría que
     traducir entre las dos pantallas, que es donde se pierde un valor.
     `no_aplica` no es «no hace falta preguntar»: es «se decidió que no
     corresponde», y por eso pide motivo más abajo. */
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','firmada','no_aplica')),

  /* ── LA PRUEBA ──
     Una cesión «firmada» sin documento es una afirmación, no una firma. No se
     obliga con un check —a veces el papel se escanea días después— pero la
     pantalla lo marca en ámbar y el recuento no lo da por bueno. Es la misma
     regla que `firmadaSinPrueba` en el reparto del fondo. */
  url         text,
  firmado_en  date,

  /* ── QUÉ OBRA ──
     Solo tiene sentido en `musica` y en `otro`: «Las Patronas — huayno de la
     fiesta» dice qué se autorizó. Una cesión de imagen no necesita nombrar
     nada, porque lo que se cede es la persona.
     Sin esto, dos cesiones de música de la misma persona serían indistin-
     guibles en la lista, y el día que una se revoque no se sabría cuál. */
  obra        text,

  /* Por qué no aplica, o cualquier cosa que haya que recordar. Obligatorio de
     hecho cuando el estado es `no_aplica`: lo comprueba la acción, con
     palabras, y no un check que devolvería un error que no explica nada. */
  motivo      text,
  nota        text,

  creado_en   timestamptz not null default now(),
  creado_por  uuid references perfiles(id)
);

/* ── SOLO LA IMAGEN ES ÚNICA ──
   Dos cesiones de imagen de la misma persona en el mismo proyecto son una
   firma duplicada, y entonces nadie sabe cuál vale.
   ⚠ NI la música NI `otro` entran en el índice, y las dos por la misma razón:
   son varias por naturaleza. Dos temas de la misma banda son dos permisos; y
   `otro` es el cajón de sastre —una foto de archivo, un texto leído, un
   dibujo— así que limitarlo a uno contradecía lo que el propio campo dice que
   es. El primer borrador ponía `where tipo <> 'musica'` y dejaba `otro`
   convertido en singleton sin querer.
   ⚠ Un índice único parcial NO sirve para `on conflict` (error 42P10): las
   acciones consultan antes de insertar. Está contado en db/postulacion-reparto. */
create unique index if not exists uq_proy_cesion_una
  on proyecto_cesion(proyecto_id, persona_id, tipo)
  where tipo = 'imagen';

create index if not exists idx_proy_cesion
  on proyecto_cesion(proyecto_id, persona_id);

/* ── LOS CHECKS, FUERA DEL `create table` ──
   ⚠ Un `check` inline dentro de `create table if not exists` NO se aplica si
   la tabla ya existía: el `if not exists` se salta la sentencia ENTERA, y el
   vocabulario cerrado que este archivo promete se quedaría sin poner. Se
   repiten aquí con `drop … if exists` + `add`, que es idempotente de verdad y
   corrige una tabla creada por una versión anterior del archivo.
   Mismo patrón que db/proyecto-actores-situacion.sql. */
alter table proyecto_cesion drop constraint if exists proyecto_cesion_tipo;
alter table proyecto_cesion add constraint proyecto_cesion_tipo
  check (tipo in ('imagen','musica','otro'));
alter table proyecto_cesion drop constraint if exists proyecto_cesion_estado;
alter table proyecto_cesion add constraint proyecto_cesion_estado
  check (estado in ('pendiente','firmada','no_aplica'));

comment on table proyecto_cesion is
  'Las autorizaciones que firma quien aparece o suena en un proyecto. Varias '
  'por persona: salir en cámara y que tu música suene son dos permisos '
  'distintos. Para los proyectos SIN fondo DAFO es el único sitio donde queda '
  'constancia; los fondos además lo exigen por la cláusula 5.4.';

-- ── RLS: mismo criterio que el resto de las relaciones del proyecto ──
alter table proyecto_cesion enable row level security;
drop policy if exists pc_sel on proyecto_cesion;
drop policy if exists pc_ins on proyecto_cesion;
drop policy if exists pc_upd on proyecto_cesion;
drop policy if exists pc_del on proyecto_cesion;
create policy pc_sel on proyecto_cesion for select to authenticated using (true);
create policy pc_ins on proyecto_cesion for insert to authenticated with check (true);
create policy pc_upd on proyecto_cesion for update to authenticated using (true) with check (true);
create policy pc_del on proyecto_cesion for delete to authenticated using (true);

/* ── REALTIME ──
   Se publica: dos personas armando el reparto a la vez tienen que ver las
   cesiones de la otra. Una tabla NO publicada abre la suscripción, dice
   SUBSCRIBED y no emite nada, sin error — y eso se descubre tarde.
   El `do` evita el error si ya estaba publicada. */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'proyecto_cesion'
  ) then
    execute 'alter publication supabase_realtime add table public.proyecto_cesion';
  end if;
end $$;

-- ------------------------------------------------------------
-- VERIFICAR — tabla en 1, índices en 1, cuatro políticas, y publicada.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'proyecto_cesion')      as tabla,
  /* Que EXISTA no basta: `create unique index if not exists` se salta en
     silencio si ya hay uno con ese nombre y otra definición. Se comprueba que
     sea único y parcial de verdad. */
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'uq_proy_cesion_una'
      and indexdef ilike '%unique%' and indexdef ilike '%where%imagen%')   as indice_unico,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'idx_proy_cesion')         as indice_lectura,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'proyecto_cesion')         as politicas,
  /* Filtrado por esquema: un homónimo en otro daría un número mayor y la
     verificación fallaría sin que nada estuviera mal. */
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'proyecto_cesion')        as en_realtime,
  (select count(*) from proyecto_cesion)                                    as filas;
