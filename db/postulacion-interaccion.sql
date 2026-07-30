-- INTERACCIÓN EN UNA POSTULACIÓN
-- Comentarios (con respuestas anidadas, imágenes y @menciones) y reacciones,
-- colgando de la PROPIA postulación → un solo hilo, idéntico visto desde la
-- ficha de empresa, de proyecto o de persona.

-- 1) comentarios: nuevo dueño «postulación».
alter table comentarios
  add column if not exists postulacion_id uuid references postulaciones(id) on delete cascade;
create index if not exists idx_com_postulacion on comentarios (postulacion_id, creado_en);

-- Ampliar el check «dueño único» de 4 a 5 (pub / objeto / prestamo / equipamiento / postulacion).
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk check (
  (publicacion_id is not null)::int
  + (objeto_id is not null)::int
  + (prestamo_id is not null)::int
  + (equipamiento_id is not null)::int
  + (postulacion_id is not null)::int
  = 1
);

-- 2) reacciones: poder reaccionar a la postulación (no solo a sus comentarios).
-- La columna de autor se llama usuario_id en la BD desplegada; en un esquema
-- creado desde schema.sql viejo podría llamarse autor_id. La renombramos si hace
-- falta para que el resto del script (y el código) siempre encuentren usuario_id.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'reacciones' and column_name = 'autor_id')
     and not exists (select 1 from information_schema.columns
             where table_name = 'reacciones' and column_name = 'usuario_id') then
    alter table reacciones rename column autor_id to usuario_id;
  end if;
end $$;

alter table reacciones
  add column if not exists postulacion_id uuid references postulaciones(id) on delete cascade;
create index if not exists idx_rx_postulacion on reacciones (postulacion_id);

-- El check de dueño anónimo (publicacion_id o comentario_id) impediría una
-- reacción a la postulación: lo relajamos. (Idempotente: soltamos tanto el
-- nombre viejo como el nuevo antes de crearlo, para poder re-ejecutar el script.)
alter table reacciones drop constraint if exists reacciones_check;
alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null or postulacion_id is not null
);

-- El UNIQUE viejo (publicacion_id, comentario_id, usuario_id, emoji) trataría a
-- dos postulaciones distintas como la misma (ambas con pub=null, com=null) y
-- bloquearía la 2ª reacción. Lo reemplazamos por uno que también mire la
-- postulación (coalesce para que los null no colisionen entre tipos de dueño).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'reacciones'::regclass and contype = 'u' loop
    execute format('alter table reacciones drop constraint %I', c.conname);
  end loop;
end $$;
create unique index if not exists uq_reacciones_dueno on reacciones (
  coalesce(publicacion_id::text, ''),
  coalesce(comentario_id::text, ''),
  coalesce(postulacion_id::text, ''),
  usuario_id, emoji
);

-- 3) notificaciones: para @menciones / avisos disparados desde una postulación.
alter table notificaciones
  add column if not exists postulacion_id uuid references postulaciones(id) on delete cascade;
