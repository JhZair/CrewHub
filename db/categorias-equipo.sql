-- ============================================================
--  db/categorias-equipo.sql — ORDENAR LAS CATEGORÍAS DE EQUIPO
--
--  La lista vieja tenía dos problemas distintos:
--
--  1. HUÉRFANAS. `soporte`, `tripode`, `audio`, `grabadora portátil` y
--     `monopod` estaban en los DATOS pero no en el desplegable del
--     formulario: entraron por la importación del CSV y la aplicación no
--     podía volver a escribirlas. Treinta y un equipos con una categoría
--     que el desplegable no ofrecía: el formulario la conserva —la enseña
--     como «(valor actual)»— pero nadie podía ponérsela a un equipo nuevo,
--     así que el inventario se partía en dos vocabularios, el importado y
--     el que se escribe hoy.
--
--  2. SOLAPAMIENTOS. Categorías que eran subcategorías de otra:
--       tripode / monopod  ⊂  soporte
--       audio / grabadora portátil  ⊂  sonido
--       pc_accesorios  ⊂  cómputo
--     Cuando una categoría es hija de otra, el mismo objeto cae en las dos
--     según quién lo cargue, y buscar «trípode» deja fuera la mitad.
--
--  ── LO QUE ESTE ARCHIVO NO HACE ──
--  No toca «sin categoría» ni «otro». Ahí hay 21 equipos y decidir por
--  ellos desde una consulta sería inventar: hay que mirarlos uno a uno.
--  El paso 3 los lista para eso.
--
--  ⚠ CORRE PRIMERO EL PASO 1 (solo cuenta). Lo que sale ahí es lo que va
--    a cambiar el paso 2. Idempotente: re-correrlo no vuelve a mover nada
--    porque las categorías viejas ya no existen.
-- ============================================================

-- ── 1. QUÉ SE VA A MOVER (no toca nada) ──
select coalesce(categoria, '(sin categoría)') as categoria_actual,
       count(*)                               as equipos,
       case lower(coalesce(categoria, ''))
         when 'micrófono' then 'sonido'
         when 'microfono' then 'sonido'
         when 'audio' then 'sonido'
         when 'grabadora portátil' then 'sonido'
         when 'grabadora portatil' then 'sonido'
         when 'tripode' then 'soporte'
         when 'trípode' then 'soporte'
         when 'monopod' then 'soporte'
         when 'monopié' then 'soporte'
         when 'pc_accesorios' then 'cómputo'
         when 'pc accesorios' then 'cómputo'
         else '— se queda igual —'
       end                                    as pasa_a
  from equipamiento
 group by 1, 3
 order by 2 desc;

-- ── 2. MOVER ──
/* La subcategoría se rellena SOLO si estaba vacía. Sobrescribirla borraría
   lo que alguien escribió a mano —«Rode VideoMic NTG» tiene su subcategoría
   puesta, y ponerle «Grabadora de audio» por venir de la categoría vieja
   sería empeorar el dato con una migración—. */

-- audio / grabadora portátil / micrófono → sonido
update equipamiento
   set categoria = 'sonido',
       subcategoria = coalesce(nullif(btrim(subcategoria), ''),
         case lower(categoria)
           when 'grabadora portátil' then 'Grabadora de audio'
           when 'grabadora portatil' then 'Grabadora de audio'
           when 'micrófono' then 'Micrófono de cañón'
           when 'microfono' then 'Micrófono de cañón'
           else null end)
 where lower(coalesce(categoria, '')) in
   ('micrófono', 'microfono', 'audio', 'grabadora portátil', 'grabadora portatil');

-- tripode / monopod → soporte
update equipamiento
   set categoria = 'soporte',
       subcategoria = coalesce(nullif(btrim(subcategoria), ''),
         case lower(categoria)
           when 'monopod' then 'Monopié'
           when 'monopié' then 'Monopié'
           else 'Trípode' end)
 where lower(coalesce(categoria, '')) in ('tripode', 'trípode', 'monopod', 'monopié');

-- pc_accesorios → cómputo
update equipamiento
   set categoria = 'cómputo'
 where lower(coalesce(categoria, '')) in ('pc_accesorios', 'pc accesorios');

-- ── 3. LO QUE HAY QUE MIRAR A MANO ──
/* «sin categoría» y «otro» no se tocan desde aquí: son 21 equipos y
   adivinar su categoría por el nombre es exactamente cómo se llenó de
   basura la lista vieja. Esta consulta los saca con su nombre para
   clasificarlos de a uno en la aplicación. */
select folio, nombre, coalesce(categoria, '(sin categoría)') as categoria, estado
  from equipamiento
 where categoria is null or btrim(categoria) = '' or lower(categoria) = 'otro'
 order by folio;

-- ── 4. VERIFICACIÓN — no debe quedar ninguna categoría fuera de la lista ──
select categoria, count(*) as equipos
  from equipamiento
 where categoria is not null and btrim(categoria) <> ''
   and categoria not in ('cámara','drone','sonido','iluminación','soporte',
                         'energía','cómputo','producción','camping','otro')
 group by 1 order by 2 desc;
-- Sin filas = todas las categorías existen en el formulario.
