-- ============================================================
--  db/compras.sql — EL COMBO DE COMPRA
--
--  Tres cosas distintas que se estaban usando como una:
--
--    COMBO   cómo ENTRÓ.  Una compra: el pack de 5 radios, el combo DJI
--            Action 5 con sus 3 baterías, el hub, la jaula y el palo.
--            Una boleta, un proveedor, una fecha, un precio.
--    UNIDAD  la COSA FÍSICA. A-127. Tiene folio, estado, bitácora, daños,
--            mantenimientos y préstamos. Ya existe: es `equipamiento`, y
--            cada radio ya era una unidad sin que se notara.
--    KIT     cómo SALE. Lo que se usa junto para hacer un trabajo. Una
--            radio del combo puede estar en el kit de entrevista y otra
--            en el de rodaje: por eso el combo NO es un kit.
--
--  El combo es de una sola dirección: el equipo sabe de qué compra vino,
--  la compra no lista a sus equipos. Así una unidad se puede reasignar,
--  dar de baja o vender sin tocar el registro de la compra, que es un
--  hecho pasado y no debe cambiar nunca.
--
--  ── EL PRECIO ──
--  Vive en el combo, que es donde lo dice la boleta. La unidad puede
--  tener el suyo si se sabe. Lo que NO se hace es repartir el total entre
--  las piezas: 1200 entre 6 son 200 cada una, y una batería no vale lo
--  que la cámara. Esa cifra falsa acabaría en un inventario para un
--  seguro o para rendir un fondo. El inventario muestra las dos cifras
--  por separado y dice cuál es cuál.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ============================================================

create table if not exists compras (
  id             uuid primary key default gen_random_uuid(),
  codigo         text unique,                 -- "C-001" (nunca renumerar)
  nombre         text not null,               -- "Combo DJI Action 5 Pro"
  proveedor      text,                        -- Amazon, Coolbox, un vendedor de Wanchaq
  fecha          date,
  link           text,                        -- la ficha del producto
  moneda         text default 'PEN',          -- PEN | USD
  total          numeric(12,2),               -- lo que dice la boleta
  /* El comprobante. Vive aquí y no en cada equipo porque es UNO por
     compra: pegarlo en las seis fichas del combo DJI sería seis copias
     del mismo papel y ninguna sería la buena. */
  comprobante_url text,
  nota           text,
  creado_por     uuid references perfiles(id),
  creado_en      timestamptz not null default now()
);

/* De qué compra vino cada unidad. `set null`: borrar el registro de una
   compra no puede llevarse por delante los equipos —el equipo sigue en el
   estante—. Se pierde la procedencia, no la cosa. */
alter table equipamiento add column if not exists compra_id uuid
  references compras(id) on delete set null;

create index if not exists idx_equipamiento_compra on equipamiento(compra_id);
create index if not exists idx_compras_fecha on compras(fecha desc nulls last);

alter table compras enable row level security;
drop policy if exists co_sel on compras;
drop policy if exists co_ins on compras;
drop policy if exists co_upd on compras;
drop policy if exists co_del on compras;
create policy co_sel on compras for select to authenticated using (true);
create policy co_ins on compras for insert to authenticated with check (true);
create policy co_upd on compras for update to authenticated using (true) with check (true);
create policy co_del on compras for delete to authenticated using (true);

-- ── VERIFICACIÓN ──
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'compras')          as tabla,
  (select count(*) from information_schema.columns
    where table_name = 'equipamiento' and column_name = 'compra_id')   as col_compra_id,
  (select count(*) from pg_policies where tablename = 'compras')       as politicas,
  (select count(*) from compras)                                       as compras_existentes,
  -- Cuánto inventario está hoy sin precio: es lo que el combo viene a arreglar.
  (select count(*) from equipamiento
    where valor_compra is null and estado not in ('de_baja','perdido'))
                                                                       as equipos_sin_precio;
-- tabla = 1 · col_compra_id = 1 · politicas = 4
