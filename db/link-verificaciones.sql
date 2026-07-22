-- ============================================================
-- VERIFICACIÓN DE LINKS — deja constancia de que un humano revisó que el link
-- de un documento (DNI escaneado, firma, CV, constancia…) apunta al contenido
-- CORRECTO. El problema real: la gente pega links con el archivo equivocado.
--
-- Se guarda la `url` confirmada: si el link cambia, la confirmación deja de
-- coincidir y la ficha lo muestra otra vez como «sin confirmar» —justo el caso
-- que queremos cazar—. No hace falta borrarla al editar.
--
-- Genérico por (entidad_tipo, entidad_id, campo): sirve para persona, empresa,
-- lo que sea. Una fila por campo (unique) — la última confirmación manda.
--
-- Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

create table if not exists link_verificaciones (
  id            uuid primary key default gen_random_uuid(),
  entidad_tipo  text not null,
  entidad_id    uuid not null,
  campo         text not null,             -- p. ej. 'dni_url', 'firma_url', 'cv_url'
  url           text not null,             -- la url que se revisó (auto-invalida si cambia)
  -- El veredicto del humano: true = contenido correcto, false = equivocado (hay
  -- que corregir el link). Que exista la fila ya dice «alguien lo revisó».
  correcto      boolean not null default true,
  verificado_por uuid references perfiles(id),
  verificado_en timestamptz not null default now(),
  unique (entidad_tipo, entidad_id, campo)
);
-- Para instalaciones donde la tabla ya existía sin la columna:
alter table link_verificaciones add column if not exists correcto boolean not null default true;
create index if not exists idx_linkverif_entidad
  on link_verificaciones(entidad_tipo, entidad_id);

alter table link_verificaciones enable row level security;
drop policy if exists "leer_linkverif" on link_verificaciones;
create policy "leer_linkverif" on link_verificaciones
  for select to authenticated using (true);
drop policy if exists "crear_linkverif" on link_verificaciones;
create policy "crear_linkverif" on link_verificaciones
  for insert to authenticated with check (verificado_por = auth.uid());
drop policy if exists "editar_linkverif" on link_verificaciones;
create policy "editar_linkverif" on link_verificaciones
  for update to authenticated using (true) with check (verificado_por = auth.uid());
drop policy if exists "borrar_linkverif" on link_verificaciones;
create policy "borrar_linkverif" on link_verificaciones
  for delete to authenticated using (true);
