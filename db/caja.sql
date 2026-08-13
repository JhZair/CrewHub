-- ============================================================
--  CAJA — el cuaderno de ingresos y egresos del día a día
--
--  Esto NO se rinde a DAFO. Es control interno: las coberturas que se cobran,
--  los gastos de oficina, lo que entra y lo que sale. Vive aparte de la
--  rendición a propósito —mezclarlas obligaría a que cada apunte declarara a
--  cuál de los dos mundos pertenece, y ese es justo el momento en que se deja
--  de apuntar.
--
--  LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO: registrar un gasto tiene que costar
--  diez segundos. Un módulo de control interno que no se llena es peor que no
--  tenerlo, porque además da la sensación de que hay control. Por eso no hay
--  plan contable, ni asientos, ni cierres: hay un cuaderno con categorías.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/rhe-permisos.sql: las políticas usan es_finanzas().
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'es_finanzas') then
    raise exception 'Falta public.es_finanzas(): corre antes db/rhe-permisos.sql';
  end if;
end $$;


-- ── 1. LAS CAJAS ──
--
-- Efectivo y banco son dos saldos distintos, y esa separación es lo que
-- permite cuadrar la caja chica contra lo que hay físicamente en el sobre —
-- que es donde aparecen los descuadres reales.
--
-- Y va en TABLA, no en una columna con dos valores fijos: el día que aparezca
-- un Yape, una segunda cuenta o la caja de otra empresa, agregarla no puede
-- ser un despliegue.
--
-- `saldo_inicial` es la pieza que hace que el saldo sea verdad. Sin él, el
-- número que enseña la pantalla sería «la suma de lo que apunté desde que uso
-- esto», que no es el dinero que hay en el sobre — y se leería como si lo
-- fuera. Un saldo que no cuadra con la realidad enseña a no mirar el saldo.
create table if not exists caja (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  tipo          text not null default 'efectivo' check (tipo in ('efectivo', 'banco', 'otro')),
  saldo_inicial numeric(12,2) not null default 0,
  -- Desde cuándo cuenta ese saldo inicial. Sirve para saber qué se está
  -- sumando encima; sin fecha, el saldo inicial es un número sin origen.
  fecha_inicio  date,
  activa        boolean not null default true,
  orden         int not null default 0,
  creado_en     timestamptz default now()
);

comment on column caja.saldo_inicial is
  'Lo que había cuando se empezó a usar el sistema. Sin esto el saldo sería solo la suma de lo apuntado, que no es el dinero que hay.';


-- ── 2. LAS CUENTAS (las categorías) ──
--
-- «Gastos Oficina», «Gastos Cobertura», «Ingresos por cobertura»… En tabla y
-- no en el código por la misma razón que las cajas: se van a partir, renombrar
-- y ampliar, y cada cambio sería un despliegue.
--
-- `activa` en vez de borrar: una cuenta que se deja de usar tiene historia
-- detrás. Borrarla dejaría movimientos huérfanos o —peor— obligaría a
-- reasignarlos, que es falsear el pasado para limpiar una lista.
create table if not exists cuenta_caja (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  -- Una cuenta es de entrada o de salida, nunca las dos. Así el movimiento no
  -- tiene que declarar su signo: lo dice la cuenta que se elige, y no puede
  -- haber «un ingreso en Gastos Oficina».
  flujo   text not null check (flujo in ('ingreso', 'egreso')),
  activa  boolean not null default true,
  orden   int not null default 0,
  unique (nombre, flujo)
);


-- ── 3. LOS MOVIMIENTOS ──
create table if not exists movimiento_caja (
  id          uuid primary key default gen_random_uuid(),
  caja_id     uuid not null references caja(id) on delete restrict,
  fecha       date not null,
  monto       numeric(12,2) not null check (monto > 0),
  descripcion text,

  -- La cuenta dice si entra o sale. Es nula SOLO en los traspasos, que no son
  -- ni ingreso ni egreso.
  cuenta_id   uuid references cuenta_caja(id) on delete restrict,

  -- ── EL TRASPASO, Y POR QUÉ TIENE SU PROPIA COLUMNA ──
  -- Depositar en el banco el efectivo de una cobertura no es un gasto ni un
  -- ingreso: la plata sigue siendo la misma, cambió de sitio. Apuntado como
  -- dos movimientos sueltos inflaría los egresos del mes Y los ingresos del
  -- mes con dinero que nunca entró ni salió del negocio — y el resumen mensual,
  -- que es para lo que existe esta pantalla, quedaría inservible.
  -- Con destino: sale de `caja_id`, entra en `caja_destino`, y los totales
  -- del mes lo ignoran.
  caja_destino uuid references caja(id) on delete restrict,

  -- A qué cobertura o proyecto pertenece, cuando pertenece a alguno. Opcional
  -- porque el gasto de oficina no es de nadie en particular.
  proyecto_id uuid references proyectos(id) on delete set null,

  url         text,   -- foto del recibo, captura del Yape
  creado_en   timestamptz default now(),
  creado_por  uuid references perfiles(id),

  -- O es un movimiento con cuenta, o es un traspaso. Nunca las dos ni ninguna:
  -- sin este check cabría una fila sin cuenta y sin destino, que no se sabría
  -- ni sumar ni ignorar.
  constraint mov_caja_clase check (
    (cuenta_id is not null and caja_destino is null)
    or (cuenta_id is null and caja_destino is not null)
  ),
  -- Un traspaso a la misma caja no mueve nada y descuadra la lectura.
  constraint mov_caja_destino_distinto check (caja_destino is null or caja_destino <> caja_id)
);

create index if not exists idx_movcaja_fecha   on movimiento_caja(fecha);
create index if not exists idx_movcaja_caja    on movimiento_caja(caja_id, fecha);
create index if not exists idx_movcaja_proy    on movimiento_caja(proyecto_id);
-- El otro lado del traspaso: el saldo de la caja que RECIBE se calcula
-- buscando por aquí, y sin índice eso recorre el libro entero.
create index if not exists idx_movcaja_destino on movimiento_caja(caja_destino);


-- ── 4. PERMISOS ──
-- Leer, todo el equipo. Escribir, administración o finanzas: es la caja de la
-- empresa, no un gasto personal.
alter table caja            enable row level security;
alter table cuenta_caja     enable row level security;
alter table movimiento_caja enable row level security;

do $$
declare t text;
begin
  foreach t in array array['caja', 'cuenta_caja', 'movimiento_caja'] loop
    execute format('drop policy if exists "leer_%s"   on %I', t, t);
    execute format('drop policy if exists "crear_%s"  on %I', t, t);
    execute format('drop policy if exists "editar_%s" on %I', t, t);
    execute format('drop policy if exists "borrar_%s" on %I', t, t);
    execute format('create policy "leer_%s"   on %I for select to authenticated using (true)', t, t);
    execute format('create policy "crear_%s"  on %I for insert to authenticated with check (public.es_finanzas())', t, t);
    execute format('create policy "editar_%s" on %I for update to authenticated using (public.es_finanzas()) with check (public.es_finanzas())', t, t);
    execute format('create policy "borrar_%s" on %I for delete to authenticated using (public.es_finanzas())', t, t);
  end loop;
end $$;


-- ── 5. SEMILLAS ──
-- Dos cajas y unas cuentas para empezar. Se editan y se amplían desde la
-- pantalla; esto solo evita que el primer día haya que crear todo antes de
-- poder apuntar nada.
-- `on conflict do nothing` no sirve en `caja` (no hay unique por nombre), así
-- que se comprueba antes: correrlo dos veces no debe duplicar las cajas.
insert into caja (nombre, tipo, orden)
select 'Efectivo', 'efectivo', 1
 where not exists (select 1 from caja where tipo = 'efectivo');
insert into caja (nombre, tipo, orden)
select 'Banco', 'banco', 2
 where not exists (select 1 from caja where tipo = 'banco');

insert into cuenta_caja (nombre, flujo, orden) values
  ('Ingresos por cobertura', 'ingreso', 1),
  ('Otros ingresos',         'ingreso', 9),
  ('Gastos Cobertura',       'egreso',  1),
  ('Gastos Oficina',         'egreso',  2),
  ('Transporte',             'egreso',  3),
  ('Alimentación',           'egreso',  4),
  ('Equipos y mantenimiento','egreso',  5),
  ('Servicios y plataformas','egreso',  6),
  ('Otros gastos',           'egreso',  9)
on conflict (nombre, flujo) do nothing;

-- ⚠ Ojo al reejecutar: una cuenta RENOMBRADA («Transporte» → «Movilidad»)
-- vuelve a crearse con su nombre viejo, porque el `on conflict` mira el
-- nombre. Quedaría la categoría duplicada. Apagar una cuenta sí sobrevive.
-- Si ya renombraste cuentas, salta este bloque al volver a correr el archivo.


-- ── 6. EL SALDO INICIAL, A MANO ──
-- Cuánto había en cada caja el día que se empieza. Es el único dato que el
-- sistema no puede deducir, y sin él el saldo no es el dinero que hay.
--
--   update caja set saldo_inicial = 1250.00, fecha_inicio = '2026-08-14'
--    where tipo = 'efectivo';
--   update caja set saldo_inicial = 8400.00, fecha_inicio = '2026-08-14'
--    where tipo = 'banco';
