-- ══════════════════════════════════════════════════════════════════════════
--  db/secuencia-completa.sql
--
--  UNA SECUENCIA DEJA DE SER UN PÁRRAFO
--
--  Hasta hoy una secuencia era un nombre, un texto y unos minutos. Eso basta
--  para escribir el tratamiento y no basta para RODARLO: al llegar al rodaje,
--  lo que hay que saber de «La Fe y el Santo Patrono» es quién sale —Lino
--  Huamani—, cómo se ve, dónde está el render que se mandó al fondo, y qué
--  quedó pendiente de ella. Todo eso vivía fuera: en la cabeza de alguien, en
--  un WhatsApp y en una carpeta de Drive.
--
--  Esta migración le cuelga cuatro cosas a la secuencia. Ninguna inventa un
--  modelo nuevo: las cuatro son el patrón que esta base ya usa para lo mismo
--  en otro sitio, y eso es deliberado. Dos formas de modelar la misma relación
--  son dos formas de leerla, y el día que haya que tocar las dos, una se
--  olvida.
--
--    1 · IMAGEN REPRESENTATIVA  → `entidad_media.portada_url`, como ya la
--        tienen proyectos, empresas y personas. Es UNA ranura, no la primera
--        de una lista: la imagen que representa la secuencia es un sitio de la
--        pantalla, y por eso su tabla tiene `unique (entidad_tipo, entidad_id)`.
--    2 · GALERÍA               → `entidad_foto`, que nació polimórfica
--        justamente para esto y trae lo que una lista de URLs no tiene: el PIE
--        DE FOTO. Una foto de la que nadie sabe qué enseña es una foto que
--        nadie mira.
--    3 · CASOS                 → una columna en `publicaciones`, igual que
--        `actividad_id` (cronograma) y `compromiso_id` (cláusulas del acta).
--        La relación es de uno a muchos y vive en el caso.
--    4 · COMENTARIOS, REACCIONES Y AVISOS → una puerta más del registro de
--        lib/rendicionHilo.ts, con sus DOS guardianes (ver abajo).
--
--  Y dos tablas nuevas, porque no hay patrón que reutilizar:
--    5 · QUIÉN SALE  → `guion_secuencia_actores`
--    6 · EL RENDER   → `guion_secuencia_render`, con su historial
--
--  ⚠ CORRER ESTO ANTES DE PUBLICAR EL CÓDIGO. Correrlo antes es inofensivo:
--  añade columnas y tablas que nadie lee todavía. Al revés NO: con el código
--  nuevo arriba y esto sin correr, los `select` con embebidos fallan ENTEROS y
--  la pantalla del guion sale vacía. Es la misma coreografía de db/crono-casos.sql.
--
--  Idempotente, SIN transacción externa (lección pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 0 · ANTES — para poder comparar después
-- ------------------------------------------------------------
select
  (select count(*) from guion_secuencias)                                as secuencias,
  (select count(*) from entidad_foto  where entidad_tipo='secuencia')    as fotos_ya,
  (select count(*) from entidad_media where entidad_tipo='secuencia')    as portadas_ya;

-- ------------------------------------------------------------
-- 1 y 2 · IMAGEN REPRESENTATIVA Y GALERÍA — NADA QUE CREAR
--
-- `entidad_media` y `entidad_foto` son polimórficas y no validan el tipo
-- contra ninguna lista: basta con empezar a escribir `entidad_tipo =
-- 'secuencia'`. Esta sección existe solo para dejar dicho que se usan, porque
-- lo que no está escrito en ninguna parte se vuelve a inventar.
--
-- ⚠ `portada_url` y NO `cartel_url`. Cartel es vertical —un póster—; la imagen
-- de una secuencia es un FOTOGRAMA, y un fotograma es apaisado. Elegir la
-- ranura por su forma y no por su nombre es lo que evita que la galería salga
-- recortada por los lados el día que alguien suba un frame de verdad.
--
-- ⚠ Y NO se borran solas. `entidad_foto` y `entidad_media` no tienen clave
-- foránea contra `guion_secuencias` —no pueden: son polimórficas—, así que al
-- borrar una secuencia sus fotos quedan huérfanas. Lo limpia la acción que
-- borra la secuencia, y está dicho ahí. Un `on delete cascade` imaginario es
-- peor que ninguno.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3 · LOS CASOS DE UNA SECUENCIA
--
-- Uno a muchos, y la relación vive en el caso. Mismo modelo que el cronograma
-- y que las cláusulas del acta, con las mismas palabras: «Rodaje Nelly» son
-- tres trabajos que caminan a la vez y los lleva gente distinta. Una secuencia
-- es igual — conseguir el permiso del templo, cerrar la entrevista con el
-- mayordomo, rodar la procesión.
--
-- `on delete set null` y no `cascade`: borrar una secuencia del tratamiento no
-- puede llevarse por delante el caso donde está la conversación de cómo se
-- resolvió. El caso sobrevive suelto en el tablero, que es donde se ve.
-- ------------------------------------------------------------
alter table publicaciones add column if not exists secuencia_id uuid
  references guion_secuencias(id) on delete set null;

create index if not exists idx_pub_secuencia on publicaciones (secuencia_id)
  where secuencia_id is not null;

comment on column publicaciones.secuencia_id is
  'La secuencia del tratamiento de la que cuelga este caso. NULL = no cuelga de ninguna.';

-- ------------------------------------------------------------
-- 4 · COMENTAR Y REACCIONAR SOBRE UNA SECUENCIA
--
-- La novena puerta del registro de lib/rendicionHilo.ts.
--
-- ⚠ LA COLUMNA SOLA NO BASTA, Y ESTA ES LA QUINTA VEZ QUE SE ESCRIBE.
-- `reacciones` tiene DOS guardianes que enumeran las columnas una por una: un
-- check de dueño y un índice único. Añadir la columna y olvidarlos deja el 👀
-- contestando «violates check constraint» sobre un dato que sí se podía
-- guardar —pasó con `competencia_id`, volvió a pasar con `jurado_id`—, y el
-- único trata a DOS secuencias distintas como el mismo dueño, así que la
-- segunda reacción muere con un error de duplicado que en pantalla no
-- significa nada.
-- Los dos se reescriben ENTEROS: no se puede «añadir» a un check.
-- ------------------------------------------------------------
alter table comentarios add column if not exists secuencia_id uuid
  references guion_secuencias(id) on delete cascade;
create index if not exists idx_com_secuencia on comentarios (secuencia_id)
  where secuencia_id is not null;

alter table reacciones add column if not exists secuencia_id uuid
  references guion_secuencias(id) on delete cascade;
create index if not exists idx_rx_secuencia on reacciones (secuencia_id);

alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null
  or postulacion_id is not null or movimiento_caja_id is not null
  or comprobante_id is not null or estado_cuenta_id is not null
  or rhe_id is not null or gasto_dj_id is not null
  or movimiento_banco_id is not null or obligacion_periodo_id is not null
  or competencia_id is not null or jurado_id is not null
  or secuencia_id is not null
);

drop index if exists uq_reacciones_dueno;
create unique index uq_reacciones_dueno on reacciones (
  coalesce(publicacion_id::text, ''),
  coalesce(comentario_id::text, ''),
  coalesce(postulacion_id::text, ''),
  coalesce(movimiento_caja_id::text, ''),
  coalesce(comprobante_id::text, ''),
  coalesce(estado_cuenta_id::text, ''),
  coalesce(rhe_id::text, ''),
  coalesce(gasto_dj_id::text, ''),
  coalesce(movimiento_banco_id::text, ''),
  coalesce(obligacion_periodo_id::text, ''),
  coalesce(competencia_id::text, ''),
  coalesce(jurado_id::text, ''),
  coalesce(secuencia_id::text, ''),
  autor_id, emoji
);

alter table notificaciones add column if not exists secuencia_id uuid
  references guion_secuencias(id) on delete cascade;
create index if not exists idx_notif_secuencia on notificaciones (secuencia_id)
  where secuencia_id is not null;

-- ------------------------------------------------------------
-- 5 · QUIÉN SALE EN LA SECUENCIA
--
-- En «La Fe y el Santo Patrono» el actor social es Lino Huamani, y en una
-- secuencia puede haber varios. Uno a muchos por los dos lados, o sea una
-- tabla de cruce — igual que `guion_secuencia_hilos`, y a propósito: son la
-- misma forma de relación y modelarlas distinto obligaría a aprenderlas dos
-- veces.
--
-- ⚠ APUNTA A `proyecto_actores`, NO A `personas`.
-- Es lo que hace cumplir «los actores sociales que están CARGADOS EN EL
-- PROYECTO»: con una clave foránea contra `personas` se podría poner en una
-- secuencia a cualquiera del sistema —un proveedor, un jurado— y el reparto
-- del documental dejaría de ser una lista cerrada.
-- El precio, dicho para que no sorprenda: quitar a alguien del reparto del
-- proyecto lo quita también de sus secuencias (cascade). Es correcto —si no
-- está en la película, no sale en una secuencia de la película— pero significa
-- que ese borrado es más grande de lo que parece desde la ficha del proyecto.
--
-- `principal`: en un documental coral hay quien LLEVA la secuencia y quien
-- aparece en ella. Sin esa distinción, una secuencia con siete actores no dice
-- de quién es, y el orden de la lista acaba decidiéndolo por accidente.
-- ------------------------------------------------------------
create table if not exists guion_secuencia_actores (
  secuencia_id      uuid not null references guion_secuencias(id) on delete cascade,
  proyecto_actor_id uuid not null references proyecto_actores(id) on delete cascade,
  -- Quién lleva la secuencia. Puede haber más de uno; lo que no puede es que
  -- no se sepa.
  principal         boolean not null default false,
  -- Qué hace AQUÍ, que no siempre es su rol en la película: el mayordomo
  -- principal puede estar en una secuencia como entrevistado y en otra
  -- cargando el anda.
  nota              text,
  creado_en         timestamptz not null default now(),
  primary key (secuencia_id, proyecto_actor_id)
);

create index if not exists idx_gsa_actor on guion_secuencia_actores (proyecto_actor_id);

-- ------------------------------------------------------------
-- 6 · EL RENDER DE LA SECUENCIA, CON SU HISTORIAL
--
-- El montaje de una secuencia se exporta muchas veces: el primer corte, el que
-- vio el equipo, el que se mandó al fondo. Hoy eso vive en una carpeta de
-- Drive y en la memoria de quien lo subió, así que «¿cuál es el bueno?» se
-- contesta preguntando.
--
-- ⚠ UNA TABLA Y NO UNA COLUMNA `render_url`. Con una columna, subir la v3
-- PISA la v2: se pierde el enlace a lo que vio el jurado, que es exactamente
-- lo que hay que poder volver a mirar cuando llegan las observaciones. Es la
-- misma lección que `tratamiento` aprendió con sus versiones.
--
-- El vigente es el de `version` más alta. No hay columna `vigente` y es a
-- propósito: mientras «el último es el bueno» sea verdad, una bandera es un
-- segundo sitio donde decir lo mismo y llegará el día en que las dos digan
-- cosas distintas. Si alguna vez hay que volver a una anterior de verdad, ahí
-- se añade — con su motivo escrito.
-- ------------------------------------------------------------
create table if not exists guion_secuencia_render (
  id           uuid primary key default gen_random_uuid(),
  secuencia_id uuid not null references guion_secuencias(id) on delete cascade,
  url          text not null,
  -- 1, 2, 3… por secuencia. Lo pone la acción, que mira el máximo y suma uno.
  version      int  not null default 1,
  -- Qué cambia respecto del anterior. Sin esto, un historial de seis enlaces
  -- es seis enlaces iguales.
  nota         text,
  duracion     text,          -- «3:42», tal como lo diga quien lo sube
  creado_por   uuid references auth.users(id) on delete set null,
  creado_en    timestamptz not null default now(),
  unique (secuencia_id, version)
);

create index if not exists idx_gsr_secuencia
  on guion_secuencia_render (secuencia_id, version desc);

-- ------------------------------------------------------------
-- 7 · RLS — el mismo criterio que el resto del guion: el equipo entra
-- ------------------------------------------------------------
alter table guion_secuencia_actores enable row level security;
alter table guion_secuencia_render  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['guion_secuencia_actores','guion_secuencia_render']
  loop
    execute format('drop policy if exists %I on %I', t || '_sel', t);
    execute format('drop policy if exists %I on %I', t || '_ins', t);
    execute format('drop policy if exists %I on %I', t || '_upd', t);
    execute format('drop policy if exists %I on %I', t || '_del', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_ins', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_upd', t);
    execute format('create policy %I on %I for delete to authenticated using (true)', t || '_del', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 8 · VERIFICACIÓN — si alguno sale en 0, algo no se aplicó
--
-- Los dos guardianes se comprueban por su DEFINICIÓN y no por su existencia:
-- el check y el único existían antes de esto, así que «existe» no dice nada.
-- Lo que hay que saber es si nombran la columna nueva.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_name='publicaciones'  and column_name='secuencia_id')   as caso,
  (select count(*) from information_schema.columns
     where table_name='comentarios'    and column_name='secuencia_id')   as com,
  (select count(*) from pg_constraint
     where conname='reacciones_dueno_chk'
       and pg_get_constraintdef(oid) like '%secuencia_id%')              as rx_chk,
  (select count(*) from pg_indexes
     where indexname='uq_reacciones_dueno'
       and indexdef like '%secuencia_id%')                               as rx_uq,
  (select count(*) from information_schema.columns
     where table_name='notificaciones' and column_name='secuencia_id')   as notif,
  (select count(*) from information_schema.tables
     where table_name='guion_secuencia_actores')                         as actores,
  (select count(*) from information_schema.tables
     where table_name='guion_secuencia_render')                          as render;
