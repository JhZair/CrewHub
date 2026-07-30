-- ============================================================
-- BASELINE REAL DEL ESQUEMA — porque schema.sql mintió.
--
-- Auditoría 2026-07-29: schema.sql está desfasado (campos que el
-- código lee de postulaciones figuran en convocatorias) y db/ está
-- incompleto (columnas usadas por el código sin DDL en ningún
-- archivo: personas.autoident/lengua_materna/otras_lenguas/
-- discapacidad/nacionalidad, convocatorias.plantilla_formulario,
-- postulaciones.materiales/acta_url/matriz_jurado_url — se
-- agregaron directo en Supabase sin guardar el .sql).
--
-- Este archivo NO migra nada: INVENTARÍA. Se corre en el SQL
-- Editor de Supabase y su salida es la verdad. Pegar el resultado
-- como db/schema-actual.md (o exportar CSV) y, desde entonces,
-- planear contra ese inventario, nunca contra schema.sql.
--
-- (La alternativa completa es `supabase db dump --schema public`
-- con el CLI, que regenera el DDL entero. Este query es el camino
-- sin instalar nada.)
-- ============================================================

-- 1) Inventario de columnas de las tablas del dominio:
select
  c.table_name,
  c.ordinal_position as pos,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid,
                  c.ordinal_position) as comentario
from information_schema.columns c
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

-- 2) Índices (aquí viven las reglas de unicidad que el código asume,
--    como idx_objetos_cv_unico):
select
  tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 3) Funciones/RPC propias (set_expediente_caso, set_expediente_campo,
--    muro_toggle_visto…):
select
  p.proname as funcion,
  pg_get_function_arguments(p.oid) as argumentos,
  case when p.prosecdef then 'security definer' else 'invoker' end as seguridad
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
