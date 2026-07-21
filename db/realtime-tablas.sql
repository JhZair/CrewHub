-- ============================================================
-- REALTIME: publicar las tablas cuyos cambios deben refrescar la UI en vivo.
--
-- Supabase Realtime SOLO emite eventos de tablas añadidas a la publicación
-- `supabase_realtime`. Hasta ahora solo estaba `notificaciones` (ver
-- db/realtime-notificaciones.sql); por eso los <Realtime> del feed, tablero,
-- agenda y caso se suscribían pero NUNCA recibían nada (fallo silencioso).
--
-- Esto agrega las que faltan. RLS ya tiene SELECT `to authenticated` en todas
-- (db/schema.sql), así que los eventos se entregan al usuario autenticado.
--
-- Idempotente (solo agrega la que no esté). SIN transacción externa.
-- Correr en Supabase → SQL Editor.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'publicaciones', 'comentarios', 'publicacion_vinculos', 'reacciones',
    'cronograma_actividades', 'actividad', 'postulaciones'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Verificación: deben aparecer todas las de arriba + notificaciones.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
