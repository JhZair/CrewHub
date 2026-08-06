-- QUIÉN CREÓ CADA HITO/ACTIVIDAD DEL CRONOGRAMA
-- La tabla guardaba el «responsable» (a quién le toca) pero no el «autor» (quién
-- lo puso). Se muestra en la línea de tiempo del concurso y en el cronograma
-- editable. Las filas viejas quedan con creado_por = null (sin autor conocido).
alter table cronograma_actividades
  add column if not exists creado_por uuid references perfiles(id);
