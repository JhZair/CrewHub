-- ============================================================
-- PRESUPUESTO: plantillas + foto de lo postulado
--
-- Igual que el cronograma: (1) plantillas de presupuesto reusables por
-- categoría —el mismo videojuego repite rubros e ítems—; (2) una FOTO de lo
-- que se envió a DAFO, para que al ganar se comparen los cambios que exige la
-- modificación de presupuesto cuando llegue el dinero.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

-- (1) Plantillas de presupuesto. `items` = arreglo de ítems (rubro, concepto,
--     unidad, cantidad, costo_unit), SIN el split de fuentes (eso es de cada
--     postulación). Se guarda desde un presupuesto que ya se armó.
create table if not exists plantillas_presupuesto (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  categoria  text,
  items      jsonb not null default '[]',
  creado_en  timestamptz default now()
);
alter table plantillas_presupuesto enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='plantillas_presupuesto' and policyname='leer_plpre')
    then create policy "leer_plpre" on plantillas_presupuesto for select to authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='plantillas_presupuesto' and policyname='crear_plpre')
    then create policy "crear_plpre" on plantillas_presupuesto for insert to authenticated with check (true); end if;
end $$;

-- (2) La foto de lo postulado (todo el objeto presupuesto congelado) + cuándo.
alter table postulaciones
  add column if not exists presupuesto_postulado jsonb;
alter table postulaciones
  add column if not exists presupuesto_postulado_en timestamptz;

comment on column postulaciones.presupuesto_postulado is
  'Foto del presupuesto tal como se envió a DAFO. El presupuesto vivo sigue en '
  'postulaciones.presupuesto; esto es lo presentado, para comparar al ejecutar.';

select
  (select count(*) from information_schema.tables where table_name='plantillas_presupuesto') as tabla_plantillas,
  (select count(*) from information_schema.columns where table_name='postulaciones' and column_name='presupuesto_postulado') as tiene_foto;
