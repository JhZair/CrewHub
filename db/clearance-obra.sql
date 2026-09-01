-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-obra.sql — LA COMPOSICIÓN, LA GRABACIÓN Y EL USO: TRES COSAS
--
--  ⚠ SEGUNDO DE LA SERIE. Correr DESPUÉS de clearance-agrupacion.sql y ANTES
--    de clearance-autorizacion.sql. Requiere db/proyecto-obra.sql ya corrido.
--
-- ── QUÉ ESTABA MAL EN `proyecto_obra` ──
-- La tabla de ayer tenía una columna `origen` con siete valores, y esa columna
-- mezclaba tres preguntas distintas que se contestan por separado:
--
--     · CÓMO SUENA en la película   → en vivo, de una radio, de librería…
--     · DE QUIÉN ES LA COMPOSICIÓN  → autor, ISWC, dominio público
--     · QUÉ GRABACIÓN se usa        → productor fonográfico, intérpretes
--
-- Con las tres en un enum, «Valicha en dominio público» y «Valicha en la
-- grabación de 2019 de un sello» eran la misma fila, y no lo son ni de lejos:
-- la primera no necesita permiso de nadie y la segunda necesita el del
-- productor fonográfico. Una obra libre NO hereda su libertad a las grabaciones
-- que la contienen (regla R4 del modelo).
--
-- ── EL REPARTO NUEVO ──
--     `obra`          la composición. GLOBAL: quién escribió «Fatal Destino» y
--                     si está en dominio público es investigación factual, se
--                     hace una vez y sirve para siempre.
--     `grabacion`     el fonograma. GLOBAL por la misma razón.
--     `proyecto_obra` pasa a ser el PUENTE: qué obra/grabación suena en ESTA
--                     película, dónde y cómo. Lo específico del corte.
--
-- La tabla puente conserva su nombre a propósito: renombrarla a `obra_proyecto`
-- obligaría a tocar la pantalla, las acciones y el realtime para no ganar nada.
-- Lo que cambia es qué columnas lleva.
--
-- ── LOS CAMPOS DE LA IA VAN EN LA GRABACIÓN, NO EN LA OBRA ──
-- Suno produce las dos cosas a la vez y ninguna tiene autor humano, pero lo que
-- se descarga —lo que se pone en la línea de tiempo— es un fonograma. La
-- herramienta, el modelo y el plan describen cómo se obtuvo ESE archivo. La
-- «obra» que contiene existe, no tiene autor y por eso Indecopi no la registra.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · ANTES — para poder comparar al final.
-- ------------------------------------------------------------
select count(*) as obras_viejas,
       count(*) filter (where origen = 'ia_generada')  as de_ia,
       count(*) filter (where origen = 'biblioteca')   as de_libreria,
       count(*) filter (where origen = 'ambiente')     as de_ambiente
  from proyecto_obra;

-- ------------------------------------------------------------
-- 2 · LA OBRA — la composición, en el catálogo global
-- ------------------------------------------------------------
create table if not exists obra (
  id     uuid primary key default gen_random_uuid(),
  titulo text not null,

  tipo   text not null default 'musical'
         check (tipo in ('musical','coreografica','fotografica','audiovisual',
                         'literaria','artes_plasticas','otra')),

  /* ── QUIÉN LA ESCRIBIÓ ──
     Tres campos y no uno porque son tres situaciones distintas y hay que poder
     distinguirlas: el autor es alguien del proyecto, el autor es alguien de
     fuera que solo sabemos nombrar, o el autor NO SE SABE. Y «no se sabe» es un
     dato, no un hueco: con el nombre en blanco, una obra sin autor identificado
     y una obra que nadie ha mirado se ven igual.
     ⚠ `autor_conocido = false` es lo que enciende el aviso. */
  autor_conocido boolean not null default false,
  autor_persona_id uuid references personas(id) on delete set null,
  autor_nombre_libre text,
  /* Puede no ser el autor: una editorial, un heredero. Es a quién se le pide. */
  titular_derechos_nombre text,

  /* Lo único que desempata. Hay QUINCE «Fatal Destino» en el catálogo de
     APDAYC, cada uno con su compositor, y solo el código distingue el de
     Zenobio Dágha del de Quintana Alfaro. */
  iswc text,

  /* ── DOMINIO PÚBLICO: CUATRO ESTADOS, NO UN SÍ/NO ──
     `presunto_sin_verificar` existe porque es el estado real de casi todo el
     repertorio tradicional: alguien dice «eso es de siempre» y nadie lo ha
     comprobado. Con un booleano, esa obra se marcaría `true` y quedaría dada
     por libre para siempre. */
  estado_dominio_publico text not null default 'desconocido'
    check (estado_dominio_publico in ('no','si_verificado',
                                      'presunto_sin_verificar','desconocido')),

  /* Obligatorio de hecho cuando el estado es `si_verificado`: QUÉ se verificó y
     DÓNDE. Lo comprueba la acción, con palabras, y no un check que devolvería
     un error sobre una constraint que quien escribe no ha visto nunca.
     «Buscado en APDAYC el 31/08/2026: figura como DP, ISWC T3008148123» es una
     respuesta; «es tradicional» no lo es. */
  fundamento_dominio_publico text,

  /* ⚠ TRADICIONAL NO ES DOMINIO PÚBLICO, y esta es la columna que lo dice.
     «Valicha» la canta todo el Cusco como si fuera de nadie y tiene DOS
     registros en APDAYC, uno marcado DP y otro a nombre de una persona. Muchos
     huaynos «de siempre» están inscritos por quien los grabó primero.
     Por eso es un campo aparte del estado: marca la SOSPECHA de que sea libre,
     que es lo contrario de la prueba. Regla R3. */
  es_tradicional_o_anonima boolean not null default false,

  /* Si figura en el repertorio de una sociedad de gestión colectiva (APDAYC en
     Perú). Que figure es en sí una respuesta: significa que hay a quién pedir. */
  sociedad_gestion text,

  /* ── LA FECHA DE CONSULTA: EL CAMPO QUE SOSTIENE TODO ESTO ──
     Un catálogo cambia. Lo que protege a la productora no es haber acertado, es
     haber mirado y saber cuándo. `consultado_nota` guarda lo que decía la ficha
     ese día, que después ya no se puede reconstruir. */
  consultado_en   date,
  consultado_nota text,

  /* Otros títulos con los que aparece la misma obra, para no crearla dos veces
     al cargar otro proyecto. */
  alias text[] not null default '{}',
  nota  text,

  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

/* Sin único por título: hay quince «Fatal Destino» y son quince obras. El único
   candidato razonable sería el ISWC, pero la mayoría de las filas nacerán sin
   él —es justo lo que falta averiguar— y un único parcial no sirve para
   `on conflict` (error 42P10). Se deduplica ofreciendo coincidencias al crear. */
create index if not exists idx_obra_titulo on obra(lower(titulo));
create index if not exists idx_obra_iswc on obra(iswc) where iswc is not null;

alter table obra drop constraint if exists obra_tipo;
alter table obra add constraint obra_tipo
  check (tipo in ('musical','coreografica','fotografica','audiovisual',
                  'literaria','artes_plasticas','otra'));
alter table obra drop constraint if exists obra_dp;
alter table obra add constraint obra_dp
  check (estado_dominio_publico in ('no','si_verificado','presunto_sin_verificar','desconocido'));

comment on table obra is
  'La composición: quién la escribió y si está libre. Catálogo GLOBAL — es '
  'investigación factual, se hace una vez y no caduca. Distinta de la '
  'grabación que la contiene: una obra en dominio público puede tener un '
  'fonograma de 2019 plenamente protegido.';

-- ------------------------------------------------------------
-- 3 · LA GRABACIÓN — el fonograma, también global
-- ------------------------------------------------------------
create table if not exists grabacion (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,

  /* La obra que contiene. Nullable: de una grabación de ambiente captada en la
     plaza puede no saberse qué suena, y eso también hay que poder guardarlo. */
  obra_id uuid references obra(id) on delete set null,

  /* A quién se le pide la licencia de fonograma. No es el compositor ni el
     intérprete: es quien produjo el registro. */
  productor_fonografico text,
  interpretes text,

  origen text not null default 'desconocido'
    check (origen in ('comercial','libreria','registro_propio','aportada_por_tercero',
                      'internet','generada_con_ia','desconocido')),

  /* ── LO DE LA IA VA AQUÍ ──
     ⚠ `generada_con_ia` no está en la especificación original y lo añado a
     propósito: Suno produce un FONOGRAMA, y describir cómo se obtuvo ese
     archivo es describir la grabación, no la composición. Sin este valor, la
     música de Suno caía en `registro_propio`, que dice algo falso —no lo
     grabamos nosotros— o en `desconocido`, que borra el único dato que decide
     si se puede usar.

     `plan_ia` es ese dato. Los términos de Suno son explícitos: free y basic
     limitan el uso a fines «personal and non-commercial», y un documental que
     va a festivales es uso comercial aunque no se venda por entradas.
     `otro` significa «no lo sé», no «da igual». */
  herramienta text,
  plan_ia text check (plan_ia is null or plan_ia in ('free','basic','pro','premier','otro')),
  prompt text,
  /* Qué trabajo humano hay encima. Indecopi (Res. 1111-2025/DDA) lo dice: usar
     IA como herramienta no elimina la autoría humana, pero solo si hubo
     decisiones creativas propias. Esa frase es la diferencia entre «lo generó
     una máquina» y «lo compuse yo con una máquina». */
  aporte_humano text,

  /* Si un sistema de identificación automática la reconoció. Es el único
     elemento del proyecto que puede bloquear un vídeo sin que ninguna persona
     presente un reclamo, así que merece su propia columna. */
  reconocida_por_sistemas_automaticos boolean,

  nota text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_grabacion_obra on grabacion(obra_id) where obra_id is not null;

alter table grabacion drop constraint if exists grabacion_origen;
alter table grabacion add constraint grabacion_origen
  check (origen in ('comercial','libreria','registro_propio','aportada_por_tercero',
                    'internet','generada_con_ia','desconocido'));
alter table grabacion drop constraint if exists grabacion_plan;
alter table grabacion add constraint grabacion_plan
  check (plan_ia is null or plan_ia in ('free','basic','pro','premier','otro'));

comment on table grabacion is
  'El fonograma: qué registro concreto se usa. Catálogo GLOBAL. ⚠ NO hereda el '
  'dominio público de su obra — una canción libre grabada en 2019 tiene un '
  'productor fonográfico con derechos propios (regla R4).';

-- ------------------------------------------------------------
-- 4 · `proyecto_obra` PASA A SER EL PUENTE
--     Las columnas del catálogo se van; se queda lo que es de ESTE corte.
-- ------------------------------------------------------------
alter table proyecto_obra add column if not exists obra_id uuid references obra(id) on delete set null;
alter table proyecto_obra add column if not exists grabacion_id uuid references grabacion(id) on delete set null;

/* Cómo suena en la película. Es lo que el `origen` viejo mezclaba con el estado
   de derechos, y separado sirve para lo que de verdad hace falta: filtrar de un
   vistazo las grabaciones comerciales audibles, que son las únicas que pueden
   bloquear un vídeo solas. */
alter table proyecto_obra add column if not exists modo_aparicion text;
alter table proyecto_obra drop constraint if exists proyecto_obra_modo;
alter table proyecto_obra add constraint proyecto_obra_modo
  check (modo_aparicion is null or modo_aparicion in (
    'ejecucion_en_vivo_registrada','ambiental_de_local_o_altavoz',
    'reproducida_por_organizador','radio_o_television_en_escena',
    'musica_original_encargada','libreria_licenciada','generada_con_ia'));

-- ------------------------------------------------------------
-- 5 · BACKFILL — cada obra de ayer se parte en las piezas que le tocan.
--     `and po.obra_id is null` lo hace repetible sin duplicar nada.
-- ------------------------------------------------------------

/* ── ⚠ POR QUÉ HACE FALTA UNA COLUMNA TEMPORAL ──
   El primer borrador de este backfill emparejaba la obra recién creada con su
   fila del puente POR EL TÍTULO. Y el título es exactamente lo que no
   identifica: hay quince «Fatal Destino» en el catálogo de APDAYC y nada impide
   que una película use dos. Con ese emparejado, las dos filas del puente habrían
   apuntado a la misma obra —o a una cualquiera— y Postgres no habría dicho nada.
   Corrupción silenciosa, que es la peor clase.
   Así que la obra nace sabiendo de qué fila salió, se ata por ese id, y la
   columna se va. `if not exists` / `if exists` la hacen repetible. */
alter table obra add column if not exists _origen_po uuid;
alter table grabacion add column if not exists _origen_po uuid;

/* 5a · Una `obra` por cada fila, con el estado de dominio público deducido del
        origen viejo. El mapeo es conservador a propósito: `dominio_publico`
        solo pasa a `si_verificado` si de verdad se consultó el catálogo Y se
        apuntó qué decía. Sin las dos cosas cae en `presunto_sin_verificar`,
        que es lo que era: una suposición. */
insert into obra (titulo, tipo, autor_conocido, autor_nombre_libre, iswc,
                  estado_dominio_publico, fundamento_dominio_publico,
                  es_tradicional_o_anonima, consultado_en, consultado_nota, nota,
                  creado_por, _origen_po)
select
  po.titulo,
  'musical',
  coalesce(nullif(btrim(po.autor), ''), '') <> '',
  nullif(btrim(po.autor), ''),
  nullif(btrim(po.iswc), ''),
  case
    when po.origen = 'dominio_publico' and po.consultado_en is not null
         and coalesce(btrim(po.consultado_nota), '') <> '' then 'si_verificado'
    when po.origen = 'dominio_publico' then 'presunto_sin_verificar'
    when po.origen = 'ia_generada' then 'no'
    else 'desconocido'
  end,
  case when po.origen = 'dominio_publico' then nullif(btrim(po.consultado_nota), '') end,
  /* ⚠ Tradicional SOLO si además no se sabe de quién es. `origen =
     'dominio_publico'` a secas marcaba como «tradicional o anónima» hasta una
     obra de autor conocido y verificado, que es una afirmación factual que el
     dato viejo no contenía. Inventar un hecho al migrar es peor que perderlo. */
  po.origen = 'dominio_publico' and coalesce(btrim(po.autor), '') = '',
  po.consultado_en,
  nullif(btrim(po.consultado_nota), ''),
  nullif(btrim(po.nota), ''),
  po.creado_por,
  po.id
  from proyecto_obra po
 /* ⚠ LAS DOS GUARDAS, NO UNA. Son dos sentencias sin transacción: si el script
    se corta ENTRE ellas —timeout, pgBouncer, el editor— quedan obras con
    `_origen_po` puesto y el puente todavía en null. Al reanudar, con solo
    `po.obra_id is null` se insertaba una SEGUNDA obra por cada fila, y después
    el update encontraba dos candidatas y Postgres elegía una arbitrariamente,
    sin error. El catálogo global quedaba duplicado y el puente apuntando a
    cualquiera de las dos. El comentario decía que era reanudable; no lo era. */
 where po.obra_id is null
   and not exists (select 1 from obra o where o._origen_po = po.id);

update proyecto_obra po
   set obra_id = o.id
  from obra o
 where po.obra_id is null
   and o._origen_po = po.id;

/* 5b · Una `grabacion` SOLO donde el origen viejo implicaba una. En
        `dominio_publico`, `preexistente_cedida` y `original_encargada` lo que
        hay es una ejecución que grabamos nosotros, y crear un fonograma de
        tercero ahí sería inventar un titular que no existe. */
insert into grabacion (descripcion, obra_id, origen, herramienta, plan_ia, prompt,
                       aporte_humano, nota, creado_por, _origen_po)
select
  po.titulo,
  po.obra_id,
  case po.origen
    when 'ia_generada' then 'generada_con_ia'
    /* ⚠ `libreria` y NO `comercial`. Un tema de Artlist es exactamente el caso
       donde la licencia SÍ existe y está pagada, y con `comercial` la regla de
       riesgo lo marcaba como «grabación comercial sin licencia del productor
       fonográfico» y bloqueaba la publicación. Un crítico falso enseña a
       ignorar los críticos. */
    when 'biblioteca'  then 'libreria'
    when 'licenciada'  then 'comercial'
    when 'ambiente'    then 'desconocido'
  end,
  nullif(btrim(po.herramienta), ''),
  po.plan_ia,
  nullif(btrim(po.prompt), ''),
  nullif(btrim(po.aporte_humano), ''),
  nullif(btrim(po.resuelto_como), ''),
  po.creado_por,
  po.id
  from proyecto_obra po
 /* La misma guarda que en 5a, y por la misma razón. */
 where po.grabacion_id is null
   and po.origen in ('ia_generada','biblioteca','licenciada','ambiente')
   and not exists (select 1 from grabacion g where g._origen_po = po.id);

update proyecto_obra po
   set grabacion_id = g.id
  from grabacion g
 where po.grabacion_id is null
   and g._origen_po = po.id;

/* Fuera la columna de servicio: ya cumplió. Si el script se cortó a medias, el
   `if not exists` de arriba la vuelve a poner y el backfill sigue donde iba. */
alter table obra drop column if exists _origen_po;
alter table grabacion drop column if exists _origen_po;

/* 5c · El modo de aparición, que es lo único del `origen` viejo que describía
        de verdad cómo suena en la película. */
update proyecto_obra
   set modo_aparicion = case origen
     when 'preexistente_cedida'  then 'ejecucion_en_vivo_registrada'
     when 'ambiente'             then 'ambiental_de_local_o_altavoz'
     when 'ia_generada'          then 'generada_con_ia'
     when 'biblioteca'           then 'libreria_licenciada'
     when 'original_encargada'   then 'musica_original_encargada'
     /* `dominio_publico` y `licenciada` no dicen cómo suena —dicen de quién es—
        así que se quedan sin modo y hay que preguntarlo. Es honesto: el dato
        no estaba. */
     else null end
 where modo_aparicion is null;

/* ── LAS COLUMNAS VIEJAS SE QUEDAN, PERO YA NO MANDAN ──
   ⚠ NO se borran. Mientras el código viejo siga desplegado, sigue leyéndolas:
   quitarlas ahora rompe la pantalla de música hasta el siguiente despliegue.
   Y son el rastro del que salió este backfill, que es lo que permite volver a
   correrlo si algo salió torcido. Se borran en una migración posterior, cuando
   el código nuevo lleve semanas arriba.
   Es la coreografía de db/crono-casos.sql, y está contada ahí. */
comment on column proyecto_obra.origen is
  'OBSOLETA desde db/clearance-obra.sql. Mezclaba tres preguntas: cómo suena '
  '(ahora modo_aparicion), de quién es la composición (ahora obra.*) y qué '
  'grabación se usa (ahora grabacion.*). Se conserva como rastro del backfill.';
comment on column proyecto_obra.autor is 'OBSOLETA: ahora obra.autor_nombre_libre.';
comment on column proyecto_obra.iswc is 'OBSOLETA: ahora obra.iswc.';
comment on column proyecto_obra.consultado_en is 'OBSOLETA: ahora obra.consultado_en.';
comment on column proyecto_obra.herramienta is 'OBSOLETA: ahora grabacion.herramienta.';
comment on column proyecto_obra.plan_ia is 'OBSOLETA: ahora grabacion.plan_ia.';

create index if not exists idx_po_obra on proyecto_obra(obra_id) where obra_id is not null;

-- ── RLS ──
alter table obra enable row level security;
drop policy if exists obr_sel on obra;
drop policy if exists obr_ins on obra;
drop policy if exists obr_upd on obra;
drop policy if exists obr_del on obra;
create policy obr_sel on obra for select to authenticated using (true);
create policy obr_ins on obra for insert to authenticated with check (true);
create policy obr_upd on obra for update to authenticated using (true) with check (true);
create policy obr_del on obra for delete to authenticated using (true);

alter table grabacion enable row level security;
drop policy if exists gra_sel on grabacion;
drop policy if exists gra_ins on grabacion;
drop policy if exists gra_upd on grabacion;
drop policy if exists gra_del on grabacion;
create policy gra_sel on grabacion for select to authenticated using (true);
create policy gra_ins on grabacion for insert to authenticated with check (true);
create policy gra_upd on grabacion for update to authenticated using (true) with check (true);
create policy gra_del on grabacion for delete to authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                  and schemaname='public' and tablename='obra') then
    execute 'alter publication supabase_realtime add table public.obra';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                  and schemaname='public' and tablename='grabacion') then
    execute 'alter publication supabase_realtime add table public.grabacion';
  end if;
end $$;

-- ------------------------------------------------------------
-- VERIFICAR — `huerfanas` tiene que ser 0: toda fila del puente tiene su obra.
-- ------------------------------------------------------------
select
  (select count(*) from obra)                                       as obras,
  (select count(*) from grabacion)                                  as grabaciones,
  /* LA comprobación que vale: si esto no es 0, hay música registrada que el
     modelo nuevo no puede ver. */
  (select count(*) from proyecto_obra where obra_id is null)        as huerfanas_debe_ser_0,
  /* Su gemela, que faltaba: toda fila cuyo origen implicaba un fonograma tiene
     que tenerlo. */
  (select count(*) from proyecto_obra
    where grabacion_id is null
      and origen in ('ia_generada','biblioteca','licenciada','ambiente'))
                                                                    as sin_grabacion_debe_ser_0,
  /* ⚠ CONTRA SU LÍNEA BASE, no en el aire. La versión anterior contaba las
     grabaciones de IA con plan sin nada con que compararlas, así que «si esto
     baja» era incomprobable. Las dos cifras tienen que coincidir. */
  (select count(*) from proyecto_obra where origen='ia_generada' and plan_ia is not null)
                                                                    as ia_con_plan_antes,
  (select count(*) from grabacion where origen='generada_con_ia' and plan_ia is not null)
                                                                    as ia_con_plan_despues,
  (select count(*) from proyecto_obra where modo_aparicion is not null) as con_modo,
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('obra','grabacion'))                         as politicas_debe_ser_8,
  /* Que los vocabularios estén PUESTOS, no solo escritos. */
  (select count(*) from pg_constraint
    where conrelid in ('public.obra'::regclass,'public.grabacion'::regclass)
      and conname in ('obra_tipo','obra_dp','grabacion_origen','grabacion_plan'))
                                                                    as checks_debe_ser_4,
  /* ⚠ Y la columna de servicio TIENE que haberse ido. Si sale 1, el script se
     cortó a medias: vuelve a correrlo entero antes de seguir. */
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name in ('obra','grabacion')
      and column_name='_origen_po')                                 as temporal_debe_ser_0;

-- ------------------------------------------------------------
-- LA LISTA DE TRABAJO — obras que probablemente son la misma.
--   El catálogo nace con una obra por cada fila del puente, así que la misma
--   canción usada en tres documentales entra tres veces. Es inevitable al
--   migrar; lo que no puede faltar es la lista para fusionarlas a mano.
-- ------------------------------------------------------------
select lower(titulo) as titulo, count(*) as veces,
       string_agg(coalesce(iswc, '(sin ISWC)'), ' · ') as codigos
  from obra
 group by lower(titulo)
having count(*) > 1
 order by count(*) desc;
