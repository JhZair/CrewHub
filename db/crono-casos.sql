-- ══════════════════════════════════════════════════════════════════════════
-- UNA ACTIVIDAD DE CRONOGRAMA, VARIOS CASOS
--
-- `cronograma_actividades.publicacion_id` guardaba UN caso por actividad, y en
-- la práctica no alcanza. «Rodaje Nelly» son tres trabajos que caminan a la vez
-- y los lleva gente distinta: conseguir el permiso de filmación, cerrar el
-- transporte a la comunidad, y el rodaje en sí. Con un solo hueco, abrir el
-- segundo caso obligaba a soltar el primero — y el primero era justo el que
-- guardaba la conversación.
--
-- Es EXACTAMENTE el mismo problema que db/compromiso-casos.sql resolvió para
-- las cláusulas del acta, con las mismas palabras. Así que la solución es la
-- misma, y a propósito: dos relaciones «uno a muchos» del mismo sistema que se
-- modelan distinto son dos formas de leer lo mismo, y el día que haya que tocar
-- las dos, una se olvida.
--
-- La relación real es de uno a muchos: una actividad tiene los casos que haga
-- falta, y cada caso pertenece a una actividad. Eso es una columna en
-- `publicaciones`, no un hueco en la actividad.
--
-- ── `cronograma_actividades.publicacion_id` SE QUEDA, PERO YA NO MANDA ──
-- No se borra: es el rastro de los casos abiertos hasta hoy y de él sale el
-- backfill. Pero deja de escribirse y de leerse — dos sitios que dicen «el caso
-- de esta actividad» acaban diciendo cosas distintas, y el que se mira no es
-- siempre el que se actualizó.
-- Tampoco se borra por una razón de despliegue: mientras el código viejo siga
-- arriba, sigue leyéndola. Quitarla ahora rompería la pantalla hasta el
-- siguiente despliegue. (Ver db/tratamiento-soltar.sql, donde esa coreografía
-- de dos archivos y un orden que hay que recordar costó una tanda entera.)
--
-- ── Y SE VA EL ÍNDICE ÚNICO ──
-- `uq_crono_caso` (db/crono-caso-unico.sql) existía para impedir que dos
-- actividades se repartieran el mismo caso. Esa guarda sigue teniendo sentido
-- —un caso pertenece a UNA actividad— pero ahora la sostiene el modelo: la
-- relación vive en el caso, y un caso solo tiene una `actividad_id`. El índice
-- pasa a estorbar, porque cuenta la columna vieja.
--
-- ── ⚠ EL ORDEN: LA MIGRACIÓN PRIMERO, EL CÓDIGO DESPUÉS ──
-- Correr esto ANTES de publicar es seguro: conserva y rellena `publicacion_id`,
-- así que el código viejo sigue funcionando igual —lo único que pierde es el
-- índice `uq_crono_caso`, cuya guarda el código nuevo ya no necesita—.
-- Al revés NO: con el código nuevo desplegado y esta migración sin correr, el
-- embed `casos:publicaciones!actividad_id` hace fallar la consulta ENTERA y el
-- cronograma del fondo aparecería vacío. La pantalla lo dice en rojo en vez de
-- callarse (`cronoError`), pero es media hora de susto que se evita corriendo
-- esto primero.
--
-- ⚠ SIN transacción en la parte que altera (lección pgBouncer). Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · ANTES — para poder comparar. Debe decir cuántas actividades tienen caso.
-- ------------------------------------------------------------
select count(*) filter (where publicacion_id is not null) as con_caso_viejo,
       count(*)                                           as actividades
  from cronograma_actividades;

-- ------------------------------------------------------------
-- 2 · LA COLUMNA NUEVA, EN EL CASO
-- ------------------------------------------------------------
alter table publicaciones add column if not exists actividad_id uuid
  references cronograma_actividades(id) on delete set null;

comment on column publicaciones.actividad_id is
  'La actividad del cronograma que este caso atiende. Una actividad tiene los '
  'casos que haga falta; cada caso cuelga de una sola actividad. '
  '`on delete set null`: si se borra la actividad, el trabajo hecho no se '
  'borra — solo se queda sin actividad. Sustituye a '
  'cronograma_actividades.publicacion_id, que admitía uno solo.';

-- Parcial: la inmensa mayoría de los casos no salen de un cronograma, y un
-- índice sobre miles de nulos ocupa sin servir.
create index if not exists idx_pub_actividad on publicaciones(actividad_id)
  where actividad_id is not null;

-- ------------------------------------------------------------
-- 3 · BACKFILL
--     Lo que ya estaba atado por `publicacion_id` pasa a la columna nueva. Sin
--     esto, las actividades que ya tenían caso aparecerían vacías después de la
--     migración: el trabajo seguiría existiendo y la pantalla diría que no.
--     `and p.actividad_id is null` lo hace repetible sin pisar nada.
-- ------------------------------------------------------------
update publicaciones p
   set actividad_id = ca.id
  from cronograma_actividades ca
 where ca.publicacion_id = p.id
   and p.actividad_id is null;

-- ------------------------------------------------------------
-- 4 · Y AHORA SÍ, FUERA EL ÍNDICE ÚNICO
--     ⚠ DESPUÉS del backfill, no antes. `uq_crono_caso` garantiza que ninguna
--     actividad comparte caso con otra, y el `update ... from` de arriba se
--     apoya en eso: sin el índice vigente, dos actividades apuntando al mismo
--     caso harían que Postgres eligiera UNA arbitrariamente, sin avisar.
--     Hoy los datos están limpios porque el índice estuvo puesto; el orden
--     importa el día que este archivo se vuelva a correr sobre una base que ha
--     derivado.
--     `if exists`: si no llegaste a correr db/crono-caso-unico.sql, no hace
--     nada y no es un error. No toca ningún dato.
-- ------------------------------------------------------------
drop index if exists uq_crono_caso;

comment on column cronograma_actividades.publicacion_id is
  'OBSOLETA desde db/crono-casos.sql. La relación vive ahora en '
  'publicaciones.actividad_id, que admite varios casos por actividad. Se '
  'conserva como rastro de lo atado hasta la migración; no se escribe ni se '
  'lee. No se borra: mientras haya código viejo desplegado, sigue leyéndola.';

-- ------------------------------------------------------------
-- 5 · REALTIME
--     `publicaciones` ya está publicada, así que no hay nada que añadir: los
--     cambios de `actividad_id` viajan con la fila. Se comprueba porque una
--     tabla NO publicada abre la suscripción, dice SUBSCRIBED y no emite nada,
--     sin error — y eso se descubre tarde.
-- ------------------------------------------------------------
select count(*) as publicaciones_en_realtime
  from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'publicaciones';

-- ------------------------------------------------------------
-- 6 · VERIFICAR — `huerfanos` tiene que ser 0. Es la comprobación que vale:
--     dice que TODO lo que estaba atado por la columna vieja quedó atado por la
--     nueva.
--     ⚠ `migrados` NO tiene por qué coincidir con `con_caso_viejo` del paso 1 en
--     cuanto alguien ate un caso desde la pantalla: cuenta todos los
--     `actividad_id`, no solo los que vinieron del backfill. Sirve para el
--     primer vistazo y nada más.
-- ------------------------------------------------------------
select
  (select count(*) from publicaciones where actividad_id is not null) as migrados,
  (select count(*) from cronograma_actividades ca
     where ca.publicacion_id is not null
       and not exists (select 1 from publicaciones p
                        where p.id = ca.publicacion_id and p.actividad_id = ca.id)
  ) as huerfanos,
  (select count(*) from pg_indexes where indexname = 'uq_crono_caso') as indice_viejo_debe_ser_0,
  (select count(*) from pg_indexes where indexname = 'idx_pub_actividad') as indice_nuevo_debe_ser_1;
