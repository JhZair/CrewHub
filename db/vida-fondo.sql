-- ============================================================
--  db/vida-fondo.sql — LA VIDA DE UN FONDO, DE PRINCIPIO A CIERRE
--
--  Un fondo dura dos años y lo que decide si acaba bien no son las cifras: son
--  cuatro o cinco MOMENTOS. El acta que se firma, la plata que llega, la carta
--  de requerimiento que nadie vio, la llamada en la que DAFO dijo «recién
--  estamos revisando su informe». Hoy esos momentos viven en la memoria de
--  quien estuvo, y la memoria no sirve para un descargo.
--
--  ── LO QUE ESTA TABLA NO GUARDA ──
--  No guarda las cuatro fechas del acta (firma, desembolso, límite de
--  rendición, prórroga). Esas ya son columnas de `postulaciones` y la línea de
--  tiempo las LEE. Copiarlas aquí daría dos respuestas a «¿cuándo vence?», y
--  el día que difieran no habría manera de saber cuál manda.
--  Tampoco guarda la conversación: para eso está el caso (`publicacion_id`).
--  Aquí va el titular —una línea— y el enlace a dónde está lo demás.
--
--  ── POR QUÉ HACE FALTA MARCARLOS A MANO ──
--  De doscientos casos de un fondo, hitos son cinco. Ninguna regla automática
--  sabe cuál de ellos habrá que enseñarle a DAFO dentro de un año; la persona
--  que hizo la llamada, sí. La máquina acota, la persona decide.
--
--  ── Y LAS CARTAS DE LA CASILLA ELECTRÓNICA ──
--  No van en una tabla nueva: van en `dafo_comunicaciones`, la misma bandeja
--  donde ya aterrizan los correos. Es la misma pregunta —«¿qué nos ha dicho
--  DAFO?»— y dos bandejas serían dos respuestas. Lo que cambia es de dónde
--  vienen: el correo lo empuja el Apps Script; la carta de la Plataforma
--  Virtual la escribe una persona que entró a mirar, porque esa plataforma no
--  tiene API y aquí no se guardan claves de nadie.
--
--  Idempotente. Al final verifica.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1 · LOS HITOS ESCRITOS A MANO
-- ────────────────────────────────────────────────────────────
create table if not exists hito_fondo (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  /* El DÍA en que pasó, no cuándo se apuntó. Se apunta tarde casi siempre —la
     llamada del martes se escribe el jueves— y la línea de tiempo tiene que
     ordenarse por lo primero. Por eso `date` y no `timestamptz`: nadie recuerda
     la hora de una llamada de hace tres meses, y pedirla haría que se
     inventara. */
  fecha          date not null,
  /* llamada | reunion | envio | recepcion | visita | acuerdo | otro
     Texto y no enum: el día que aparezca «inspección» no debería hacer falta
     una migración para poder apuntarla. La pantalla ofrece los conocidos. */
  tipo           text not null default 'otro',
  titulo         text not null,
  /* Lo que se dijo, con las palabras de quien estuvo. Es lo que se relee para
     armar un descargo, así que se guarda entero y sin resumir. */
  detalle        text,
  /* La prueba, si la hay: el PDF del cargo, el acta de la reunión, el correo. */
  url            text,
  /* El caso donde está la conversación completa. Un hito no reemplaza al caso:
     lo señala. */
  publicacion_id uuid references publicaciones(id) on delete set null,
  creado_por     uuid references perfiles(id),
  creado_en      timestamptz default now()
);

create index if not exists idx_hito_fondo_post on hito_fondo(postulacion_id, fecha desc);

alter table hito_fondo enable row level security;

-- `drop ... if exists` antes de cada `create`: create policy no tiene
-- «if not exists» y estos archivos se corren dos veces por definición.
drop policy if exists "leer_hito"   on hito_fondo;
drop policy if exists "crear_hito"  on hito_fondo;
drop policy if exists "editar_hito" on hito_fondo;
drop policy if exists "borrar_hito" on hito_fondo;

/* Escribe todo el equipo. Quien hizo la llamada es quien sabe qué se dijo, y
   pedirle permiso de administración para apuntarlo habría hecho que no se
   apuntara —que es exactamente el estado del que venimos—. Lo que está
   protegido es el dinero; esto es la memoria. */
create policy "leer_hito"   on hito_fondo for select to authenticated using (true);
create policy "crear_hito"  on hito_fondo for insert to authenticated with check (true);
create policy "editar_hito" on hito_fondo for update to authenticated using (true) with check (true);
create policy "borrar_hito" on hito_fondo for delete to authenticated using (true);

-- ────────────────────────────────────────────────────────────
-- 2 · LA BANDEJA APRENDE A RECIBIR CARTAS DE LA PLATAFORMA
-- ────────────────────────────────────────────────────────────

/* De dónde vino: `gmail` (lo empujó el Apps Script) o `casilla` (lo registró
   una persona que entró a la Plataforma Virtual). Se guarda porque un dato que
   llegó solo y uno que escribió alguien no valen lo mismo cuando hay que
   defenderlo. Default `gmail`: todo lo que ya está en la tabla vino de ahí. */
alter table dafo_comunicaciones add column if not exists origen text not null default 'gmail';

/* El número de la carta, tal cual («CARTA N° 000500-2025-DAFO-DGIA-VMPCIC/MC»).
   ⚠ ES LA LLAVE ANTI-DUPLICADO. La misma carta aparece CUATRO veces en la
   casilla de PO-005, notificada el mismo día a la misma hora: sin esto, cada
   pasada por la bandeja la registraría otra vez y la línea de tiempo diría que
   DAFO requirió cuatro veces. */
alter table dafo_comunicaciones add column if not exists doc_numero text;
/* El PDF de la carta («Ver Documento»), que es la prueba. */
alter table dafo_comunicaciones add column if not exists doc_url text;
/* El código del validador documental del Ministerio («SXP0Y4A»), que sale
   impreso al pie de cada carta. Con él se comprueba en su web que el PDF que
   tenemos es el que ellos emitieron —y en un descargo, esa es la diferencia
   entre enseñar un documento y enseñar una prueba—. */
alter table dafo_comunicaciones add column if not exists doc_codigo text;
/* Quién la firma. No es adorno: la carta la firma una dirección concreta y a
   esa se le responde. */
alter table dafo_comunicaciones add column if not exists firmante text;
/* Hasta cuándo hay que contestar, y cuándo se contestó.
   Un requerimiento NO es historia, es un reloj: «SEGUNDO REQUERIMIENTO» quiere
   decir que ya pasó un plazo. `pide_accion` decía que algo pedía algo; esto
   dice para cuándo, que es lo que permite avisar antes y no después. */
alter table dafo_comunicaciones add column if not exists responder_hasta date;
alter table dafo_comunicaciones add column if not exists respondido_en date;
/* Con qué se respondió: el cargo, el oficio, el correo enviado. */
alter table dafo_comunicaciones add column if not exists respuesta_url text;

/* Una carta registrada a mano no tiene id de Gmail. La columna era
   `not null unique`; se le quita el NOT NULL y el unique sigue valiendo para
   las que sí lo traen —en Postgres un índice único ignora los nulos, así que
   veinte cartas sin gmail_msg_id no chocan entre sí ni con nada—. */
alter table dafo_comunicaciones alter column gmail_msg_id drop not null;

/* Y el número de carta, único entre las que lo tienen.
   ⚠ ÍNDICE COMPLETO, NO PARCIAL. La primera versión llevaba
   `where doc_numero is not null` —parecía lo fino— y eso ROMPE el `upsert`:
   Postgres solo infiere un índice parcial si la sentencia repite su WHERE, y
   PostgREST no lo hace, así que `on conflict (doc_numero)` fallaba con 42P10
   en el PRIMER registro, no en el duplicado. Un índice único normal ya ignora
   los nulos, que era todo lo que hacía falta: los cientos de correos sin
   número no chocan entre sí.
   El `drop` va delante porque `create ... if not exists` no cambia el índice
   que ya esté puesto, y quien haya corrido la versión anterior se quedaría con
   el parcial y con el fallo. */
drop index if exists idx_dafo_com_docnum;
/* Con un DO y no a pelo: si por lo que fuera ya hubiera dos filas con el mismo
   número, un `create unique index` suelto ABORTA el archivo entero —y las
   columnas de arriba se habrían creado, así que la mitad del cambio quedaría
   puesta y la otra mitad no—. Así se dice qué pasa y se sigue. */
do $$
declare repes int;
begin
  select count(*) into repes from (
    select doc_numero from dafo_comunicaciones
     where doc_numero is not null group by doc_numero having count(*) > 1) x;
  if repes > 0 then
    raise warning 'Hay % número(s) de carta repetidos: el índice único NO se creó. Búscalos con: select doc_numero, count(*) from dafo_comunicaciones where doc_numero is not null group by 1 having count(*) > 1;', repes;
  else
    create unique index idx_dafo_com_docnum on dafo_comunicaciones(doc_numero);
  end if;
end $$;

/* Lo que vence y no se ha contestado: la consulta que va a correr cada día. */
create index if not exists idx_dafo_com_responder
  on dafo_comunicaciones(responder_hasta)
  where responder_hasta is not null and respondido_en is null;

-- Borrar una carta registrada a mano (un número mal tecleado) tiene que ser
-- posible: hoy la tabla no tiene política de delete, así que ni un admin puede.
drop policy if exists "borrar_dafo_com" on dafo_comunicaciones;
create policy "borrar_dafo_com" on dafo_comunicaciones for delete to authenticated
  /* SOLO lo registrado a mano. Un correo de la ingesta no se borra: es la
     prueba de que DAFO escribió, y si molesta se marca leído. */
  using (origen <> 'gmail');

-- ── VERIFICAR ──
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'hito_fondo')            as tabla_hitos,
  (select count(*) from pg_policies where tablename = 'hito_fondo')        as politicas_hitos,
  (select count(*) from information_schema.columns
    where table_name = 'dafo_comunicaciones'
      and column_name in ('origen','doc_numero','doc_url','doc_codigo','firmante',
                          'responder_hasta','respondido_en','respuesta_url')) as columnas_nuevas,
  (select is_nullable from information_schema.columns
    where table_name = 'dafo_comunicaciones' and column_name = 'gmail_msg_id') as gmail_opcional,
  (select count(*) from pg_indexes
    where tablename = 'dafo_comunicaciones' and indexname = 'idx_dafo_com_docnum') as indice_numero;
