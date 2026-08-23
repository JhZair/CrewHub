-- ============================================================
--  db/medir-buscar.sql — CUÁNTO PESA UNA BÚSQUEDA
--
--  No cambia NADA. Solo cuenta, para no arreglar por corazonada.
--
--  /buscar se trae veinte tablas ENTERAS y filtra en JavaScript. Eso fue una
--  decisión consciente —el motor de lib/buscar ignora tildes y sabe quechua, y
--  un ILIKE de Postgres no— y el comentario de esa página lo dice: «somos seis
--  personas; si algún día esto pesa, el arreglo de verdad es unaccent con
--  índice, no un ilike que miente».
--
--  Esta consulta contesta si ese día llegó, con números en vez de opiniones:
--  cuántas filas viajan y cuántos bytes, por tabla, ordenado por peso.
--
--  La columna que importa es `bytes_que_viajan`: es lo que Postgres serializa
--  y cruza la red hasta el servidor de Next EN CADA BÚSQUEDA, antes de que se
--  descarte el 99%.
--
--  Correr en Supabase → SQL Editor. Solo lectura.
-- ============================================================

with medidas as (
  -- El techo es el `.limit()` que pone la página; sin límite, la tabla entera.
  select 'publicaciones (1500)' as fuente,
         count(*) filter (where tipo <> 'bitacora')        as filas,
         sum(pg_column_size(titulo) + pg_column_size(cuerpo)) as bytes
    from publicaciones
  union all
  select 'comentarios (1500)', count(*), sum(pg_column_size(cuerpo)) from comentarios
  union all
  select 'objetos (600)', count(*),
         sum(pg_column_size(titulo) + pg_column_size(notas) + pg_column_size(url))
    from objetos
  union all
  select 'personas (600)', count(*), sum(pg_column_size(personas.*)) from personas
  union all
  select 'credenciales (600)', count(*), sum(pg_column_size(credenciales.*)) from credenciales
  union all
  select 'credencial_datos (anidada)', count(*), sum(pg_column_size(credencial_datos.*)) from credencial_datos
  union all
  select 'equipamiento (600)', count(*), sum(pg_column_size(equipamiento.*)) from equipamiento
  union all
  -- Ésta viaja DOS VECES por búsqueda: una con sus embebidos para el pajar y
  -- otra entera para el marcador 🏆.
  select 'postulaciones (×2, sin tope)', count(*) * 2, sum(pg_column_size(postulaciones.*)) * 2
    from postulaciones
  union all
  select 'proyectos (sin tope)', count(*), sum(pg_column_size(proyectos.*)) from proyectos
  union all
  select 'empresas (sin tope)', count(*), sum(pg_column_size(empresas.*)) from empresas
  union all
  select 'compras (sin tope)', count(*), sum(pg_column_size(compras.*)) from compras
  union all
  select 'kit_equipos (sin tope)', count(*), sum(pg_column_size(kit_equipos.*)) from kit_equipos
  union all
  select 'convocatorias (sin tope)', count(*), sum(pg_column_size(convocatorias.*)) from convocatorias
  union all
  select 'lugares (sin tope)', count(*), sum(pg_column_size(lugares.*)) from lugares
  union all
  select 'postulacion_equipo (sin tope)', count(*), sum(pg_column_size(postulacion_equipo.*)) from postulacion_equipo
  union all
  select 'perfiles (sin tope)', count(*), sum(pg_column_size(perfiles.*)) from perfiles
)
select fuente,
       filas,
       pg_size_pretty(coalesce(bytes, 0)) as bytes_que_viajan,
       round(100.0 * coalesce(bytes, 0) / nullif(sum(coalesce(bytes, 0)) over (), 0), 1) as pct
  from medidas
 order by coalesce(bytes, 0) desc;

-- ── Y EL TOTAL, QUE ES EL NÚMERO DE LA DISCUSIÓN ──
-- Si esto sale en cientos de kilobytes, el problema es el peso y hay que
-- filtrar en Postgres. Si sale en decenas, el problema son los viajes de ida y
-- vuelta y no vale la pena tocar el motor de búsqueda.
select pg_size_pretty(
         (select sum(pg_column_size(titulo) + pg_column_size(cuerpo)) from publicaciones where tipo <> 'bitacora')
       + (select sum(pg_column_size(cuerpo)) from comentarios)
       ) as solo_publicaciones_y_comentarios;

-- ── ¿CUÁNTO CRECE? ──
-- Las dos tablas que mandan son las que crecen solas con el uso diario. Si el
-- último mes pesa como los primeros seis, el techo de 1500 se alcanza pronto y
-- entonces la búsqueda deja de encontrar lo viejo SIN AVISAR, que es peor que
-- ser lenta.
select date_trunc('month', creado_en)::date as mes,
       count(*) filter (where t = 'publicacion') as casos,
       count(*) filter (where t = 'comentario')  as comentarios
  from (
    select creado_en, 'publicacion' as t from publicaciones where tipo <> 'bitacora'
    union all
    select creado_en, 'comentario'  as t from comentarios
  ) x
 group by 1
 order by 1 desc
 limit 18;
