-- ============================================================
--  db/crono-po002.sql — EL CRONOGRAMA DE LINDERAJE, CADA COSA EN SU SITIO
--  PO-002 · Linderaje: Raices de Armonia · 2024
--  Acta 178-2024-DAFO · desembolso 24/12/2024 · plazo 24/12/2026
--
--  Hace tres cosas, en una sola sentencia:
--    1. Carga la FOTO de lo postulado: 46 actividades, del 01/09/2024 al
--       31/08/2026. No existia en la base — nunca se cargo.
--    2. Mueve las 23 filas vivas de `proyecto_id` a `postulacion_id`: son la
--       ejecucion del fondo y su sitio es la postulacion, no el proyecto.
--    3. Guarda esas 23 como version `Reformulado` vigente, para que quede el
--       par completo: lo prometido y lo que se ejecuta.
--
--  ── DE DONDE SALEN LAS 46 ──
--  De `Temporal/registroFicha.htm`, la ficha guardada de la Plataforma Virtual
--  de Tramites. Se leyo la tabla `tbl_cronograma`, NO las capturas de pantalla.
--  Cada fila del formato trae un campo oculto `mesesCro` con los meses
--  marcados, ademas de las celdas pintadas: son dos registros independientes
--  del mismo dato y COINCIDEN EN LAS 46. Ademas: ninguna actividad sin mes
--  marcado, y ninguna con meses NO contiguos —que en un Gantt serian dos
--  eventos y no una barra larga, el error concreto que hubo que deshacer en
--  PO-040—.
--  Convencion de fechas (CARGAR-CRONOGRAMA.md): el formato solo marca MESES,
--  asi que cada actividad ocupa los meses completos — dia 1 del primero al
--  ultimo dia del ultimo.
--
--  ── LAS 23 VIVAS SE MUEVEN, NO SE TOCAN ──
--  Tres tienen CASO abierto (Culminacion del proyecto, Registro en Indecopi,
--  Revision final y ajustes tecnicos). Mover la fila conserva su
--  `publicacion_id`, asi que el caso no se rompe. Por eso aqui no se borra
--  nada: en PO-003 se pudo porque ninguna tenia caso; aqui no seria posible.
--  Se comprobo (24/08/2026) que las 23 son actividades del fondo —ninguna es
--  una cobertura contratada, que es lo unico que legitimamente vive en
--  `proyecto_id`— y que el proyecto tiene una sola postulacion.
--
--  ── LO QUE ESTA FOTO DEMUESTRA ──
--  Las cuatro obligaciones del acta —culminacion, devolucion a la ciudadania,
--  entrega del material final e informe anual— se prometieron TODAS para
--  agosto de 2026. En la ejecucion estan repartidas entre septiembre y
--  noviembre de 2026: despues. Siguen dentro del plazo (24/12/2026, clausula
--  7.2: dos anios desde la entrega del estimulo, verificado en el PDF del
--  acta), pero es un cambio de cronograma — y las clausulas 9.2 y 9.3 obligan
--  a informarlo y a que el MINISTERIO lo apruebe. Esta foto es la prueba de
--  contra que se compara.
--
--  ── SOBRE `cronograma_postulado_en` ──
--  Se graba con la fecha de HOY y no con una de 2024, porque es cuando se
--  tomo esta foto: se recupero de la plataforma en agosto de 2026. Poner una
--  fecha de 2024 sugeriria que se fijo al postular, que es justo lo que no
--  paso. El motivo de la version lo dice con todas sus letras.
--
--  Idempotente: exige que haya filas en el proyecto y que no exista ya una
--  version de cronograma. Correrlo dos veces no hace nada.
--  Correr en: Supabase -> SQL Editor. De arriba abajo.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · ANTES — 23 en el proyecto, 0 en la postulacion, 0 versiones, 3 con caso
-- ------------------------------------------------------------
select count(*) filter (where ca.proyecto_id = p.proyecto_id)   as en_el_proyecto,
       count(*) filter (where ca.postulacion_id = p.id)         as en_la_postulacion,
       count(*) filter (where ca.publicacion_id is not null)    as con_caso,
       (select count(*) from postulaciones p2
         where p2.proyecto_id = p.proyecto_id)                  as postulaciones_del_proyecto,
       (select count(*) from version_fondo v
         where v.postulacion_id = p.id and v.tipo = 'cronograma') as versiones,
       (select jsonb_array_length(coalesce(p3.cronograma_postulado,'[]'::jsonb))
          from postulaciones p3 where p3.id = p.id)             as foto_actual
  from postulaciones p
  join cronograma_actividades ca
    on ca.proyecto_id = p.proyecto_id or ca.postulacion_id = p.id
 where p.codigo = 'PO-002'
 group by p.id, p.proyecto_id;

-- ------------------------------------------------------------
-- 2 · LA FOTO + EL MOVIMIENTO + LA VERSION VIGENTE, todo junto
-- ------------------------------------------------------------
with po as (
  select id, proyecto_id from postulaciones where codigo = 'PO-002'
),
listo as (
  select po.id, po.proyecto_id
    from po
   where exists (select 1 from cronograma_actividades c
                  where c.proyecto_id = po.proyecto_id)
     and not exists (select 1 from version_fondo v
                      where v.postulacion_id = po.id and v.tipo = 'cronograma')
),
-- (a) La foto de lo postulado. 46 actividades leidas del HTML de la ficha.
postulada as (
  insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente)
  select listo.id, 'cronograma', 'Postulado',
         'Cronograma presentado a DAFO: 46 actividades, del 01/09/2024 al '
         '31/08/2026. Nunca se habia cargado. Recuperado el 24/08/2026 de la '
         'ficha de la Plataforma Virtual de Tramites (tabla tbl_cronograma), '
         'no de capturas: el campo oculto de meses marcados y las celdas '
         'pintadas coinciden en las 46 filas.',
         '[{"nombre": "Investigación documental y bibliográfica sobre la comunidad de Pongobamba y el linderaje.", "etapa": "preproduccion", "fecha_inicio": "2024-09-01", "fecha_fin": "2024-09-30", "responsable": null, "descripcion": null}, {"nombre": "Contacto inicial con líderes comunitarios y expertos locales.", "etapa": "preproduccion", "fecha_inicio": "2024-09-01", "fecha_fin": "2024-09-30", "responsable": null, "descripcion": null}, {"nombre": "Redacción del tratamiento y esquema general del documental.", "etapa": "preproduccion", "fecha_inicio": "2024-10-01", "fecha_fin": "2024-11-30", "responsable": null, "descripcion": null}, {"nombre": "Revisión y ajuste del tratamiento basado en comentarios de la comunidad y expertos.", "etapa": "preproduccion", "fecha_inicio": "2024-11-01", "fecha_fin": "2024-12-31", "responsable": null, "descripcion": null}, {"nombre": "Identificación de las locaciones clave en Pongobamba.", "etapa": "preproduccion", "fecha_inicio": "2024-12-01", "fecha_fin": "2024-12-31", "responsable": null, "descripcion": null}, {"nombre": "Realización de visitas preliminares a las locaciones.", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Planificación logística (transporte, alojamiento, permisos).", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Obtención de permisos de filmación y acuerdos con la comunidad.", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Elaboración del plan de rodaje detallado final, incluyendo cronograma diario y lista de equipos.", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Selección y contratación del equipo técnico y humano.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Ensayos con el equipo de filmación y pruebas de cámara en las locaciones.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Reunión de preproducción con todo el equipo para revisar el plan de rodaje.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Revisión final del tratamiento y ajustes según pruebas técnicas.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Preparación de un plan de contingencia para posibles imprevistos.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Llegada del equipo a Pongobamba y montaje de equipos.", "etapa": "produccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Filmación de tomas generales de la comunidad y entrevistas iniciales.", "etapa": "produccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Captura de las preparaciones para el linderaje y actividades diarias.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Filmación de la faena, preparación del lugar y rituales previos.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Filmación del día del linderaje, incluyendo ceremonias y actividades principales.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Entrevistas con participantes y miembros clave de la comunidad.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Captura de tomas adicionales y refuerzo de las secuencias clave.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Revisión del material filmado y tomas adicionales si es necesario.", "etapa": "produccion", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-04-30", "responsable": null, "descripcion": null}, {"nombre": "Desmontaje de equipos y despedida de la comunidad.", "etapa": "produccion", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-04-30", "responsable": null, "descripcion": null}, {"nombre": "Regreso del equipo a la base de operaciones.", "etapa": "produccion", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-04-30", "responsable": null, "descripcion": null}, {"nombre": "Filmación de cualquier secuencia adicional necesaria basada en la revisión del material.", "etapa": "produccion", "fecha_inicio": "2025-05-01", "fecha_fin": "2025-05-31", "responsable": null, "descripcion": null}, {"nombre": "Captura de planos de apoyo y recursos visuales adicionales.", "etapa": "produccion", "fecha_inicio": "2025-05-01", "fecha_fin": "2025-05-31", "responsable": null, "descripcion": null}, {"nombre": "Organización y selección de Material", "etapa": "postproduccion", "fecha_inicio": "2025-05-01", "fecha_fin": "2025-05-31", "responsable": null, "descripcion": null}, {"nombre": "Edición preliminar del documental, seleccionando las mejores tomas y secuencias.", "etapa": "postproduccion", "fecha_inicio": "2025-06-01", "fecha_fin": "2025-07-31", "responsable": null, "descripcion": null}, {"nombre": "Revisión intermedia del material editado con feedback del director y productor.", "etapa": "postproduccion", "fecha_inicio": "2025-08-01", "fecha_fin": "2025-08-31", "responsable": null, "descripcion": null}, {"nombre": "Edición avanzada enfocada en la narrativa y flujo del documental.", "etapa": "postproduccion", "fecha_inicio": "2025-08-01", "fecha_fin": "2025-10-31", "responsable": null, "descripcion": null}, {"nombre": "Incorporación de música y efectos de sonido preliminares.", "etapa": "postproduccion", "fecha_inicio": "2025-10-01", "fecha_fin": "2025-10-31", "responsable": null, "descripcion": null}, {"nombre": "Continuación de la edición avanzada y ajuste de la narrativa.", "etapa": "postproduccion", "fecha_inicio": "2025-10-01", "fecha_fin": "2025-11-30", "responsable": null, "descripcion": null}, {"nombre": "Diseño de sonido y mezcla preliminar.", "etapa": "postproduccion", "fecha_inicio": "2025-11-01", "fecha_fin": "2025-11-30", "responsable": null, "descripcion": null}, {"nombre": "Ajustes finales en la edición y mezcla de sonido.", "etapa": "postproduccion", "fecha_inicio": "2025-11-01", "fecha_fin": "2025-11-30", "responsable": null, "descripcion": null}, {"nombre": "Preparación de subtítulos y traducciones", "etapa": "postproduccion", "fecha_inicio": "2025-12-01", "fecha_fin": "2025-12-31", "responsable": null, "descripcion": null}, {"nombre": "Revisión final del documental por el director y productor.", "etapa": "postproduccion", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31", "responsable": null, "descripcion": null}, {"nombre": "Corrección de color y ajustes visuales detallados.", "etapa": "postproduccion", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-03-31", "responsable": null, "descripcion": null}, {"nombre": "Implementación de comentarios finales y ajustes definitivos.", "etapa": "postproduccion", "fecha_inicio": "2026-03-01", "fecha_fin": "2026-03-31", "responsable": null, "descripcion": null}, {"nombre": "Prueba de proyección y ajustes técnicos finales.", "etapa": "postproduccion", "fecha_inicio": "2026-03-01", "fecha_fin": "2026-03-31", "responsable": null, "descripcion": null}, {"nombre": "Exportación del documental en formatos necesarios.", "etapa": "postproduccion", "fecha_inicio": "2026-04-01", "fecha_fin": "2026-04-30", "responsable": null, "descripcion": null}, {"nombre": "Preparación de material promocional (trailers, afiches).", "etapa": "postproduccion", "fecha_inicio": "2026-04-01", "fecha_fin": "2026-06-30", "responsable": null, "descripcion": null}, {"nombre": "Organización de proyecciones locales en Pongobamba y otras comunidades relevantes.", "etapa": "postproduccion", "fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-31", "responsable": null, "descripcion": null}, {"nombre": "Culminación del proyecto", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}, {"nombre": "Acción de devolución a la ciudadanía", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}, {"nombre": "Entrega de material final al Ministerio de Cultura", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}, {"nombre": "Entrega del Informe Anual", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}]'::jsonb, false
    from listo
  returning id
),
-- (b) La misma foto, en la columna que lee el expediente.
encolumna as (
  update postulaciones p
     set cronograma_postulado    = '[{"nombre": "Investigación documental y bibliográfica sobre la comunidad de Pongobamba y el linderaje.", "etapa": "preproduccion", "fecha_inicio": "2024-09-01", "fecha_fin": "2024-09-30", "responsable": null, "descripcion": null}, {"nombre": "Contacto inicial con líderes comunitarios y expertos locales.", "etapa": "preproduccion", "fecha_inicio": "2024-09-01", "fecha_fin": "2024-09-30", "responsable": null, "descripcion": null}, {"nombre": "Redacción del tratamiento y esquema general del documental.", "etapa": "preproduccion", "fecha_inicio": "2024-10-01", "fecha_fin": "2024-11-30", "responsable": null, "descripcion": null}, {"nombre": "Revisión y ajuste del tratamiento basado en comentarios de la comunidad y expertos.", "etapa": "preproduccion", "fecha_inicio": "2024-11-01", "fecha_fin": "2024-12-31", "responsable": null, "descripcion": null}, {"nombre": "Identificación de las locaciones clave en Pongobamba.", "etapa": "preproduccion", "fecha_inicio": "2024-12-01", "fecha_fin": "2024-12-31", "responsable": null, "descripcion": null}, {"nombre": "Realización de visitas preliminares a las locaciones.", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Planificación logística (transporte, alojamiento, permisos).", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Obtención de permisos de filmación y acuerdos con la comunidad.", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Elaboración del plan de rodaje detallado final, incluyendo cronograma diario y lista de equipos.", "etapa": "preproduccion", "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31", "responsable": null, "descripcion": null}, {"nombre": "Selección y contratación del equipo técnico y humano.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Ensayos con el equipo de filmación y pruebas de cámara en las locaciones.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Reunión de preproducción con todo el equipo para revisar el plan de rodaje.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Revisión final del tratamiento y ajustes según pruebas técnicas.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Preparación de un plan de contingencia para posibles imprevistos.", "etapa": "preproduccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Llegada del equipo a Pongobamba y montaje de equipos.", "etapa": "produccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Filmación de tomas generales de la comunidad y entrevistas iniciales.", "etapa": "produccion", "fecha_inicio": "2025-02-01", "fecha_fin": "2025-02-28", "responsable": null, "descripcion": null}, {"nombre": "Captura de las preparaciones para el linderaje y actividades diarias.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Filmación de la faena, preparación del lugar y rituales previos.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Filmación del día del linderaje, incluyendo ceremonias y actividades principales.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Entrevistas con participantes y miembros clave de la comunidad.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Captura de tomas adicionales y refuerzo de las secuencias clave.", "etapa": "produccion", "fecha_inicio": "2025-03-01", "fecha_fin": "2025-03-31", "responsable": null, "descripcion": null}, {"nombre": "Revisión del material filmado y tomas adicionales si es necesario.", "etapa": "produccion", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-04-30", "responsable": null, "descripcion": null}, {"nombre": "Desmontaje de equipos y despedida de la comunidad.", "etapa": "produccion", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-04-30", "responsable": null, "descripcion": null}, {"nombre": "Regreso del equipo a la base de operaciones.", "etapa": "produccion", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-04-30", "responsable": null, "descripcion": null}, {"nombre": "Filmación de cualquier secuencia adicional necesaria basada en la revisión del material.", "etapa": "produccion", "fecha_inicio": "2025-05-01", "fecha_fin": "2025-05-31", "responsable": null, "descripcion": null}, {"nombre": "Captura de planos de apoyo y recursos visuales adicionales.", "etapa": "produccion", "fecha_inicio": "2025-05-01", "fecha_fin": "2025-05-31", "responsable": null, "descripcion": null}, {"nombre": "Organización y selección de Material", "etapa": "postproduccion", "fecha_inicio": "2025-05-01", "fecha_fin": "2025-05-31", "responsable": null, "descripcion": null}, {"nombre": "Edición preliminar del documental, seleccionando las mejores tomas y secuencias.", "etapa": "postproduccion", "fecha_inicio": "2025-06-01", "fecha_fin": "2025-07-31", "responsable": null, "descripcion": null}, {"nombre": "Revisión intermedia del material editado con feedback del director y productor.", "etapa": "postproduccion", "fecha_inicio": "2025-08-01", "fecha_fin": "2025-08-31", "responsable": null, "descripcion": null}, {"nombre": "Edición avanzada enfocada en la narrativa y flujo del documental.", "etapa": "postproduccion", "fecha_inicio": "2025-08-01", "fecha_fin": "2025-10-31", "responsable": null, "descripcion": null}, {"nombre": "Incorporación de música y efectos de sonido preliminares.", "etapa": "postproduccion", "fecha_inicio": "2025-10-01", "fecha_fin": "2025-10-31", "responsable": null, "descripcion": null}, {"nombre": "Continuación de la edición avanzada y ajuste de la narrativa.", "etapa": "postproduccion", "fecha_inicio": "2025-10-01", "fecha_fin": "2025-11-30", "responsable": null, "descripcion": null}, {"nombre": "Diseño de sonido y mezcla preliminar.", "etapa": "postproduccion", "fecha_inicio": "2025-11-01", "fecha_fin": "2025-11-30", "responsable": null, "descripcion": null}, {"nombre": "Ajustes finales en la edición y mezcla de sonido.", "etapa": "postproduccion", "fecha_inicio": "2025-11-01", "fecha_fin": "2025-11-30", "responsable": null, "descripcion": null}, {"nombre": "Preparación de subtítulos y traducciones", "etapa": "postproduccion", "fecha_inicio": "2025-12-01", "fecha_fin": "2025-12-31", "responsable": null, "descripcion": null}, {"nombre": "Revisión final del documental por el director y productor.", "etapa": "postproduccion", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31", "responsable": null, "descripcion": null}, {"nombre": "Corrección de color y ajustes visuales detallados.", "etapa": "postproduccion", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-03-31", "responsable": null, "descripcion": null}, {"nombre": "Implementación de comentarios finales y ajustes definitivos.", "etapa": "postproduccion", "fecha_inicio": "2026-03-01", "fecha_fin": "2026-03-31", "responsable": null, "descripcion": null}, {"nombre": "Prueba de proyección y ajustes técnicos finales.", "etapa": "postproduccion", "fecha_inicio": "2026-03-01", "fecha_fin": "2026-03-31", "responsable": null, "descripcion": null}, {"nombre": "Exportación del documental en formatos necesarios.", "etapa": "postproduccion", "fecha_inicio": "2026-04-01", "fecha_fin": "2026-04-30", "responsable": null, "descripcion": null}, {"nombre": "Preparación de material promocional (trailers, afiches).", "etapa": "postproduccion", "fecha_inicio": "2026-04-01", "fecha_fin": "2026-06-30", "responsable": null, "descripcion": null}, {"nombre": "Organización de proyecciones locales en Pongobamba y otras comunidades relevantes.", "etapa": "postproduccion", "fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-31", "responsable": null, "descripcion": null}, {"nombre": "Culminación del proyecto", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}, {"nombre": "Acción de devolución a la ciudadanía", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}, {"nombre": "Entrega de material final al Ministerio de Cultura", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}, {"nombre": "Entrega del Informe Anual", "etapa": "entrega", "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31", "responsable": null, "descripcion": null}]'::jsonb,
         cronograma_postulado_en = now()
    from listo
   where p.id = listo.id
     and exists (select 1 from postulada)
  returning p.id
),
-- (c) La version vigente: las 23 vivas, tal como estan hoy. Se lee de las
--     filas ANTES de moverlas — dentro de una misma sentencia las CTE ven el
--     estado anterior, y da igual: mover no les cambia las fechas.
viva as (
  select listo.id as pid,
         jsonb_agg(
           jsonb_build_object(
             'nombre',       ca.nombre,
             'etapa',        ca.etapa,
             'fecha_inicio', ca.fecha_inicio,
             'fecha_fin',    ca.fecha_fin,
             'responsable',  coalesce(pe.alias, pe.nombre, pf.nombre),
             'descripcion',  ca.descripcion)
           order by ca.etapa, ca.orden, ca.fecha_inicio, ca.creado_en) as datos
    from cronograma_actividades ca
    join listo on ca.proyecto_id = listo.proyecto_id
    left join personas pe on pe.id = ca.responsable_persona
    left join perfiles pf on pf.id = ca.responsable
   where ca.estado <> 'cancelada' and ca.fecha_inicio is not null
   group by listo.id
),
ejecutada as (
  insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente)
  select viva.pid, 'cronograma', 'Reformulado',
         'Cronograma de ejecucion, tal como esta hoy. Vivia colgado del '
         'proyecto y se movio a la postulacion el 24/08/2026: el cronograma de '
         'un fondo no vive en la pagina del proyecto. Es la version contra la '
         'que se rinde.',
         viva.datos, true
    from viva
   where viva.datos is not null
     and exists (select 1 from encolumna)
  returning id
)
-- (d) Y por fin el movimiento, solo si todo lo anterior ocurrio.
update cronograma_actividades ca
   set postulacion_id = listo.id,
       proyecto_id    = null
  from listo
 where ca.proyecto_id = listo.proyecto_id
   and exists (select 1 from ejecutada);

-- ------------------------------------------------------------
-- 3 · VERIFICAR
--     en_la_postulacion = 23 · en_el_proyecto = 0 · con_dos_duenios = 0
--     conservan_su_caso = 3
-- ------------------------------------------------------------
select count(*) filter (where ca.postulacion_id = p.id)         as en_la_postulacion,
       count(*) filter (where ca.proyecto_id = p.proyecto_id)   as en_el_proyecto,
       count(*) filter (where ca.postulacion_id is not null
                         and ca.proyecto_id is not null)        as con_dos_duenios,
       count(*) filter (where ca.publicacion_id is not null)    as conservan_su_caso
  from postulaciones p
  join cronograma_actividades ca
    on ca.postulacion_id = p.id or ca.proyecto_id = p.proyecto_id
 where p.codigo = 'PO-002';

-- Las dos fotos: Postulado (46, no vigente) y Reformulado (23, vigente).
select v.etiqueta, v.vigente, jsonb_array_length(v.datos) as actividades,
       (select min((e->>'fecha_inicio')::date) from jsonb_array_elements(v.datos) e) as desde,
       (select max((e->>'fecha_fin')::date)    from jsonb_array_elements(v.datos) e) as hasta
  from version_fondo v
  join postulaciones p on p.id = v.postulacion_id
 where p.codigo = 'PO-002' and v.tipo = 'cronograma'
 order by v.vigente;

-- Y la columna que lee el expediente: 46.
select jsonb_array_length(coalesce(cronograma_postulado,'[]'::jsonb)) as en_la_columna,
       cronograma_postulado_en
  from postulaciones where codigo = 'PO-002';
