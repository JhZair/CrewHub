-- ============================================================
--  db/reparto-situacion.sql — CANDIDATA, CONFIRMADA, DESCARTADA
--
--  Un documental de personajes reales no se escribe: se busca. Antes de que
--  Braulia sea la protagonista hubo una lista de mujeres de las que alguien
--  oyó hablar, a las que hubo que ir a ver, y de las que la mayoría no entró.
--  Ese trabajo —el de exploración— hoy no cabía en ningún sitio: o metías a
--  alguien en el reparto como si ya estuviera, o no lo apuntabas.
--
--  ── POR QUÉ ES UNA SITUACIÓN Y NO UN PAPEL ──
--  Se podría haber escrito «Candidata» en el campo `rol` y sacar un tercer
--  grupo, que era lo barato. Pero candidata no es un papel: es el ESTADO de
--  una relación que va a cambiar. Braulia era candidata A PROTAGONISTA, y ese
--  «a qué» es justamente lo que se está explorando —si encaja o no en ese
--  hueco—. Metido en `rol`, el papel previsto no cabe en ninguna parte y
--  confirmar a alguien obliga a reescribírselo a mano, que es cuando se pierde.
--  Dos ejes, dos columnas:
--     rol       → qué es (o sería) en la película
--     situacion → si ya está dentro
--
--  ── EL DEFAULT ES `confirmada`, Y NO ES POR COMODIDAD ──
--  Las filas que ya están cargadas entraron cuando esta columna no existía, y
--  todas son gente que YA está en el proyecto: las cinco de KAWSAY WARMI vienen
--  del expediente que ganó el fondo. Con default `explorando`, correr esta
--  migración las mandaría a todas a la sección de candidatas y el equipo
--  artístico aparecería vacío el lunes por la mañana. El alta como candidata se
--  pide explícitamente desde el botón, que es donde esa decisión se toma.
--
--  ── LAS DESCARTADAS NO SE BORRAN ──
--  Saber a quién descartaste —y por qué, en la nota— evita volver a proponer a
--  la misma persona dentro de seis meses, y en un documental de encuentro
--  pasa: alguien que no encajaba para un bloque encaja para otro. Se guardan y
--  se enseñan apagadas, en su propia sección al final de la lista.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
--  ⚠ Requiere db/postulacion-reparto.sql corrido antes.
-- ============================================================

alter table postulacion_reparto add column if not exists situacion text;

/* En tres pasos —añadir suelta, rellenar, y luego default y not null— y no en
   una sola sentencia `add column ... not null default 'confirmada'`. El estado
   final es el mismo; lo que cambia es que aquí se VE qué pasó con las filas que
   ya existían. Un `update` con su `where` en el archivo de migración es la
   única prueba, dentro de un año, de que las cinco de KAWSAY WARMI se dieron
   por confirmadas a propósito y no por el valor por defecto de una columna. */
update postulacion_reparto set situacion = 'confirmada' where situacion is null;

alter table postulacion_reparto alter column situacion set default 'confirmada';
alter table postulacion_reparto alter column situacion set not null;

/* Vocabulario cerrado en la base y no solo en el formulario: una pantalla
   nueva que escriba «candidata» —que es como se dice en voz alta— metería una
   cuarta situación que ningún recuento vería, y las candidatas dejarían de
   salir en su sección sin que nada se queje.
   El valor es `explorando` y no `candidata` a propósito: describe lo que está
   pasando (se la está yendo a ver) y no una etiqueta sobre la persona. */
alter table postulacion_reparto drop constraint if exists postulacion_reparto_situacion;
alter table postulacion_reparto add constraint postulacion_reparto_situacion
  check (situacion in ('explorando','confirmada','descartada'));

/* Cuándo se decidió. Sin fecha, «descartada» es un estado sin historia: dentro
   de un año nadie sabrá si se descartó antes o después del rodaje, que es la
   diferencia entre «no encajaba» y «no quiso». Se rellena sola al cambiar de
   situación desde la aplicación; las filas viejas se quedan sin ella, que es
   la verdad —no sabemos cuándo se confirmaron—. */
alter table postulacion_reparto add column if not exists situacion_en date;

/* SIN índice por `situacion`. La pantalla trae TODAS las filas del fondo y las
   reparte en JavaScript —son veinte, no veinte mil—, así que ninguna consulta
   filtra por esta columna: `idx_reparto_post(postulacion_id, orden)` ya cubre
   la única lectura que hay. Un índice que nadie usa no acelera nada y encarece
   cada escritura. Si algún día se pide «las candidatas de todos los fondos»,
   ese es el momento de crearlo, y entonces se sabrá con qué columnas. */

-- ── VERIFICACIÓN ──
--  Todo filtrado por esquema, incluida la constraint (`connamespace`): un
--  homónimo en otro esquema daría 2 y el resultado esperado fallaría sin que
--  nada estuviera mal.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'postulacion_reparto'
       and column_name = 'situacion')                                    as columna,
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'postulacion_reparto'
       and column_name = 'situacion')                                    as admite_nulos,
  (select count(*) from pg_constraint
     where conname = 'postulacion_reparto_situacion'
       and connamespace = 'public'::regnamespace)                        as guarda,
  (select count(*) from postulacion_reparto where situacion is null)     as sin_situacion,
  situacion, count(*) as filas
from postulacion_reparto
group by situacion
order by situacion;
-- columna = 1 · admite_nulos = NO · guarda = 1 · sin_situacion = 0
-- Y una fila por situación. Se agrupa en vez de contar cada valor por separado
-- porque así se ve el reparto de TODOS los fondos que tengas cargados: poner
-- aquí «confirmadas = 5» sería mentira en cuanto haya un segundo fondo, y quien
-- lo corriera no sabría si algo falló.
