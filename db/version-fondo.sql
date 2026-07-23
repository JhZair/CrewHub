-- ============================================================
--  VERSIONES DEL FONDO — el historial de fotos del presupuesto y el cronograma
--
--  El presupuesto y el cronograma están VIVOS: cambian, se desglosan, y cuando
--  se pide prórroga o se hace una modificación de presupuesto (que DAFO deja
--  justificar cada semestre) nace una versión nueva y aprobada. La «foto» única
--  no alcanza: hace falta un historial.
--
--  Cada versión: su ETIQUETA (Postulado / Reformulado / Prórroga / …), su
--  MOTIVO, cuándo y quién, y los DATOS congelados. Una sola es la VIGENTE por
--  tipo — la que manda para rendir (contra la que se compara lo ejecutado).
--
--  Idempotente y sin transacción externa (pgBouncer).
-- ============================================================

create table if not exists version_fondo (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  tipo           text not null check (tipo in ('presupuesto', 'cronograma')),
  etiqueta       text not null,          -- Postulado | Reformulado | Prórroga | …
  motivo         text,
  datos          jsonb not null,         -- la foto congelada (mismo shape que la foto vieja)
  vigente        boolean not null default false,
  creado_en      timestamptz default now(),
  creado_por     uuid references perfiles(id)
);

create index if not exists idx_version_fondo on version_fondo(postulacion_id, tipo, creado_en desc);
-- Solo UNA versión vigente por fondo y tipo.
create unique index if not exists uq_version_vigente on version_fondo(postulacion_id, tipo) where vigente;

-- ¿Es admin el usuario actual? (definer; se define aquí por si este script
-- corre antes que db/auditoria-financiera.sql. Es idempotente.)
create or replace function public.es_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false);
$$;

alter table version_fondo enable row level security;
drop policy if exists "leer_verfondo"   on version_fondo;
drop policy if exists "crear_verfondo"  on version_fondo;
drop policy if exists "editar_verfondo" on version_fondo;
drop policy if exists "borrar_verfondo" on version_fondo;
-- Lectura abierta al equipo; escribir exige es_admin en la propia base (como
-- las demás tablas financieras endurecidas).
create policy "leer_verfondo"   on version_fondo for select to authenticated using (true);
create policy "crear_verfondo"  on version_fondo for insert to authenticated with check (public.es_admin());
create policy "editar_verfondo" on version_fondo for update to authenticated using (public.es_admin());
create policy "borrar_verfondo" on version_fondo for delete to authenticated using (public.es_admin());

-- ── Backfill: la foto «postulado» que ya existía pasa a ser la 1ª versión ──
--  (vigente). Solo si aún no hay versiones de ese tipo para el fondo.
insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente, creado_en)
select p.id, 'presupuesto', 'Postulado', 'Migrado de la foto anterior',
       p.presupuesto_postulado, true, coalesce(p.presupuesto_postulado_en, now())
  from postulaciones p
 where p.presupuesto_postulado is not null
   and not exists (select 1 from version_fondo v where v.postulacion_id = p.id and v.tipo = 'presupuesto');

insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente, creado_en)
select p.id, 'cronograma', 'Postulado', 'Migrado de la foto anterior',
       p.cronograma_postulado, true, coalesce(p.cronograma_postulado_en, now())
  from postulaciones p
 where p.cronograma_postulado is not null
   and not exists (select 1 from version_fondo v where v.postulacion_id = p.id and v.tipo = 'cronograma');
