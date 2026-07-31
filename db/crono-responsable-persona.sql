-- ============================================================
-- RESPONSABLE DEL EQUIPO DE POSTULACIÓN
--
-- Hasta ahora `cronograma_actividades.responsable` apuntaba a `perfiles`: las
-- CUENTAS del sistema, la gente que inicia sesión. Sirve para el cronograma de
-- un proyecto o de una convocatoria, que es trabajo interno.
--
-- Pero el cronograma de una POSTULACIÓN lo ejecuta el equipo que se presenta al
-- concurso, y ese equipo vive en `postulacion_equipo` → `personas`, con su
-- cargo. En PO-040 · HexaFill, cinco de los ocho son «colaborador» o
-- «colaborador eventual»: gente que no tiene cuenta ni la va a tener. El
-- desplegable de responsable les ofrecía los usuarios del sistema, o sea las
-- personas equivocadas, sin ninguna señal de que estaba mal.
--
-- No se reutiliza la columna existente ni se «arregla» la referencia: un perfil
-- y una persona son cosas distintas —uno entra al sistema, la otra existe en la
-- base—, y los cronogramas de proyecto siguen necesitando el perfil. Columna
-- aparte, cada una apuntando a lo suyo.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table cronograma_actividades
  add column if not exists responsable_persona uuid references personas(id);

create index if not exists idx_crono_resp_persona
  on cronograma_actividades(responsable_persona);

comment on column cronograma_actividades.responsable_persona is
  'Responsable cuando la actividad cuelga de una POSTULACIÓN: una persona del '
  'equipo que postula (postulacion_equipo), que puede no tener cuenta en el '
  'sistema. Para cronogramas de proyecto/convocatoria se usa `responsable`, '
  'que apunta a perfiles. Una fila usa una o la otra, nunca las dos.';

-- Verificación
select
  (select count(*) from information_schema.columns
    where table_name = 'cronograma_actividades'
      and column_name = 'responsable_persona')                       as columna,
  (select count(*) from pg_indexes
    where tablename = 'cronograma_actividades'
      and indexname = 'idx_crono_resp_persona')                      as indice;
