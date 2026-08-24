-- ============================================================
--  db/crono-arreglar-po003.sql — DESHACER LA DUPLICACION DE CHACCU
--  PO-003 · Chaccu: Entre Lana y Tradicion en Pomacanchi · 2024
--
--  Hoy este fondo tiene 36 filas de cronograma: las MISMAS 18 actividades dos
--  veces, con dos duenios distintos.
--    · 18 en `postulacion_id` — nombres cortos, del 01/08/2024 al 24/05/2025.
--      Es lo que se presento a DAFO.
--    · 18 en `proyecto_id`    — nombres descriptivos, del 01/09/2024 al
--      30/09/2025. Es la reprogramacion de la ejecucion, estirada hasta el
--      plazo (que vencia el 11/09/2025).
--  Nadie lo hizo mal a proposito: se ve bien en las dos pantallas. Pero son
--  dos verdades sobre cuando se rodo, y la proxima vez que alguien mueva una
--  fecha la mueve en una sola.
--
--  ── QUE HACE ESTE ARCHIVO ──
--  Deja UNA lista viva y UNA foto, que es el modelo del sistema:
--    1. Congela las 18 de la postulacion como `version_fondo` tipo
--       'cronograma', etiqueta 'Postulado'. Es la prueba de que se prometio.
--    2. Borra esas 18 filas vivas — ya son foto.
--    3. Mueve las 18 del proyecto a `postulacion_id`: pasan a ser el
--       cronograma vivo del fondo.
--  Y despues, aparte, guarda la reprogramada como version 'Reformulado'
--  vigente, para que quede el par completo: lo prometido y lo que se ejecuta.
--
--  ── POR QUE LOS TRES PASOS VAN EN UNA SOLA SENTENCIA ──
--  Porque el paso 2 borra. Si el archivo se corriera a medias —una seleccion
--  en el editor, un paso que se salta— y el borrado ocurriera sin que la foto
--  se hubiera guardado, se perderia el unico registro de que cronograma fue a
--  DAFO. Con CTEs que se modifican datos, los tres ocurren juntos o no ocurre
--  ninguno: `borradas` depende de que `guardada` haya devuelto una fila, y el
--  `update` depende de que `borradas` haya devuelto las suyas.
--  El paso 4 va suelto a proposito: solo lee y escribe una foto mas. Si no
--  llegara a correr, no se pierde nada.
--
--  ── COMPROBADO ANTES DE ESCRIBIR ESTO (24/08/2026) ──
--  Las 18 de la postulacion: 0 con caso, 0 materializadas, 0 finalizadas,
--  0 canceladas, 0 sin fecha. Por eso se pueden BORRAR: no hay ningun hilo de
--  caso que romper. Si alguna hubiera tenido caso, habria que jubilarla como
--  'cancelada' en vez de borrarla.
--  Las 18 del proyecto: 0 con caso, 0 canceladas, 0 sin fecha, y todas son
--  actividades del documental (investigacion, rodaje, postproduccion, entrega
--  a DAFO) — ninguna es una cobertura contratada, que es lo unico que
--  legitimamente vive en `proyecto_id`.
--  Versiones ya guardadas: NINGUNA. Y `cronograma_postulado` esta vacio.
--
--  ⚠ NO REUTILIZAR ESTE ARCHIVO PARA OTRO FONDO sin repetir esas cuatro
--    comprobaciones. Aqui se borra: un barrido a ciegas por `proyecto_id`
--    puede llevarse una cobertura contratada al fondo, o borrar filas con
--    casos vivos.
--
--  Correr en: Supabase -> SQL Editor. De arriba abajo.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · ANTES
--     Tiene que decir 18 y 18. Si no, PARA: algo cambio desde el diagnostico.
-- ------------------------------------------------------------
select count(*) filter (where ca.postulacion_id = p.id)       as en_la_postulacion,
       count(*) filter (where ca.proyecto_id = p.proyecto_id) as en_el_proyecto,
       count(*) filter (where ca.publicacion_id is not null)  as con_caso,
       (select count(*) from version_fondo v
         where v.postulacion_id = p.id and v.tipo = 'cronograma') as versiones
  from postulaciones p
  join cronograma_actividades ca
    on ca.postulacion_id = p.id or ca.proyecto_id = p.proyecto_id
 where p.codigo = 'PO-003'
 group by p.id, p.proyecto_id;

-- ------------------------------------------------------------
-- 2 · CONGELAR + BORRAR + MOVER, todo junto
--
--     La foto se arma con el MISMO shape que genera la aplicacion
--     (`fotoVivaDelFondo` en app/actions.ts): un arreglo de
--     {nombre, etapa, fecha_inicio, fecha_fin, responsable, descripcion},
--     ordenado por etapa/orden/fecha_inicio/creado_en, sin canceladas y sin
--     filas sin fecha. Si el shape no coincidiera, la pantalla de versiones
--     mostraria una foto vacia sin dar ningun error.
--
--     El responsable se resuelve de las DOS columnas: `responsable_persona`
--     (el equipo que postula, ver db/crono-responsable-persona.sql) y
--     `responsable` (cuenta del sistema). La aplicacion usa una u otra segun
--     la pantalla; aqui se toma la que este.
-- ------------------------------------------------------------
with po as (
  select id, proyecto_id from postulaciones where codigo = 'PO-003'
),
/* ── EL SEGURO CONTRA LA SEGUNDA CORRIDA ──
   Sin esto, volver a correr el archivo es catastrofico y silencioso: ya no
   quedarian filas en el proyecto, asi que congelaria las 18 REPROGRAMADAS
   como si fueran «Postulado», las borraria, y el `update` no encontraria nada
   que mover. El fondo quedaria con CERO actividades y una foto que miente.
   Lo encontro la prueba, no la lectura.
   Se exige entonces que siga habiendo algo que mover Y que no exista ya una
   version de cronograma. Con cualquiera de las dos bastaria; van las dos
   porque este archivo borra. */
listo as (
  select po.id, po.proyecto_id
    from po
   where exists (select 1 from cronograma_actividades c
                  where c.proyecto_id = po.proyecto_id)
     and not exists (select 1 from version_fondo v
                      where v.postulacion_id = po.id and v.tipo = 'cronograma')
),
foto as (
  select jsonb_agg(
           jsonb_build_object(
             'nombre',       ca.nombre,
             'etapa',        ca.etapa,
             'fecha_inicio', ca.fecha_inicio,
             'fecha_fin',    ca.fecha_fin,
             'responsable',  coalesce(pe.alias, pe.nombre, pf.nombre),
             'descripcion',  ca.descripcion)
           order by ca.etapa, ca.orden, ca.fecha_inicio, ca.creado_en) as datos
    from cronograma_actividades ca
    join listo on ca.postulacion_id = listo.id
    left join personas pe on pe.id = ca.responsable_persona
    left join perfiles pf on pf.id = ca.responsable
   where ca.estado <> 'cancelada' and ca.fecha_inicio is not null
),
guardada as (
  insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente)
  select listo.id, 'cronograma', 'Postulado',
         'Cronograma presentado a DAFO. Estaba como filas vivas y podia editarse '
         'sin querer; se congela aqui, que es donde no se toca. Recuperado el '
         '24/08/2026 al deshacer la duplicacion (habia dos cronogramas para este '
         'fondo, uno en la postulacion y otro en el proyecto).',
         foto.datos, false
    from listo, foto
   where foto.datos is not null
  returning id
),
borradas as (
  -- Solo si la foto quedo guardada. Sin el `exists`, un fallo al insertar
  -- dejaria el borrado en pie y la prueba de lo presentado se perderia.
  delete from cronograma_actividades ca
   using listo
   where ca.postulacion_id = listo.id
     and exists (select 1 from guardada)
  returning ca.id
)
-- Y solo si el borrado ocurrio: si no, quedarian 36 filas colgando de la
-- postulacion (las 18 viejas mas las 18 movidas).
update cronograma_actividades ca
   set postulacion_id = listo.id,
       proyecto_id    = null
  from listo
 where ca.proyecto_id = listo.proyecto_id
   and exists (select 1 from borradas);

-- ------------------------------------------------------------
-- 3 · LA REPROGRAMADA, COMO VERSION VIGENTE
--     Ahora las filas vivas son las 18 movidas. Se guarda su foto con
--     etiqueta 'Reformulado' y vigente = true: es la que manda para rendir.
--     `on conflict do nothing` sobre el indice de vigente: si ya hubiera una
--     vigente de este tipo, no se pisa.
-- ------------------------------------------------------------
insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente)
select p.id, 'cronograma', 'Reformulado',
       'Cronograma de ejecucion, con las fechas corridas hasta el plazo del acta. '
       'Vivia colgado del proyecto y se movio a la postulacion el 24/08/2026: el '
       'cronograma de un fondo no vive en la pagina del proyecto.',
       x.datos, true
  from postulaciones p
 cross join lateral (
   select jsonb_agg(
            jsonb_build_object(
              'nombre',       ca.nombre,
              'etapa',        ca.etapa,
              'fecha_inicio', ca.fecha_inicio,
              'fecha_fin',    ca.fecha_fin,
              'responsable',  coalesce(pe.alias, pe.nombre, pf.nombre),
              'descripcion',  ca.descripcion)
            order by ca.etapa, ca.orden, ca.fecha_inicio, ca.creado_en) as datos
     from cronograma_actividades ca
     left join personas pe on pe.id = ca.responsable_persona
     left join perfiles pf on pf.id = ca.responsable
    where ca.postulacion_id = p.id
      and ca.estado <> 'cancelada' and ca.fecha_inicio is not null) x
 where p.codigo = 'PO-003'
   and x.datos is not null
on conflict do nothing;

-- ------------------------------------------------------------
-- 4 · VERIFICAR
--     `en_la_postulacion` = 18 · `en_el_proyecto` = 0 · `con_dos_duenios` = 0
-- ------------------------------------------------------------
select count(*) filter (where ca.postulacion_id = p.id)        as en_la_postulacion,
       count(*) filter (where ca.proyecto_id = p.proyecto_id)  as en_el_proyecto,
       count(*) filter (where ca.postulacion_id is not null
                         and ca.proyecto_id is not null)       as con_dos_duenios,
       min(ca.fecha_inicio) as desde, max(ca.fecha_fin) as hasta
  from postulaciones p
  join cronograma_actividades ca
    on ca.postulacion_id = p.id or ca.proyecto_id = p.proyecto_id
 where p.codigo = 'PO-003'
 group by p.id, p.proyecto_id;

-- Las dos fotos: 'Postulado' (no vigente) y 'Reformulado' (vigente), 18 cada una.
select v.etiqueta, v.vigente, jsonb_array_length(v.datos) as actividades,
       v.datos->0->>'nombre' as primera, v.datos->-1->>'nombre' as ultima
  from version_fondo v
  join postulaciones p on p.id = v.postulacion_id
 where p.codigo = 'PO-003' and v.tipo = 'cronograma'
 order by v.vigente, v.creado_en;
