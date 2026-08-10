-- ============================================================
--  db/guion.sql — LA LÍNEA DE TIEMPO NARRATIVA (vuelta 1)
--
--  Actos → secuencias → (escenas, que llegan en la vuelta 2).
--
--  ── LO QUE EL PROTOTIPO NO PODÍA TENER ──
--  En el prototipo HTML el ORDEN es la posición en el array: no hay
--  campo `orden` en ninguna entidad. En Postgres eso no existe —una
--  tabla no tiene orden— y sin una columna explícita el guion se
--  reordena solo en cuanto dos filas comparten `creado_en` o alguien
--  edita una secuencia. Es la única pieza que hubo que inventar.
--
--  ── EL CAMPO MADRE ──
--  `guion_secuencias.texto` es el tratamiento en prosa. El prototipo lo
--  dice en su propio comentario: «todo lo demás se deriva de él o se
--  mide de las escenas». Por eso el modelo empieza aquí y no por las
--  escenas: se escribe el tratamiento, y el guion se desarrolla contra
--  él.
--
--  ── LA PLANTILLA ES UNA CAPA ──
--  Las secuencias NO saben a qué plantilla pertenecen. La plantilla
--  (tres actos, Save the Cat…) vive en lib/guion.ts y lo único que se
--  guarda por proyecto es cuál está activa y qué beat cayó en qué sitio.
--  Así se cambia de modelo estructural sin tocar una palabra escrita.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ============================================================

-- ── 1. ACTOS ──
create table if not exists guion_actos (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  clave       text,                       -- "I", "II", "III" — como se rotula
  nombre      text not null,              -- "Planteamiento"
  orden       int  not null default 0,
  creado_en   timestamptz not null default now()
);

-- ── 2. SECUENCIAS — donde vive el tratamiento ──
create table if not exists guion_secuencias (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  /* `set null` y no `cascade`: borrar un acto no puede llevarse por
     delante el tratamiento escrito. La secuencia queda huérfana —y se
     ve, arriba, en «sin acto»— hasta que alguien la recoloque. */
  acto_id     uuid references guion_actos(id) on delete set null,
  nombre      text not null default 'Secuencia sin título',
  texto       text,                       -- EL TRATAMIENTO, en prosa
  /* Minutos que el autor le asigna. Nulo = «que lo estime por palabras»:
     un cero explícito y un «no lo he decidido» no son lo mismo, y con
     `default 0` no habría forma de distinguirlos. */
  minutos     numeric(5,2),
  orden       int  not null default 0,
  creado_en   timestamptz not null default now(),
  editado_en  timestamptz
);

-- ── 3. HILOS DE TRAMA ──
create table if not exists guion_hilos (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  nombre      text not null,
  color       text not null default '#a78bfa',
  orden       int  not null default 0,
  creado_en   timestamptz not null default now()
);

/* Qué hilos DECLARA cada secuencia. Cuando lleguen las escenas, ellas
   dirán qué hilos toca la película de verdad, y estas marcas quedarán
   como lo declarado: el mismo contraste «propuesto vs medido» que el
   prototipo usa en el cajón de secuencia. No es una fuente duplicada,
   son dos cosas distintas que conviene poder comparar. */
create table if not exists guion_secuencia_hilos (
  secuencia_id uuid not null references guion_secuencias(id) on delete cascade,
  hilo_id      uuid not null references guion_hilos(id) on delete cascade,
  primary key (secuencia_id, hilo_id)
);

-- ── 4. QUÉ PLANTILLA USA ESTE PROYECTO ──
--  Solo la clave. La plantilla en sí (sus beats y sus porcentajes) vive
--  en lib/guion.ts: es un canon que no se administra.
alter table proyectos add column if not exists guion_plantilla text;

create index if not exists idx_guion_actos_proy  on guion_actos(proyecto_id, orden);
create index if not exists idx_guion_secs_proy   on guion_secuencias(proyecto_id, orden);
create index if not exists idx_guion_secs_acto   on guion_secuencias(acto_id);
create index if not exists idx_guion_hilos_proy  on guion_hilos(proyecto_id, orden);

-- ── 5. RLS — leer y editar, igual que el resto de relaciones de proyecto ──
alter table guion_actos            enable row level security;
alter table guion_secuencias       enable row level security;
alter table guion_hilos            enable row level security;
alter table guion_secuencia_hilos  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['guion_actos','guion_secuencias','guion_hilos','guion_secuencia_hilos']
  loop
    execute format('drop policy if exists %I on %I', 'g_sel_' || t, t);
    execute format('drop policy if exists %I on %I', 'g_ins_' || t, t);
    execute format('drop policy if exists %I on %I', 'g_upd_' || t, t);
    execute format('drop policy if exists %I on %I', 'g_del_' || t, t);
    execute format('create policy %I on %I for select to authenticated using (true)', 'g_sel_' || t, t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', 'g_ins_' || t, t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', 'g_upd_' || t, t);
    execute format('create policy %I on %I for delete to authenticated using (true)', 'g_del_' || t, t);
  end loop;
end $$;

-- ── VERIFICACIÓN ──
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('guion_actos','guion_secuencias','guion_hilos','guion_secuencia_hilos'))
                                                            as tablas,
  (select count(*) from information_schema.columns
    where table_name = 'proyectos' and column_name = 'guion_plantilla')
                                                            as col_plantilla,
  (select count(*) from pg_policies
    where tablename in ('guion_actos','guion_secuencias','guion_hilos','guion_secuencia_hilos'))
                                                            as politicas;
-- tablas = 4 · col_plantilla = 1 · politicas = 16
