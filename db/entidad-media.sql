-- ============================================================
-- IMÁGENES DE UNA ENTIDAD: portada (banner) + cartel (póster).
--
-- Cada entidad —un proyecto, una empresa, una convocatoria…— puede
-- tener dos imágenes propias: una PORTADA apaisada que va de fondo en
-- la cabecera, y un CARTEL (afiche/póster) vertical o cuadrado que se
-- muestra encima, a la izquierda.
--
-- Es una tabla polimórfica (entidad_tipo + entidad_id), como `objetos`
-- y `publicacion_vinculos`: así sirve a cualquier tipo de entidad sin
-- añadir columnas a seis tablas distintas. Una fila por entidad
-- (unique), y se hace UPSERT desde la acción guardarImagenEntidad.
--
-- Nota: las PERSONAS conservan su avatar en `personas.foto_url`; esta
-- tabla les da solo la portada (el banner). Los demás tipos usan las
-- dos imágenes de aquí.
--
-- Correr en Supabase → SQL Editor.
-- ============================================================
create table if not exists entidad_media (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,          -- 'proyecto' | 'empresa' | 'convocatoria' | 'persona' | 'lugar' | 'equipamiento'
  entidad_id   uuid not null,
  portada_url  text,                   -- banner ancho (fondo de la cabecera)
  cartel_url   text,                   -- cartel / póster (imagen vertical o cuadrada)
  actualizado  timestamptz default now(),
  unique (entidad_tipo, entidad_id)   -- una fila por entidad; su índice sirve para el lookup
);

alter table entidad_media enable row level security;
drop policy if exists "em_sel" on entidad_media;
drop policy if exists "em_ins" on entidad_media;
drop policy if exists "em_upd" on entidad_media;
drop policy if exists "em_del" on entidad_media;
create policy "em_sel" on entidad_media for select to authenticated using (true);
create policy "em_ins" on entidad_media for insert to authenticated with check (true);
create policy "em_upd" on entidad_media for update to authenticated using (true) with check (true);
create policy "em_del" on entidad_media for delete to authenticated using (true);
