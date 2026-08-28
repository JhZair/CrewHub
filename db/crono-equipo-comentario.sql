-- ============================================================
--  db/crono-equipo-comentario.sql — CORREGIR UN COMENTARIO QUE ENGAÑA
--
--  `cronograma_actividades.equipo` se documentó como «ids de perfiles», y en el
--  cronograma de una POSTULACIÓN no lo son: son ids de `personas`, el equipo
--  que se presenta al concurso, que en buena parte no tiene cuenta en el
--  sistema. Es el mismo universo de ids que `responsable_persona` (ver
--  db/crono-responsable-persona.sql), y la columna hermana `responsable` sí es
--  de perfiles — por eso confunde tanto.
--
--  ── POR QUÉ MERECE UN ARCHIVO ──
--  No cambia ni un dato. Cambia lo que la base dice de sí misma, que es lo
--  primero que se lee cuando alguien va a tocarla. Un comentario desactualizado
--  miente con más autoridad que el código, porque parece la fuente.
--  Y ahora importa más: hasta hoy solo podía entrar ahí el equipo del
--  expediente; desde que la nómina del cronograma cruza las tres listas del
--  fondo, entra cinco veces más gente.
--
--  ── LO QUE NO SE ARREGLA AQUÍ ──
--  Que sea un `uuid[]` sin clave foránea: Postgres no puede ponerla sobre un
--  array. O sea que nada impide guardar un id que no existe; lo impide el
--  desplegable, que es una guarda de pantalla y no de base. Queda dicho.
--
--  ⚠ SIN transacción (lección pgBouncer). Idempotente: solo reescribe el texto.
-- ============================================================

comment on column cronograma_actividades.equipo is
  'Equipo de apoyo. En el cronograma de una POSTULACIÓN son ids de `personas` '
  '(el equipo que se presenta al concurso, en buena parte sin cuenta), igual '
  'que `responsable_persona`. En el de un proyecto o convocatoria son ids de '
  '`perfiles`, igual que `responsable`. Lista simple, sin cargo. '
  'Sin FK: Postgres no la admite sobre un array, así que la integridad la '
  'sostiene el desplegable de la pantalla y nada más.';

-- Verificación: debe devolver el texto nuevo.
select col_description('cronograma_actividades'::regclass,
         (select ordinal_position from information_schema.columns
           where table_name = 'cronograma_actividades' and column_name = 'equipo')
       ) as comentario;
