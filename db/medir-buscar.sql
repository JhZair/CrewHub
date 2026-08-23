-- ============================================================
--  db/medir-buscar.sql — CUÁNTO PESA UNA BÚSQUEDA
--
--  No cambia NADA. Solo cuenta, para no arreglar por corazonada.
--
--  /buscar se trae veinte tablas ENTERAS y filtra en JavaScript. Eso fue una
--  decisión consciente —el motor de lib/buscar ignora tildes y sabe quechua, y
--  un ILIKE de Postgres no— y el comentario de esa página lo dice: «somos seis
--  personas; si algún día esto pesa, el arreglo de verdad es unaccent con
--  índice, no un ilike que miente». Esto contesta si ese día llegó.
--
--  La columna que importa es `bytes`: lo que Postgres serializa y cruza la red
--  hasta el servidor de Next EN CADA BÚSQUEDA, antes de descartar el 99%.
--
--  ⚠ UNA SOLA SENTENCIA, A PROPÓSITO. El SQL Editor de Supabase enseña solo el
--  resultado de la ÚLTIMA, así que tres consultas seguidas devuelven una y las
--  otras dos se pierden sin avisar. Va todo junto y ordenado por peso.
--
--  Correr en Supabase → SQL Editor. Solo lectura.
-- ============================================================

with medidas as (
  -- El techo es el `.limit()` que pone la página; sin límite, la tabla entera.
  select 'publicaciones  ⚠ techo 1500' as fuente, 1 as orden,
         count(*) filter (where tipo <> 'bitacora')            as filas,
         sum(pg_column_size(titulo) + pg_column_size(cuerpo))  as bytes
    from publicaciones
  union all
  select 'comentarios  ⚠ techo 1500', 1, count(*), sum(pg_column_size(cuerpo)) from comentarios
  union all
  select 'objetos  ⚠ techo 600', 1, count(*),
         sum(pg_column_size(titulo) + pg_column_size(notas) + pg_column_size(url)) from objetos
  union all
  select 'personas  ⚠ techo 600', 1, count(*), sum(pg_column_size(personas.*)) from personas
  union all
  select 'credenciales  ⚠ techo 600', 1, count(*), sum(pg_column_size(credenciales.*)) from credenciales
  union all
  select 'credencial_datos (anidada)', 1, count(*), sum(pg_column_size(credencial_datos.*)) from credencial_datos
  union all
  select 'equipamiento  ⚠ techo 600', 1, count(*), sum(pg_column_size(equipamiento.*)) from equipamiento
  union all
  select 'postulaciones (sin techo)', 1, count(*), sum(pg_column_size(postulaciones.*)) from postulaciones
  union all
  select 'proyectos (sin techo)', 1, count(*), sum(pg_column_size(proyectos.*)) from proyectos
  union all
  select 'empresas (sin techo)', 1, count(*), sum(pg_column_size(empresas.*)) from empresas
  union all
  select 'compras (sin techo)', 1, count(*), sum(pg_column_size(compras.*)) from compras
  union all
  select 'kit_equipos (sin techo)', 1, count(*), sum(pg_column_size(kit_equipos.*)) from kit_equipos
  union all
  select 'convocatorias (sin techo)', 1, count(*), sum(pg_column_size(convocatorias.*)) from convocatorias
  union all
  select 'lugares (sin techo)', 1, count(*), sum(pg_column_size(lugares.*)) from lugares
  union all
  select 'postulacion_equipo (sin techo)', 1, count(*), sum(pg_column_size(postulacion_equipo.*)) from postulacion_equipo
  union all
  select 'perfiles (sin techo)', 1, count(*), sum(pg_column_size(perfiles.*)) from perfiles
),
total as (
  select 'TOTAL que viaja por búsqueda' as fuente, 0 as orden,
         sum(filas) as filas, sum(coalesce(bytes, 0)) as bytes
    from medidas
)
select fuente,
       filas,
       pg_size_pretty(coalesce(bytes, 0)) as bytes,
       round(100.0 * coalesce(bytes, 0)
             / nullif((select bytes from total), 0), 1) as pct
  from (select * from total union all select * from medidas) x
 order by orden, coalesce(bytes, 0) desc;
