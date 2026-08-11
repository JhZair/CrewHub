-- ============================================================
--  db/subcat-luz-continua.sql
--
--  «Luz Continua» no es una subcategoría: es la categoría entera.
--
--  El panel, el COB, el tubo y el aro son todos luz continua —lo único
--  que no lo sería es un flash, y no hay—. Filtrar «Luz Continua»
--  devuelve lo mismo que filtrar «iluminación», así que no separa nada.
--
--  Además está escrita a mano: no está en SUBCATS_EQUIPO, así que el
--  desplegable no la ofrece. Quien clasifique el siguiente panel elegirá
--  «Panel LED», y el mismo equipo quedará repartido en dos subcategorías
--  sin que nada falle.
--
--  ⚠ NO se migra a ciegas. «Luz Continua» pudo ponerse sobre un panel,
--    sobre un COB o sobre un tubo, y cada uno va a un sitio distinto.
--    El paso 1 los saca con su nombre para decidir uno por uno.
-- ============================================================

-- ── 1. QUÉ HAY (no toca nada) ──
select folio, nombre, categoria, subcategoria, estado
from equipamiento
where lower(trim(subcategoria)) = 'luz continua'
order by nombre, folio;

-- ── 2. LOS PANELES ──
-- Aputure Amaran H528 y cualquier otra matriz plana de LEDs. Ajusta el
-- `in (...)` con los folios que el paso 1 confirme que son paneles.
-- update equipamiento
--    set subcategoria = 'Panel LED'
--  where folio in ('A-034');

-- ── 3. LOS QUE NO SEAN PANEL ──
-- Un COB (foco con montura Bowens) va a 'Luz COB / Foco LED'; un tubo o
-- una luz de mano, a 'Luz de mano / Tubo'. Mismo gesto, otro destino:
-- update equipamiento
--    set subcategoria = 'Luz COB / Foco LED'
--  where folio in ('');

-- ── 4. COMPROBAR: tiene que dar 0 ──
select count(*) as quedan_en_luz_continua
from equipamiento
where lower(trim(subcategoria)) = 'luz continua';

/* Si quedan y ya no sabes cuáles son, en la aplicación:
   /equipamiento?c=iluminación  → el chip «Luz Continua» sale al final de
   la fila de subcategorías, en gris, con el aviso de «escrita a mano».
   Ese es el sitio donde estas cosas se ven sin buscarlas. */
