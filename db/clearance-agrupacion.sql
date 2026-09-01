-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-agrupacion.sql — LA BANDA COMO ENTIDAD, Y SUS INTEGRANTES
--
--  ⚠ PRIMERO DE LA SERIE `clearance-*`. Orden obligatorio:
--       1. clearance-agrupacion.sql   ← este
--       2. clearance-obra.sql
--       3. clearance-autorizacion.sql (las referencia a las dos)
--
-- El caso que lo pidió: Las Patronas tocan tres días en el cargo de Lino. Su
-- líder, Jennifer Pachaqutec, firmó. Son más de diez integrantes y del resto no
-- teníamos ni los nombres.
--
-- ── POR QUÉ UNA TABLA Y NO UN TEXTO ──
-- Porque «Las Patronas» escrito en la nota de Jennifer no permite contestar la
-- única pregunta que importa: ¿cuántas de las once han firmado? Un texto libre
-- no se cuenta, no se cruza y no avisa. Una tabla sí, y entonces la pantalla
-- puede decir «1 de 11» en vez de dejar creer que con la firma de la líder está
-- todo resuelto — que es exactamente lo que el sistema hacía hasta hoy.
--
-- ── LA FIRMA DE LA REPRESENTANTE NO CUBRE A LAS REPRESENTADAS ──
-- Es la regla R1 del modelo, y es la razón de que exista esta migración.
-- Jennifer puede comprometer a la banda como colectivo —que toquen, que se les
-- grabe— pero el derecho de intérprete de cada música es de cada música. Lo
-- dice el D. Leg. 822 sobre los derechos conexos del artista intérprete o
-- ejecutante: son personales.
-- La tabla no impone esa regla —Postgres no puede— pero la hace expresable:
-- `firmo_anexo` por integrante, y el recuento sale de ahí.
--
-- ── ESTO ES CATÁLOGO GLOBAL, NO DEL PROYECTO ──
-- Ni `agrupacion` ni `agrupacion_integrante` llevan `proyecto_id`, a propósito.
-- Conseguir los once nombres de una banda cuesta semanas la primera vez y está
-- listo para siempre a partir de la segunda: la banda es la misma en Yaurisque
-- 2026 y en lo que se ruede en 2027.
-- Lo que SÍ es por proyecto son las firmas, y esas viven en `autorizacion`
-- (archivo 3), con su `proyecto_id` NOT NULL. El conocimiento se reutiliza; el
-- permiso, nunca.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists agrupacion (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,

  /* Vocabulario cerrado: con texto libre, «banda» y «Banda» y «banda de
     músicos» serían tres tipos para cualquier recuento. */
  tipo    text not null default 'otro'
          check (tipo in ('banda_musicos','conjunto_danza','cuadrilla',
                          'hermandad','otro')),

  /* De dónde son. En un documental de fiesta patronal la procedencia es medio
     nombre de la agrupación —hay una banda de cada distrito— y es lo que
     permite distinguir dos con el mismo nombre. */
  procedencia text,

  /* ── QUIÉN FIRMA POR EL COLECTIVO ──
     ⚠ `on delete set null`: si se borra la ficha de la persona, la agrupación
     se queda sin representante pero NO desaparece. Perder a las once
     integrantes porque alguien depuró una ficha sería lo contrario de lo que
     esta tabla existe para evitar. */
  representante_id uuid references personas(id) on delete set null,

  /* Lo que dice el representante que son, que puede no coincidir con las filas
     que hayamos conseguido apuntar. La diferencia entre este número y el
     recuento real de `agrupacion_integrante` ES el dato: «Jennifer dice que son
     once y tenemos cuatro nombres» es una tarea, no un error. */
  numero_integrantes_declarado int check (numero_integrantes_declarado is null
                                          or numero_integrantes_declarado >= 0),

  contacto_telefono text,

  /* Otros nombres con los que aparece la misma banda. Sirve para no crearla
     dos veces al cargar un proyecto nuevo (§9.6 del modelo). */
  alias   text[] not null default '{}',
  nota    text,

  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

/* ── SIN ÚNICO POR NOMBRE ──
   Dos bandas pueden llamarse igual en distritos distintos, y la que se llama
   como otra existe de verdad. La deduplicación se hace ofreciendo coincidencias
   al crear, no impidiendo crear. */
create index if not exists idx_agrupacion_nombre on agrupacion(lower(nombre));

alter table agrupacion drop constraint if exists agrupacion_tipo;
alter table agrupacion add constraint agrupacion_tipo
  check (tipo in ('banda_musicos','conjunto_danza','cuadrilla','hermandad','otro'));

comment on table agrupacion is
  'Banda, conjunto de danza, cuadrilla o hermandad. Catálogo GLOBAL, sin '
  'proyecto_id: la banda es la misma en todos los documentales. Las firmas de '
  'sus integrantes sí son por proyecto y viven en autorizacion.';

-- ------------------------------------------------------------
--  LAS TRES SEÑALES QUE SÍ CRUZAN DE PROYECTO
--
--  ⚠ Van en `personas`, que es catálogo global, y NO en el puente por proyecto.
--  Es deliberado y es la única excepción a «el permiso no cruza»: estas tres no
--  son permisos, son hechos sobre la persona o sobre su voluntad, y valen igual
--  en todos los documentales.
--
--  `es_menor_de_edad` sostiene la regla más grave del modelo (R5): sin la firma
--  de su representante legal, la aparición de un menor solo se resuelve
--  desenfocando o descartando. La regla estaba escrita en lib/clearance.ts y
--  leía DOS COLUMNAS QUE NO EXISTÍAN — o sea, no podía dispararse nunca, y el
--  día que alguien la conectara la consulta habría fallado entera con un 42703.
--
--  `fecha_nacimiento` está para que la minoría de edad deje de aplicar SOLA.
--  Con solo el booleano, quien cumple dieciocho se queda marcado como menor
--  para siempre y hay que acordarse de desmarcarlo, que es lo que no pasa.
--  Cuando hay fecha, manda la fecha; el booleano es el respaldo para cuando
--  solo se sabe «es un niño».
-- ------------------------------------------------------------
alter table personas add column if not exists fecha_nacimiento date;
alter table personas add column if not exists es_menor_de_edad boolean not null default false;
/* Padre, madre o tutor. `set null` y no `cascade`: si se borra la ficha del
   representante, el menor sigue siendo menor — y lo que hay que ver entonces es
   que le falta representante, no que dejó de necesitarlo. */
alter table personas add column if not exists representante_legal_id uuid
  references personas(id) on delete set null;
/* Bloquea la creación de solicitudes nuevas en CUALQUIER proyecto. Se respeta
   siempre: es la voluntad de la persona, no un estado de un expediente. */
alter table personas add column if not exists solicito_no_ser_contactada boolean not null default false;
/* Cambia quién puede autorizar el uso de su imagen. También aplica en todos. */
alter table personas add column if not exists fallecida boolean not null default false;

comment on column personas.es_menor_de_edad is
  'Dispara R5: su imagen solo la puede autorizar su representante legal. Si hay '
  'fecha_nacimiento, manda la fecha y esto es el respaldo.';
comment on column personas.solicito_no_ser_contactada is
  'La persona pidió que no se la contacte. Se respeta en TODOS los proyectos. '
  '⚠ Un rechazo en un proyecto concreto NO se propaga: eso es historial, no un '
  'bloqueo. Quien no quiso salir en un documental puede aceptar en otro.';

-- ------------------------------------------------------------
--  QUIÉN LA INTEGRA
-- ------------------------------------------------------------
create table if not exists agrupacion_integrante (
  id           uuid primary key default gen_random_uuid(),
  agrupacion_id uuid not null references agrupacion(id) on delete cascade,

  /* ── UNA PERSONA DE VERDAD, NO UN NOMBRE ──
     Cuesta más de conseguir y es lo único que permite que su firma cuente: una
     autorización la otorga una `persona`, y sin ficha no hay a quién atarla.
     `cascade` aquí sí: una fila de «pertenece a esta banda» sin persona no
     significa nada. Lo que no se borra es la AUTORIZACIÓN, que cuelga del
     proyecto y sobrevive a que alguien salga de la banda. */
  persona_id   uuid not null references personas(id) on delete cascade,

  /* «Clarinete», «bombo», «primera voz», «capitana». Texto libre a propósito:
     el instrumentario de una banda de pueblo no cabe en ningún enum. */
  instrumento_rol text,

  /* ⚠ SOLO COMO ATAJO DE LECTURA, NO COMO LA VERDAD.
     La verdad de si alguien firmó está en `autorizacion` —una firma es por
     proyecto y esta tabla es global, así que aquí no puede vivir—. Este
     booleano existe para el caso de la productora que trabaja un solo
     documental y quiere marcar de un vistazo a quién ya le tomó el anexo.
     El recuento «n de m» de la pantalla NO sale de aquí: sale de contar
     autorizaciones firmadas del proyecto que se está mirando. Si algún día los
     dos números discrepan, manda el de las autorizaciones. */
  firmo_anexo  boolean not null default false,

  orden        int not null default 0,
  nota         text,

  creado_en    timestamptz not null default now(),
  creado_por   uuid references perfiles(id)
);

/* La misma persona no puede estar dos veces en la misma banda: sería contarla
   dos veces en «n de m» y pedirle dos firmas por lo mismo.
   ⚠ Único TOTAL y no parcial, así que sí sirve para `on conflict`. */
create unique index if not exists uq_agr_integrante
  on agrupacion_integrante(agrupacion_id, persona_id);

/* Para la ficha de una persona: «¿en qué agrupaciones está?». Jennifer puede
   estar en dos, y su firma en una no dice nada de la otra. */
create index if not exists idx_agr_integrante_persona
  on agrupacion_integrante(persona_id);

comment on table agrupacion_integrante is
  'Quién toca en qué agrupación. Catálogo global: la banda es la misma entre '
  'documentales, y conseguir los once nombres se hace una vez. `firmo_anexo` '
  'es un atajo de lectura, NO la verdad: quién firmó es por proyecto y sale de '
  'contar autorizaciones.';

-- ── RLS: mismo criterio que el resto del catálogo ──
alter table agrupacion enable row level security;
drop policy if exists agr_sel on agrupacion;
drop policy if exists agr_ins on agrupacion;
drop policy if exists agr_upd on agrupacion;
drop policy if exists agr_del on agrupacion;
create policy agr_sel on agrupacion for select to authenticated using (true);
create policy agr_ins on agrupacion for insert to authenticated with check (true);
create policy agr_upd on agrupacion for update to authenticated using (true) with check (true);
create policy agr_del on agrupacion for delete to authenticated using (true);

alter table agrupacion_integrante enable row level security;
drop policy if exists agri_sel on agrupacion_integrante;
drop policy if exists agri_ins on agrupacion_integrante;
drop policy if exists agri_upd on agrupacion_integrante;
drop policy if exists agri_del on agrupacion_integrante;
create policy agri_sel on agrupacion_integrante for select to authenticated using (true);
create policy agri_ins on agrupacion_integrante for insert to authenticated with check (true);
create policy agri_upd on agrupacion_integrante for update to authenticated using (true) with check (true);
create policy agri_del on agrupacion_integrante for delete to authenticated using (true);

/* ── REALTIME ──
   Levantar once nombres es trabajo de varias personas a la vez y cada una tiene
   que ver lo que ya apuntó la otra. Una tabla NO publicada abre la suscripción,
   dice SUBSCRIBED y no emite nada, sin error — y eso se descubre tarde. */
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'agrupacion') then
    execute 'alter publication supabase_realtime add table public.agrupacion';
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'agrupacion_integrante') then
    execute 'alter publication supabase_realtime add table public.agrupacion_integrante';
  end if;
end $$;

-- ------------------------------------------------------------
-- VERIFICAR — las dos tablas en 1, ocho políticas, las dos publicadas.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('agrupacion','agrupacion_integrante')) as tablas_debe_ser_2,
  /* Que el único EXISTA y sea único de verdad: `create unique index if not
     exists` se salta en silencio si ya hay uno con ese nombre y otra forma. */
  (select count(*) from pg_indexes
    where schemaname='public' and indexname='uq_agr_integrante'
      and indexdef ilike '%unique%')                                        as indice_unico,
  (select count(*) from pg_policies
    where schemaname='public' and tablename in ('agrupacion','agrupacion_integrante')) as politicas_debe_ser_8,
  (select count(*) from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename in ('agrupacion','agrupacion_integrante'))              as en_realtime_debe_ser_2,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='personas'
      and column_name in ('fecha_nacimiento','es_menor_de_edad',
                          'representante_legal_id','solicito_no_ser_contactada',
                          'fallecida'))                                       as cols_persona_debe_ser_5,
  (select count(*) from agrupacion)                                          as agrupaciones,
  (select count(*) from agrupacion_integrante)                               as integrantes;
