-- Convocatorias: estados correctos (su propio ciclo de vida, NO el del fondo).
--
-- Antes se usaban por error los estados del fondo (postulacion, en_ejecucion,
-- rendicion_pendiente, cerrada). Los correctos son:
--   planificada → abierta → en_evaluacion → con_resultados → finalizada
--   (+ cancelada como salida)
--
-- No hay CHECK constraint ni enum en la columna (es text libre), así que solo
-- hay que cambiar el default y traducir los datos existentes.
--
-- Correr UNA vez en Supabase (SQL editor). Revisa el mapeo antes: es la mejor
-- traducción posible, pero tú conoces tus convocatorias — ajústalo si hace falta.

-- 1) Nuevo default (una convocatoria que registras suele estar ya recibiendo
--    postulaciones). El comentario documenta los valores válidos.
alter table convocatorias alter column estado set default 'abierta';
comment on column convocatorias.estado is
  'planificada | abierta | en_evaluacion | con_resultados | finalizada | cancelada';

-- 2) Traducir los valores viejos de las filas existentes.
update convocatorias set estado = case estado
  when 'postulacion'         then 'abierta'         -- recibía postulaciones
  when 'en_ejecucion'        then 'con_resultados'  -- ya había ganadores
  when 'rendicion_pendiente' then 'finalizada'      -- el concurso ya terminó
  when 'cerrada'             then 'finalizada'
  else estado
end
where estado in ('postulacion', 'en_ejecucion', 'rendicion_pendiente', 'cerrada');
