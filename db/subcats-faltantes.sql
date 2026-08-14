-- ============================================================
--  SUBCATEGORÍAS QUE FALTABAN — asignación revisable
--
--  De dónde sale: /equipamiento?f=sin_subcategoria, los equipos que
--  aparecen en las capturas del 13 de agosto.
--
--  ── LEE ESTO ANTES DE CORRERLO ──
--  Esto NO es una migración de estructura: es una OPINIÓN sobre cómo se
--  clasifica cada cosa, escrita por quien no la ha tenido en la mano. El
--  paso 1 solo mira y te enseña la propuesta fila por fila para que puedas
--  discutirla; el paso 2 es el que escribe.
--
--  Dos seguros:
--
--  1. Solo toca lo que está VACÍO. `where subcategoria = ''` — si alguien ya
--     decidió una, esta propuesta no la pisa. Una clasificación puesta a mano
--     por quien conoce el equipo vale más que una deducida de un nombre.
--
--  2. Solo escribe subcategorías que EXISTEN en el catálogo de su categoría
--     (lib/entidades.ts). Si el paso 3 te dice que algo se quedó fuera, es
--     que falta correr la versión nueva del código, no que el equipo esté mal.
--
--  Requiere el catálogo ampliado (mismo commit): «Tira LED», «Linterna»,
--  «Control remoto de luz», «Altavoz / Parlante», «Soporte / Araña de
--  micrófono», «Memoria SD» (sonido), «Componente de PC», «Montura magnética».
--
--  Lo que se dejó FUERA a propósito:
--    · A-318 «Accesorios Aputure Amaran H528S» — «accesorios» no dice qué
--      hay dentro, y clasificar a ciegas es peor que dejarlo vacío: el hueco
--      se ve, una etiqueta equivocada no. Ábrelo, mira qué es y ponla desde
--      la lista con «＋ subcategoría».
-- ============================================================

-- ------------------------------------------------------------
--  La propuesta. `por_folio` distingue las dos formas de encontrar la fila:
--  por folio cuando el equipo es uno, y por nombre cuando son varias unidades
--  idénticas (las tiras LED, el soporte de manillar) que en la lista aparecen
--  apiladas y no tienen un folio único que citar.
-- ------------------------------------------------------------
--  ── POR QUÉ NO ES UNA TABLA TEMPORAL ──
--  Lo era, y estaba mal. Una `temporary ... on commit drop` muere al acabar la
--  transacción, y la instrucción de este mismo archivo es correr el paso 1
--  solo, mirarlo, y el paso 2 después: para entonces la tabla ya no existe y
--  el UPDATE no encuentra nada que aplicar. No fallaba con un error claro
--  —parecía que no había nada que cambiar—, que es la peor forma de fallar.
--  Tabla normal, y el paso 5 la borra.
drop table if exists subcat_propuesta;
create table subcat_propuesta(clave text, por_folio boolean, sub text);

insert into subcat_propuesta(clave, por_folio, sub) values
  -- ── CÁMARA — los accesorios magnéticos del Osmo Nano
  ('A-335', true,  'Montura magnética'),      -- Clip magnético para sombrero
  ('A-337', true,  'Montura magnética'),      -- Soporte adaptador magnético con rótula
  ('A-338', true,  'Montura magnética'),      -- Correa magnética Nano
  ('A-336', true,  'Case de cámara'),         -- Estuche de protección Nano

  -- ── CÓMPUTO
  ('A-109', true,  'Componente de PC'),       -- Tarjeta Madre Asus ROG Maximus z790

  -- ── ENERGÍA
  ('A-340', true,  'Cargador'),               -- Samsung 45W USB-C a USB-C

  -- ── ILUMINACIÓN
  ('A-345', true,  'Tira LED'),               -- Tira led neón ultramagic 5m RGB
  ('A-360', true,  'Luz de mano / Tubo'),     -- Barra de luz inalámbrica
  ('A-363', true,  'Linterna'),               -- Linterna recargable 7
  ('A-272', true,  'Case de luces'),          -- Maleta negra con línea naranja
  -- Las que vienen en varias unidades: por nombre.
  ('Panel Mano LED de Gestos',          false, 'Panel LED'),
  ('Tira Cinta LED RGB 2m con Control 8w', false, 'Tira LED'),
  ('Tira led guia luma 1m 2.4w',        false, 'Tira LED'),
  ('Tira LED 5m Control remoto infrarrojo', false, 'Tira LED'),
  ('Tira Led Multicolor 5m RGB',        false, 'Tira LED'),
  ('Control remoto digital d luces LED', false, 'Control remoto de luz'),

  -- ── PRODUCCIÓN — las tres fundas MOLLE de radio
  ('A-330', true,  'Pouch / bolsillo modular'),
  ('A-331', true,  'Pouch / bolsillo modular'),
  ('A-332', true,  'Pouch / bolsillo modular'),

  -- ── SONIDO
  ('A-271', true,  'Soporte / Araña de micrófono'),   -- RØDE SM7-R
  ('A-275', true,  'Soporte / Araña de micrófono'),   -- RØDE SM7-R
  ('A-277', true,  'Case de sonido'),                 -- Estuche de carcasa rígida
  ('A-329', true,  'Memoria SD'),                     -- microSD 32 GB del Zoom H1
  ('JBL EON715', false, 'Altavoz / Parlante'),

  -- ── SOPORTE
  ('A-166', true,  'Brazo mágico'),                   -- Mini brazo extensor de aluminio
  ('A-285', true,  'Placa de liberación rápida'),     -- Arca Swiss MINIFOCUS
  ('A-326', true,  'Placa de liberación rápida'),     -- Base adaptador Pocket 3 K&F
  ('Soporte de manillar de motocicleta tornillo de 1/4', false, 'Ventosa / Clamp');


-- ------------------------------------------------------------
-- 1 · MIRAR — qué se cambiaría, sin cambiar nada
--     Corre SOLO esto primero y lee la lista. Si algo no te cuadra, es más
--     barato discutirlo aquí que deshacerlo después.
-- ------------------------------------------------------------
select e.folio, e.nombre, e.categoria,
       coalesce(nullif(btrim(e.subcategoria), ''), '—') as ahora,
       p.sub as quedaria
  from equipamiento e
  join subcat_propuesta p
    on (p.por_folio and e.folio = p.clave)
    or (not p.por_folio and lower(btrim(e.nombre)) = lower(btrim(p.clave)))
 where coalesce(btrim(e.subcategoria), '') = ''
 order by e.categoria, e.folio;


-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     Descomenta y corre cuando el paso 1 te parezca bien.
-- ------------------------------------------------------------
-- update equipamiento e
--    set subcategoria = p.sub
--   from subcat_propuesta p
--  where coalesce(btrim(e.subcategoria), '') = ''
--    and ( (p.por_folio and e.folio = p.clave)
--       or (not p.por_folio and lower(btrim(e.nombre)) = lower(btrim(p.clave))) );


-- ------------------------------------------------------------
-- 3 · LO QUE NO ENCONTRÓ
--     Nada de esto es un error del sistema; son avisos de que un nombre
--     cambió o de que el equipo ya tenía subcategoría. Se dice en vez de
--     callarlo: una propuesta que aplica veinte de veintiocho filas y no
--     menciona las ocho restantes es peor que una que falla entera.
-- ------------------------------------------------------------
select p.clave, p.sub,
       case when p.por_folio then 'no hay equipo con ese folio'
            else 'no hay equipo con ese nombre exacto' end as por_que
  from subcat_propuesta p
 where not exists (
   select 1 from equipamiento e
    where (p.por_folio and e.folio = p.clave)
       or (not p.por_folio and lower(btrim(e.nombre)) = lower(btrim(p.clave))));


-- ------------------------------------------------------------
-- 4 · ¿QUÉ QUEDA SIN SUBCATEGORÍA?
--     El resto de los 58. Se rellenan desde la propia lista con el botón
--     «＋ subcategoría», que para eso se hizo — no hacen falta más scripts.
-- ------------------------------------------------------------
select categoria, count(*) as sin_subcategoria
  from equipamiento
 where coalesce(btrim(subcategoria), '') = ''
   and estado <> 'de_baja'
 group by categoria
 order by 2 desc;


-- ------------------------------------------------------------
-- 5 · LIMPIAR
--     Cuando el paso 1 y el 3 ya no tengan nada que decir, la propuesta
--     sobra: se borra para no dejar una tabla suelta en la base que dentro
--     de un año nadie sepa de dónde salió.
-- ------------------------------------------------------------
-- drop table if exists subcat_propuesta;
