-- ============================================================
-- CV PRESENTADO — el CV es del expediente, no de la persona.
--
-- Hasta ahora la postulación INFERÍA qué CV le servía: cruzaba el
-- cargo de cada fila del equipo contra el enfoque de los CVs
-- generales de la persona (regla de prefijo) y calculaba vigencia
-- por días (DIAS_CV). Eso deja al expediente sin dueño de sus
-- documentos: si el CV general cambia o se borra, el histórico
-- «cambia» retroactivamente.
--
-- Doctrina, matizada: la hoja de vida GENERAL es identidad de la
-- persona (objetos tipo='cv'); el CV PRESENTADO es expediente de
-- la postulación — nace para un concurso, con un rol, y se archiva
-- con él, como el precontrato. La persona sigue referenciada,
-- nunca copiada: aquí solo vive la referencia a Drive.
--
-- Grano exacto ya existente: postulacion_equipo = postulación ×
-- persona × cargo. El CV es un atributo de esa fila.
--
-- Validación tras este cambio: binaria (la fila tiene cv_url o
-- no). La regla de prefijo NO se borra: se degrada a sugerencia
-- («esta persona tiene CV general de Productor/a — úsalo como
-- base») y sigue informando la ficha de proyecto, donde no hay
-- fila de postulación.
--
-- Sin backfill A PROPÓSITO: un CV general no ES un CV presentado;
-- poblar cv_url desde los generales falsearía el expediente. Las
-- postulaciones históricas quedan sin CV de fila — es la verdad:
-- no se archivó cuál se presentó.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table postulacion_equipo add column if not exists cv_url text;
alter table postulacion_equipo add column if not exists cv_actualizado date;

comment on column postulacion_equipo.cv_url is
  'CV presentado en ESTA postulación para ESTE cargo (referencia a Drive). No confundir con los CVs generales de la persona (objetos tipo=cv): esos son identidad; este es expediente. Sin backfill: histórico vacío = no se archivó.';
comment on column postulacion_equipo.cv_actualizado is
  'Cuándo se subió/rehízo el CV presentado. Informativo: un CV hecho para esta postulación no caduca (DIAS_CV no aplica aquí).';

-- Lápidas: columnas muertas confirmadas por auditoría (2026-07-29),
-- cero referencias en el código. No se borran todavía (misma
-- prudencia que personas.cv_url y persona_cv); se marcan para que
-- nadie las reviva por error. El drop va comentado:
comment on column postulacion_equipo.precontrato_url is
  'LEGADO — no usar. Los precontratos viven en postulaciones.precontratos (jsonb, ver db/precontratos.sql y lib/precontratos.ts).';
comment on column postulacion_equipo.remuneracion is
  'LEGADO — no usar. El monto del equipo se deriva del presupuesto (item_ids del precontrato), nunca se guarda aquí.';
-- Cuando lleve semanas sin reclamos:
-- alter table postulacion_equipo drop column if exists precontrato_url;
-- alter table postulacion_equipo drop column if exists remuneracion;

-- Verificación:
select
  (select count(*) from information_schema.columns
    where table_name = 'postulacion_equipo' and column_name = 'cv_url')         as tiene_cv_url,
  (select count(*) from information_schema.columns
    where table_name = 'postulacion_equipo' and column_name = 'cv_actualizado') as tiene_cv_actualizado;
