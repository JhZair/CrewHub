-- ============================================================
--  db/subcats-soporte-cuello.sql
--
--  «Soporte de cabeza / pecho» pasa a llamarse
--  «Soporte de cabeza / cuello / pecho».
--
--  El nombre viejo no decía «cuello», así que un soporte de cuello
--  —el TELESIN— no encontraba dónde ir y acababa en otra categoría o
--  sin subcategoría. Una subcategoría que existe pero no se llama como
--  la cosa es una que nadie usa.
--
--  Esto hay que correrlo. Si no, los equipos ya clasificados se quedan
--  con el texto viejo: seguirían viéndose (el formulario conserva el
--  valor actual aunque no esté en la lista), pero el desplegable
--  ofrecería el nombre nuevo y el filtro los contaría como DOS
--  subcategorías distintas. Nada fallaría; simplemente el mismo
--  soporte estaría en dos sitios.
--
--  Idempotente: correrlo dos veces no hace nada la segunda.
-- ============================================================

-- ── 1. QUÉ SE VA A CAMBIAR (no toca nada) ──
select folio, nombre, categoria, subcategoria
from equipamiento
where subcategoria = 'Soporte de cabeza / pecho'
order by folio;

-- ── 2. CAMBIAR ──
update equipamiento
   set subcategoria = 'Soporte de cabeza / cuello / pecho'
 where subcategoria = 'Soporte de cabeza / pecho';

-- ── 3. COMPROBAR: la primera cuenta tiene que dar 0 ──
select
  count(*) filter (where subcategoria = 'Soporte de cabeza / pecho')           as quedan_viejos,
  count(*) filter (where subcategoria = 'Soporte de cabeza / cuello / pecho')  as con_nombre_nuevo
from equipamiento;
