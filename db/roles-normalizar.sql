-- ============================================================
--  Normalizar las especialidades heredadas de Seatable
--  El campo `rol` guarda varias especialidades separadas por coma.
--
--  OJO — por qué esto NO es un replace() de texto:
--  "Actor" es subcadena de "Actor Social" (18 personas, y es otra cosa:
--  el participante del documental, no el elenco). Un replace ingenuo las
--  dejaría como "Actor / Actriz Social". Por eso partimos el campo en sus
--  elementos, mapeamos cada uno completo, y volvemos a armar la lista.
--
--  Fusiones decididas con el equipo (15 jul 2026):
--    Sonido, Operador/a de Sonido        → Sonidista
--    Actor                               → Actor / Actriz   (Actor Social NO se toca)
--    Fotógrafo(a)                        → Fotógrafo/a      (fotografía en general)
--    Programador                         → Programador Videojuegos (mismo puesto)
--    Traducción / Intérprete
--      + Traductor/a Quechua             → Traductor/a / Intérprete (Lengua Originaria)
--    Ilustrador                          → Ilustrador/a
--    Contador                            → Contador/a
--    Investigación                       → Investigación Documental
--
--  NO se tocan (son oficios distintos): Ingeniero de Sonido, Editor/a de
--  Sonido, Asistente de Sonido, Foley, Director/a a secas, Fotógrafo/a Fija.
-- ============================================================

-- ------------------------------------------------------------
-- PASO 1 · Ver qué va a cambiar (no toca nada)
-- ------------------------------------------------------------
with mapa(de, a) as (values
  ('Sonido', 'Sonidista'),
  ('Operador/a de Sonido', 'Sonidista'),
  ('Actor', 'Actor / Actriz'),
  ('Fotógrafo(a)', 'Fotógrafo/a'),
  ('Programador', 'Programador Videojuegos'),
  ('Traducción / Intérprete', 'Traductor/a / Intérprete (Lengua Originaria)'),
  ('Traductor/a Quechua', 'Traductor/a / Intérprete (Lengua Originaria)'),
  ('Ilustrador', 'Ilustrador/a'),
  ('Contador', 'Contador/a'),
  ('Investigación', 'Investigación Documental')
),
expandido as (
  select p.id, p.nombre, p.rol as antes, btrim(r.val) as original, r.ord
    from personas p,
         lateral unnest(string_to_array(p.rol, ',')) with ordinality as r(val, ord)
   where p.rol is not null and btrim(r.val) <> ''
),
mapeado as (
  -- coalesce: si no está en el mapa, se queda igual.
  -- min(ord) + group by: si dos originales caen en el mismo destino
  -- (Sonido y Operador/a de Sonido → Sonidista), quedan en uno solo.
  select e.id, e.nombre, e.antes, coalesce(m.a, e.original) as val, min(e.ord) as ord
    from expandido e
    left join mapa m on m.de = e.original
   group by e.id, e.nombre, e.antes, coalesce(m.a, e.original)
),
nuevo as (
  select id, nombre, antes, string_agg(val, ', ' order by ord) as despues
    from mapeado group by id, nombre, antes
)
select nombre, antes, despues
  from nuevo
 where antes is distinct from despues
 order by nombre;


-- ------------------------------------------------------------
-- PASO 2 · Aplicarlo (mismo cálculo, ahora sí escribe)
-- ------------------------------------------------------------
-- with mapa(de, a) as (values
--   ('Sonido', 'Sonidista'),
--   ('Operador/a de Sonido', 'Sonidista'),
--   ('Actor', 'Actor / Actriz'),
--   ('Fotógrafo(a)', 'Fotógrafo/a'),
--   ('Programador', 'Programador Videojuegos'),
--   ('Traducción / Intérprete', 'Traductor/a / Intérprete (Lengua Originaria)'),
--   ('Traductor/a Quechua', 'Traductor/a / Intérprete (Lengua Originaria)'),
--   ('Ilustrador', 'Ilustrador/a'),
--   ('Contador', 'Contador/a'),
--   ('Investigación', 'Investigación Documental')
-- ),
-- expandido as (
--   select p.id, btrim(r.val) as original, r.ord
--     from personas p,
--          lateral unnest(string_to_array(p.rol, ',')) with ordinality as r(val, ord)
--    where p.rol is not null and btrim(r.val) <> ''
-- ),
-- mapeado as (
--   select e.id, coalesce(m.a, e.original) as val, min(e.ord) as ord
--     from expandido e
--     left join mapa m on m.de = e.original
--    group by e.id, coalesce(m.a, e.original)
-- ),
-- nuevo as (
--   select id, string_agg(val, ', ' order by ord) as rol from mapeado group by id
-- )
-- update personas p set rol = n.rol
--   from nuevo n
--  where p.id = n.id and p.rol is distinct from n.rol;


-- ------------------------------------------------------------
-- PASO 3 · Control: ningún rol debería quedar fuera de la lista
--   (compárala con ESPECIALIDADES en lib/entidades.ts)
-- ------------------------------------------------------------
-- select btrim(r) as rol, count(*) as personas
--   from personas, unnest(string_to_array(rol, ',')) as r
--  where rol is not null and btrim(r) <> ''
--  group by 1 order by 1;
