-- ============================================================
--  Anticipación por tipo de hito + avisos en estado imposible
-- ============================================================

-- ------------------------------------------------------------
-- PASO 1 · Cada hito avisa según lo que exige de ustedes
--
--  Todos se importaban con dias_anticipacion = 7 (actions.ts:597),
--  así que "Cierre de postulación" —donde hay que entregar una carpeta—
--  y "Revisión de postulaciones" —donde DAFO revisa y ustedes miran—
--  avisaban igual. Siete días para entregar es poco; siete días para
--  mirar es ruido.
-- ------------------------------------------------------------
update cronograma_actividades set dias_anticipacion = 15
 where clase = 'hito_externo' and nombre ilike '%cierre de postulaci%';

update cronograma_actividades set dias_anticipacion = 10
 where clase = 'hito_externo'
   and (nombre ilike '%evaluaci%' or nombre ilike '%jurado%');

-- Informativos: apertura, revisión, finalistas, ganadores
update cronograma_actividades set dias_anticipacion = 2
 where clase = 'hito_externo'
   and nombre not ilike '%cierre de postulaci%'
   and nombre not ilike '%evaluaci%'
   and nombre not ilike '%jurado%';

-- Ver cómo quedó
select nombre, dias_anticipacion, count(*) as hitos
  from cronograma_actividades
 where clase = 'hito_externo'
 group by 1, 2 order by 2 desc, 1;


-- ------------------------------------------------------------
-- PASO 2 · Los avisos que el bot dejó en 'en_progreso'
--
--  Un aviso no se trabaja: está vigente, o archivado. `en_progreso`
--  no es una opción suya en la interfaz, así que el combo mostraba
--  "📢 Vigente" mientras la base decía otra cosa —y al tocarlo, el
--  estado cambiaba solo—. Además engordaban el contador de "En
--  progreso" del Kanban y de la ronda matutina con trabajo que nadie
--  estaba trabajando.
-- ------------------------------------------------------------
select id, titulo, estado, creado_en   -- 👀 mira primero
  from publicaciones
 where tipo = 'aviso' and estado = 'en_progreso';

-- update publicaciones set estado = 'abierta'
--  where tipo = 'aviso' and estado = 'en_progreso';


-- ------------------------------------------------------------
-- PASO 3 · Que no vuelva a pasar: en qhaway_matutino(), la línea
--
--     'en_progreso', coalesce(r.fecha_fin, r.fecha_inicio))
--
--  debe pasar a
--
--     case when es_hito then 'abierta' else 'en_progreso' end,
--     coalesce(r.fecha_fin, r.fecha_inicio))
--
--  (La función completa hay que reemplazarla entera; el cambio es
--   esa sola línea del insert into publicaciones.)
-- ------------------------------------------------------------
