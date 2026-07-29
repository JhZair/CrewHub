-- ============================================================
--  CASILLA DAFO — los correos de las postulaciones, en un solo sitio
--
--  El problema que resuelve: cada postulación registra un correo distinto, y
--  DAFO avisa por la casilla de su plataforma PERO también por correo. Con
--  diez cuentas y sin fecha conocida de aviso, la única forma de no perderse
--  una notificación era abrir diez bandejas todos los días. Eso no es un
--  problema de correo: es información dispersa sin sitio donde aterrizar.
--
--  Aquí aterriza. Un Apps Script en el buzón maestro (scripts/casilla-dafo.gs)
--  empuja cada correo nuevo a /api/ingesta/dafo, que lo guarda en esta tabla,
--  lo vincula a su postulación y crea la notificación — que el despachador de
--  push ya existente lleva al celular. El ritual diario se cambia por: si no
--  vibró, no hay nada.
--
--  `gmail_msg_id` es único a propósito: es la línea de defensa contra los
--  duplicados. El Apps Script puede reenviar el mismo hilo (una etiqueta mal
--  puesta, una corrida a mano, un reintento) y aquí no pasa dos veces.
--
--  `vinculo_por` guarda CÓMO se supo de qué postulación es, no solo cuál:
--    · codigo  — el código DAFO venía en el asunto (lo dijo el correo)
--    · cuenta  — se dedujo de la cuenta que lo recibió y su empresa
--    · manual  — lo dijo una persona en el panel
--  Sin esa columna, un vínculo deducido y uno confirmado se ven igual, y
--  cuando el deducido se equivoca nadie sabe a qué creerle.
--
--  Correr en: Supabase → SQL Editor. Idempotente, SIN transacción externa.
-- ============================================================

create table if not exists dafo_comunicaciones (
  id              uuid primary key default gen_random_uuid(),
  -- Identidad del mensaje en Gmail. El id es la llave anti-duplicado; el
  -- hilo es lo que se enlaza (un correo suelto no tiene página, la
  -- conversación sí).
  gmail_msg_id    text not null unique,
  gmail_thread_id text,
  -- El buzón maestro donde cayó (a dónde reenvían las diez cuentas). Se
  -- guarda porque el link a Gmail se arma con él: sin saber en qué cuenta
  -- está el mensaje, el enlace deja al lector en la bandeja equivocada.
  buzon           text,
  -- La cuenta de la POSTULACIÓN: el destinatario original, el que dice de
  -- qué expediente es. Es el dato que el reenvío conserva y el que se
  -- perdería si solo mirásemos el buzón maestro.
  cuenta          text,
  remitente       text,
  asunto          text,
  extracto        text,
  recibido_en     timestamptz not null,
  postulacion_id  uuid references postulaciones(id) on delete set null,
  empresa_id      uuid references empresas(id) on delete set null,
  vinculo_por     text,                       -- codigo | cuenta | manual | null
  -- ¿Pide algo? Detectado por palabras (subsanación, requerimiento, plazo…)
  -- en lib/casilla.ts. Es una SOSPECHA, no un veredicto: sube el correo al
  -- tope de la lista, nunca decide por nadie.
  pide_accion     boolean default false,
  leido_en        timestamptz,
  leido_por       uuid references perfiles(id),
  -- El caso que se abrió desde este correo, si alguien decidió que había
  -- trabajo. Un correo no es una tarea hasta que una persona lo dice.
  caso_id         uuid references publicaciones(id) on delete set null,
  creado_en       timestamptz default now()
);

create index if not exists idx_dafo_com_fecha on dafo_comunicaciones(recibido_en desc);
create index if not exists idx_dafo_com_post  on dafo_comunicaciones(postulacion_id, recibido_en desc);
-- Índice parcial: la consulta que más corre es «qué hay sin leer», y sin
-- leer siempre son pocas frente al histórico.
create index if not exists idx_dafo_com_sinleer on dafo_comunicaciones(recibido_en desc)
  where leido_en is null;

alter table dafo_comunicaciones enable row level security;

-- `drop ... if exists` antes de cada `create`: create policy no tiene
-- «if not exists» y estos archivos siempre se corren dos veces.
drop policy if exists "leer_dafo_com"   on dafo_comunicaciones;
drop policy if exists "crear_dafo_com"  on dafo_comunicaciones;
drop policy if exists "editar_dafo_com" on dafo_comunicaciones;

create policy "leer_dafo_com"   on dafo_comunicaciones for select to authenticated using (true);
-- La ingesta entra con service_role (salta RLS); este insert es para el
-- registro a mano desde el panel, cuando algo llegó por otra vía.
create policy "crear_dafo_com"  on dafo_comunicaciones for insert to authenticated with check (true);
create policy "editar_dafo_com" on dafo_comunicaciones for update to authenticated using (true);

-- ── El aviso tiene que llevar a alguna parte ──
-- Misma lección que objeto_id y prestamo_id: una notificación sin columna
-- propia llega a la campanita y no es clicable. Suena y no lleva a nada.
alter table notificaciones add column if not exists dafo_id uuid
  references dafo_comunicaciones(id) on delete cascade;

-- ── Realtime: que el panel se pinte sin recargar ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'dafo_comunicaciones'
  ) then
    alter publication supabase_realtime add table dafo_comunicaciones;
  end if;
end $$;

-- Verificación: 1 tabla, 3 políticas, la columna del aviso y el realtime.
select
  (select count(*) from information_schema.tables
    where table_name = 'dafo_comunicaciones')                          as tabla,
  (select count(*) from pg_policies
    where tablename = 'dafo_comunicaciones')                           as politicas,
  (select count(*) from information_schema.columns
    where table_name = 'notificaciones' and column_name = 'dafo_id')   as notif_dafo_id,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'dafo_comunicaciones') as realtime;
