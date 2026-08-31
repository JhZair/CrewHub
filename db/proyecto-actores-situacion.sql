-- ============================================================
--  db/proyecto-actores-situacion.sql — CANDIDATO, CONFIRMADO, DESCARTADO
--
--  Lo mismo que db/reparto-situacion.sql hizo para el reparto de un FONDO,
--  ahora para el del PROYECTO. Y aquí hace más falta, no menos.
--
--  ── POR QUÉ EL PROYECTO NECESITA ESTO POR SU CUENTA ──
--  El reparto del fondo se explora contra un expediente que va al Ministerio.
--  Pero hay proyectos que NUNCA van a tener fondo DAFO: los de encargo y los
--  que se autofinancian. Khipukamaq es uno — está confirmado Jesús Ríos como
--  protagonista y falta identificar a quién más se graba. Esa exploración no
--  es el borrador de nada: es la lista de verdad, y hasta hoy no cabía en
--  ninguna parte. O metías a alguien como si ya estuviera dentro, o no lo
--  apuntabas.
--
--  ── POR QUÉ ES UNA SITUACIÓN Y NO UN PAPEL ──
--  Se podría escribir «Candidato» en `rol` y sacar un tercer grupo, que es lo
--  barato. Pero candidato no es un papel: es el ESTADO de una relación que va
--  a cambiar. Se es candidato A PROTAGONISTA, y ese «a qué» es justamente lo
--  que se explora. Metido en `rol`, el papel previsto no cabe en ningún sitio
--  y confirmar a alguien obliga a reescribírselo a mano — que es cuando se
--  pierde.
--     rol       → qué es (o sería) en la película
--     situacion → si ya está dentro
--
--  ── EL DEFAULT ES `confirmada`, Y NO ES POR COMODIDAD ──
--  Las filas cargadas hasta hoy entraron cuando esta columna no existía, y
--  todas son gente que YA está en el proyecto. Con default `explorando`,
--  correr esto las mandaría a todas a la sección de candidatos y los actores
--  sociales de cada proyecto aparecerían vacíos el lunes por la mañana.
--  El alta como candidato se pide explícitamente desde el botón, que es donde
--  esa decisión se toma.
--
--  ── LOS DESCARTADOS NO SE BORRAN ──
--  Saber a quién descartaste —y por qué, en la nota— evita volver a proponer a
--  la misma persona dentro de seis meses. En un documental de encuentro pasa:
--  alguien que no encajaba para un bloque encaja para otro.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
--  ⚠ Requiere db/proyecto-actores.sql y db/proyecto-personajes.sql corridos.
-- ============================================================

alter table proyecto_actores add column if not exists situacion text;

/* En tres pasos —añadir suelta, rellenar, y luego default y not null— y no en
   una sola sentencia. El estado final es el mismo; lo que cambia es que aquí
   se VE qué pasó con las filas que ya existían. Un `update` con su `where` en
   el archivo de migración es la única prueba, dentro de un año, de que los
   actores sociales que ya estaban se dieron por confirmados a propósito y no
   por el valor por defecto de una columna. */
update proyecto_actores set situacion = 'confirmada' where situacion is null;

alter table proyecto_actores alter column situacion set default 'confirmada';
alter table proyecto_actores alter column situacion set not null;

/* Vocabulario cerrado en la base y no solo en el formulario: una pantalla nueva
   que escriba «candidato» —que es como se dice en voz alta— metería una cuarta
   situación que ningún recuento vería, y los candidatos dejarían de salir en su
   sección sin que nada se queje.
   El valor es `explorando` y no `candidato` a propósito: describe lo que está
   pasando (se le está yendo a ver) y no una etiqueta sobre la persona.
   ⚠ Las MISMAS tres palabras que `postulacion_reparto`: son la misma pregunta
   en dos tablas, y con vocabularios distintos la regla compartida de
   lib/situacionReparto tendría que traducir, que es donde se pierde un valor. */
alter table proyecto_actores drop constraint if exists proyecto_actores_situacion;
alter table proyecto_actores add constraint proyecto_actores_situacion
  check (situacion in ('explorando','confirmada','descartada'));

/* Cuándo se decidió. Sin fecha, «descartado» es un estado sin historia: dentro
   de un año nadie sabrá si se descartó antes o después del rodaje, que es la
   diferencia entre «no encajaba» y «no quiso». Se rellena sola al cambiar de
   situación desde la aplicación; las filas viejas se quedan sin ella, que es la
   verdad — no sabemos cuándo se confirmaron. */
alter table proyecto_actores add column if not exists situacion_en date;

/* SIN índice por `situacion`. La ficha trae TODAS las filas del proyecto y las
   reparte en JavaScript —son veinte, no veinte mil—, así que ninguna consulta
   filtra por esta columna: `proyecto_actores_proyecto_idx` ya cubre la única
   lectura que hay. Un índice que nadie usa no acelera nada y encarece cada
   escritura. Si algún día se pide «los candidatos de todos los proyectos», ese
   es el momento de crearlo, y entonces se sabrá con qué columnas. */

comment on column proyecto_actores.situacion is
  'explorando | confirmada | descartada. Si esta persona ya está dentro del '
  'proyecto o todavía se está viendo. Mismo vocabulario que '
  'postulacion_reparto.situacion: es la misma pregunta en las dos tablas.';

-- ------------------------------------------------------------
-- VERIFICAR — `sin_situacion` tiene que ser 0, y `confirmados` tiene que
-- coincidir con las filas que había antes de correr esto (o sea: nadie se
-- convirtió en candidato por accidente).
-- ------------------------------------------------------------
select
  count(*)                                             as filas,
  count(*) filter (where situacion is null)            as sin_situacion,
  count(*) filter (where situacion = 'confirmada')     as confirmados,
  count(*) filter (where situacion = 'explorando')     as explorando,
  count(*) filter (where situacion = 'descartada')     as descartados,
  (select count(*) from information_schema.columns
    where table_name = 'proyecto_actores' and column_name = 'situacion_en') as tiene_fecha
  from proyecto_actores;
