-- ============================================================
--  db/guion-beats.sql — LA ESPINA DE LA HISTORIA
--
--  El modelo estructural no es un rótulo: es el orden completo de la
--  historia. Dónde va el detonante, dónde el punto medio, dónde la caída.
--  Hasta ahora esos beats vivían en lib/guion.ts y no llegaban a la
--  pantalla —solo se sembraban los actos—, así que la plantilla decía
--  «Save the Cat» y no guiaba nada.
--
--  ── POR QUÉ BAJAN A LA BASE ──
--  El catálogo es de Field, Snyder, Campbell y Truby, y ahí se queda:
--  canon que no se administra. Pero la ESPINA es de esta película. En
--  cuanto alguien escribe «aquí Yanay descubre que Yaxtron la vigila»,
--  eso ya no es la plantilla: es la historia, y tiene que sobrevivir a
--  cambiar de modelo estructural. Por eso los beats se siembran DESDE el
--  catálogo y a partir de ahí son del proyecto.
--
--  ── LA PLANTILLA SIGUE SIENDO UNA CAPA ──
--  El beat apunta a la secuencia que lo carga (`secuencia_id`), no al
--  revés. La secuencia no sabe qué beat le tocó. Se puede quitar un beat
--  entero sin que la secuencia se entere.
--
--  Correr DESPUÉS de db/guion.sql. Idempotente y sin transacción.
-- ============================================================

create table if not exists guion_beats (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references proyectos(id) on delete cascade,
  /* De dónde salió: «save-the-cat:catalizador». Sirve para sembrar sin
     duplicar —se añaden los que faltan, no todos otra vez— y para saber
     qué beats son de qué modelo cuando conviven dos. */
  clave        text,
  nombre       text not null,
  /* Qué tiene que conseguir. Viaja copiado del catálogo, no referenciado:
     si mañana se reescribe la guía de «Catalizador», los guiones ya
     escritos siguieron la que leyeron, no la nueva. */
  que          text,
  tipo         text not null default 'estado',   -- giro | inflexion | estado
  pos          numeric(5,2),                     -- % de metraje esperado
  acto_id      uuid references guion_actos(id) on delete set null,
  /* Qué secuencia lo carga. `set null`: borrar una secuencia deja el beat
     huérfano y VISIBLE —«sin secuencia»—, que es justo lo que hay que
     saber. Borrarlo con ella escondería un agujero en la estructura. */
  secuencia_id uuid references guion_secuencias(id) on delete set null,
  /* Lo que pasa aquí EN ESTA historia. `que` es la guía genérica; esto es
     la película. Es el puente entre el modelo y el tratamiento, y es lo
     que nunca se puede perder al cambiar de plantilla. */
  nota         text,
  orden        int not null default 0,
  creado_en    timestamptz not null default now()
);

create index if not exists idx_guion_beats_proy on guion_beats(proyecto_id, orden);
create index if not exists idx_guion_beats_acto on guion_beats(acto_id);
create index if not exists idx_guion_beats_sec  on guion_beats(secuencia_id);
/* Sembrar dos veces no puede duplicar la espina. Parcial porque `clave` es
   nulo en los beats que el autor inventa, y de esos puede haber los que
   quiera con el mismo nombre. */
create unique index if not exists idx_guion_beats_unico
  on guion_beats(proyecto_id, clave) where clave is not null;

alter table guion_beats enable row level security;
drop policy if exists gb_sel on guion_beats;
drop policy if exists gb_ins on guion_beats;
drop policy if exists gb_upd on guion_beats;
drop policy if exists gb_del on guion_beats;
create policy gb_sel on guion_beats for select to authenticated using (true);
create policy gb_ins on guion_beats for insert to authenticated with check (true);
create policy gb_upd on guion_beats for update to authenticated using (true) with check (true);
create policy gb_del on guion_beats for delete to authenticated using (true);

-- ── VERIFICACIÓN ──
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'guion_beats')  as tabla,
  (select count(*) from pg_policies where tablename = 'guion_beats') as politicas,
  (select count(*) from pg_indexes
    where tablename = 'guion_beats' and indexname = 'idx_guion_beats_unico') as indice_unico,
  (select count(*) from guion_beats)                               as beats_existentes;
-- tabla = 1 · politicas = 4 · indice_unico = 1
