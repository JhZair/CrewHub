-- ============================================================
--  db/verificar-tandas.sql — QUÉ MIGRACIONES FALTAN POR CORRER
--
--  Se puede correr las veces que haga falta: solo lee.
--
--  ── PARA QUÉ ──
--  El código publicado consulta y ESCUCHA tablas que quizá todavía no existan.
--  Una consulta a una tabla inexistente sale en los registros de Supabase como
--  error de Postgres, y una suscripción de tiempo real a una tabla que no está
--  se cuenta como error de Realtime. Los dos aparecen en el panel como números
--  rojos sin decir de qué son.
--  Esto contesta esa pregunta en una fila.
-- ============================================================

select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='postulacion_reparto')   as reparto,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='postulacion_reparto'
       and column_name='situacion')                                      as reparto_situacion,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='postulacion_papel')     as papeles_5_4,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='tratamiento')           as tratamientos,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='guion_secuencias'
       and column_name='tratamiento_id')                                 as guion_por_tratamiento,
  (select is_nullable from information_schema.columns
     where table_schema='public' and table_name='guion_secuencias'
       and column_name='proyecto_id')                                    as proyecto_id_suelto,
  /* Y qué está publicado en tiempo real: una tabla que el código escucha y no
     está aquí no da error, pero tampoco emite nunca — el fallo más caro de
     diagnosticar. */
  (select string_agg(tablename, ', ' order by tablename)
     from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename in ('postulacion_reparto','postulacion_papel','tratamiento')) as en_realtime;

-- Lo que tiene que salir cuando esté todo corrido:
--   reparto = 1                 ← db/postulacion-reparto.sql
--   reparto_situacion = 1       ← db/reparto-situacion.sql
--   papeles_5_4 = 1             ← db/postulacion-papel.sql
--   tratamientos = 1            ← db/tratamiento.sql
--   guion_por_tratamiento = 1   ← db/tratamiento.sql
--   proyecto_id_suelto = YES    ← db/tratamiento-soltar.sql  (antes de publicar)
--       …y NULL si ya corriste db/tratamiento-limpiar.sql, que la borra: las
--       dos respuestas son correctas, depende de por dónde vayas.
--   en_realtime = las tres, separadas por comas
