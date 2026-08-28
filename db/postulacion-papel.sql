-- ============================================================
--  db/postulacion-papel.sql — LOS PAPELES DEL PERSONAL VINCULADO
--
--  La cláusula 5.4 del acta, literal:
--    «Documentación de contratos, convenios de prácticas o prestación de
--     servicios de todo el personal vinculado. Y OBLIGATORIAMENTE seguros
--     contra accidentes para quienes participen —o prestaciones equivalentes
--     que permitan atención inmediata durante el rodaje—.»
--
--  ── EL PROBLEMA QUE ESTO RESUELVE ──
--  Hoy la 5.4 es UNA fila de `compromiso_acta` con UNA casilla y UNA URL. Se
--  marca «entregado» y nadie sabe si eran veintiún contratos o tres. Y no se
--  cumple de golpe: se cumple PERSONA A PERSONA. Es el mismo problema que tenía
--  la cesión de imagen antes de `postulacion_reparto.cesion_estado`, y se
--  arregla igual — un documento por persona, y el recuento sale de los datos.
--
--  El presupuesto de PO-001 tiene «Seguros contra accidentes para los
--  trabajadores del audiovisual: 21 paquetes × S/ 250». Veintiuno es un número
--  real contra el que cuadrar, y hasta ahora no había nada que cuadrar.
--
--  ── UNA FILA POR PERSONA Y TIPO, NO POR PERSONA ──
--  A la misma persona el acta le puede pedir dos cosas —su contrato Y su
--  seguro—, y son documentos distintos, con fechas distintas y que llegan en
--  momentos distintos. Una sola fila con dos columnas obligaría a inventar
--  «estado del contrato» y «estado del seguro», y a la tercera clase de papel
--  habría que migrar la tabla.
--
--  ── POR QUÉ NO CUELGA DE `equipo_fondo` ──
--  Porque la nómina de un fondo NO es una tabla: se DEDUCE (lib/equipoFondo.ts
--  — manda el hecho, quien tiene un RHE girado trabajó aquí, esté apuntado o
--  no). No hay fila donde colgarle el contrato a quien aparece solo por un
--  recibo. Los papeles cuelgan de la persona EN ESTE FONDO, que es lo único
--  que siempre existe.
--
--  ── Y NO SE MUEVE LA CESIÓN AQUÍ ──
--  La cesión de imagen y voz vive en `postulacion_reparto` y ahí se queda: es
--  del reparto, tiene su columna y ya está en uso. Traerla aquí crearía dos
--  sitios donde consta lo mismo. Lo que sí está en un solo sitio es la REGLA de
--  qué pide la 5.4: lib/papeles.ts junta las dos fuentes para el recuento.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ============================================================

create table if not exists postulacion_papel (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  /* `on delete cascade` y no `set null`: un papel sin persona no es de nadie y
     no se puede rendir. Si se borra la ficha de la persona, esto ya no prueba
     nada. */
  persona_id     uuid not null references personas(id) on delete cascade,

  /* contrato | convenio | locacion | seguro | otro
     Los cuatro primeros son, uno a uno, los que nombra la cláusula. `otro`
     existe para lo que aparezca sin obligar a migrar la tabla — pero NO cuenta
     como contrato en el recuento: un papel que no sabemos qué es no puede
     tapar el hueco de uno que sí. */
  tipo           text not null default 'contrato',

  /* pendiente | firmado | no_aplica
     `pendiente` de default y no `no_aplica`: un papel que falta tiene que doler
     desde el minuto uno. Con `no_aplica` por defecto el contador diría «0
     pendientes» el día que se creó la lista y nadie volvería a mirarlo.
     Misma decisión, y por la misma razón, que `cesion_estado`. */
  estado         text not null default 'pendiente',

  /* La prueba. Un papel «firmado» sin enlace no está probado: puede existir en
     un archivador, pero en una rendición eso es lo mismo que no tenerlo, y la
     pantalla lo dice en vez de pintarlo en verde. */
  url            text,
  firmado_en     date,

  /* ── LA VIGENCIA, SOLO PARA EL SEGURO ──
     Un contrato firmado lo está para siempre; un seguro contra accidentes
     cubre UNA VENTANA, y lo que el acta exige es que quien participa esté
     cubierto MIENTRAS RUEDA. Un seguro vencido el mes pasado sigue siendo un
     PDF firmado: sin estas dos fechas, la pantalla lo pintaría en verde el día
     que ya no cubre a nadie.
     Se dejan en la tabla general y no en una tabla de seguros aparte porque
     son dos columnas nulas para los demás tipos, y una segunda tabla serían
     dos sitios donde buscar el papel de la misma persona. */
  vigente_desde  date,
  vigente_hasta  date,

  /* Por qué NO aplica. Obligatorio cuando el estado lo es —lo fuerza el check
     de abajo—: «no aplica» sin motivo es indistinguible de «alguien lo marcó
     para que dejara de salir en rojo», y dentro de un año no hay forma de
     saber cuál de las dos fue. */
  motivo         text,
  nota           text,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references perfiles(id)
);

/* Los dos vocabularios, cerrados en la base y no solo en el formulario: una
   pantalla nueva que escriba «Contrato» con mayúscula metería un tipo que
   ningún recuento vería, y el aviso de la 5.4 dejaría de encenderse sin que
   nada se queje. */
alter table postulacion_papel drop constraint if exists postulacion_papel_tipo;
alter table postulacion_papel add constraint postulacion_papel_tipo
  check (tipo in ('contrato','convenio','locacion','seguro','otro'));

alter table postulacion_papel drop constraint if exists postulacion_papel_estado;
alter table postulacion_papel add constraint postulacion_papel_estado
  check (estado in ('pendiente','firmado','no_aplica'));

/* «No aplica» exige decir por qué. Ver arriba. */
alter table postulacion_papel drop constraint if exists postulacion_papel_motivo;
alter table postulacion_papel add constraint postulacion_papel_motivo
  check (estado <> 'no_aplica' or nullif(btrim(motivo), '') is not null);

/* Una ventana de vigencia al revés es un dato que no significa nada y que la
   pantalla pintaría como «cubierto durante -30 días». */
alter table postulacion_papel drop constraint if exists postulacion_papel_vigencia;
alter table postulacion_papel add constraint postulacion_papel_vigencia
  check (vigente_desde is null or vigente_hasta is null or vigente_hasta >= vigente_desde);

/* ── UN PAPEL DE CADA TIPO POR PERSONA Y FONDO, MENOS EL SEGURO ──
   Sin esto, dos personas cargando a la vez dejan dos contratos de Zenón y el
   recuento pasa a decir «22 de 21», que es peor que no tener recuento.

   ⚠ PERO EL SEGURO SE EXCLUYE, Y NO ES UN DESCUIDO. Dos pólizas encadenadas
   —una por etapa de rodaje— son lo normal en una producción de dos años, y
   `estadoDePersona` en lib/papeles.ts está escrito para varias: con la primera
   caducada, la persona sigue cubierta por la segunda. Con el índice cerrado,
   esa rama no se ejecutaría nunca y la segunda póliza sería imposible de
   registrar. El código y la base tienen que decir lo mismo.

   ⚠ Al ser PARCIAL, este índice NO sirve para `on conflict`: PostgREST
   devuelve 42P10 «no unique or exclusion constraint matching». Es la misma
   lección de `postulacion_reparto_persona_unica`. Por eso `registrarPapel`
   consulta antes de insertar en vez de fiarse del upsert — y se salta esa
   consulta cuando el tipo es `seguro`. */
drop index if exists postulacion_papel_unico;
create unique index if not exists postulacion_papel_unico
  on postulacion_papel(postulacion_id, persona_id, tipo)
  where tipo <> 'seguro';

create index if not exists idx_papel_post on postulacion_papel(postulacion_id);

alter table postulacion_papel enable row level security;
drop policy if exists "leer_papel"   on postulacion_papel;
drop policy if exists "crear_papel"  on postulacion_papel;
drop policy if exists "editar_papel" on postulacion_papel;
drop policy if exists "borrar_papel" on postulacion_papel;
create policy "leer_papel"   on postulacion_papel for select to authenticated using (true);
create policy "crear_papel"  on postulacion_papel for insert to authenticated with check (true);
create policy "editar_papel" on postulacion_papel for update to authenticated using (true) with check (true);
create policy "borrar_papel" on postulacion_papel for delete to authenticated using (true);

/* ── QUE SE VEA EN CALIENTE ──
   Sin publicar la tabla, la suscripción se abre, dice «SUBSCRIBED» y no emite
   NADA: no da error, simplemente no llega nunca un evento. Es el fallo más
   caro de diagnosticar y ya nos pasó con las once tablas del fondo.
   El `do` es porque `alter publication ... add table` revienta si la tabla ya
   está dentro, y este archivo tiene que poder correrse dos veces. */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'postulacion_papel'
  ) then
    alter publication supabase_realtime add table public.postulacion_papel;
  end if;
end $$;

-- ── VERIFICACIÓN ──
--  Todo filtrado por esquema: un homónimo en otro esquema daría un número
--  mayor y el resultado esperado fallaría sin que nada estuviera mal.
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'postulacion_papel')      as tabla,
  /* ⚠ LAS COLUMNAS TAMBIÉN. El archivo usa `create table if not exists`, así
     que una instalación que corrió una versión anterior NO recibe las columnas
     nuevas — y sin esta línea la verificación seguiría dando todo ✔ sobre una
     tabla incompleta, que es la peor forma de pasar una revisión. */
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'postulacion_papel'
       and column_name in ('id','postulacion_id','persona_id','tipo','estado','url',
                           'firmado_en','vigente_desde','vigente_hasta','motivo',
                           'nota','creado_en','creado_por'))                  as columnas,
  /* Por `conrelid` y no solo por esquema: los nombres de constraint son únicos
     por TABLA, no por esquema, así que sin esto una constraint homónima en
     otra tabla inflaría la cuenta. */
  (select count(*) from pg_constraint
     where conrelid = 'public.postulacion_papel'::regclass
       and conname in ('postulacion_papel_tipo','postulacion_papel_estado',
                       'postulacion_papel_motivo','postulacion_papel_vigencia')) as guardas,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'postulacion_papel_unico')   as unico,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'postulacion_papel')         as politicas,
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'postulacion_papel')         as en_realtime,
  (select count(*) from postulacion_papel)                                    as filas;
-- tabla = 1 · columnas = 13 · guardas = 4 · unico = 1 · politicas = 4 · en_realtime = 1
-- `filas` es informativo: en la primera pasada es 0, y en las siguientes serán
-- las que hayas cargado. Este archivo está hecho para poder correrse dos veces.
