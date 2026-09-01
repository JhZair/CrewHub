-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-lugares.sql — LOCACIÓN, ACTIVIDAD Y MATERIAL APORTADO
--
--  ⚠ CUARTO DE LA SERIE. Correr DESPUÉS de clearance-autorizacion.sql.
--
-- Son las tres cosas que la autorización podía nombrar en su enum de tipos y no
-- podía APUNTAR: `locacion`, `actividad_organizada` y `material_aportado`
-- existían como valores de `tipo` pero no había ninguna columna de objeto a la
-- que colgarlos. La pantalla lo tapaba pidiendo «elige al responsable como
-- objeto y explica el resto en la nota», que es exactamente el dato-en-texto
-- que este modelo entero existe para no tener.
--
-- ── QUÉ ES GLOBAL Y QUÉ ES DEL PROYECTO ──
--   `locacion`         GLOBAL. Quién administra el templo de San Esteban es un
--                      hecho del mundo: no cambia porque cambie el documental,
--                      y averiguarlo cuesta una tarde de preguntar en el pueblo.
--   `actividad`        DEL PROYECTO. La procesión de 2026 es un momento
--                      concreto del rodaje, con sus fechas. La de 2027 es otra.
--   `material_aportado` DEL PROYECTO. La foto que la familia prestó se prestó
--                      para esta película, y hay que devolverla.
--
-- ── TENER EL MATERIAL NO ES TENER SUS DERECHOS ──
-- Es la razón de que `material_aportado` separe a quien lo ENTREGA de quien lo
-- CREÓ. La señora que presta el álbum de su padre no es la autora de las fotos,
-- y con un solo campo «de quién es» se acaba pidiéndole permiso a quien no
-- puede darlo. Además, las personas retratadas en esa foto tienen su propio
-- derecho de imagen, que no lo cede ni quien la prestó ni quien la hizo.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · LA LOCACIÓN — catálogo global
-- ------------------------------------------------------------
create table if not exists locacion (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,

  /* El tipo decide A QUIÉN se le pide, que es la única pregunta práctica:
     `espacio_publico`            plaza, calle. Suele bastar el permiso municipal
     `espacio_privado`            casa, chacra. Su propietario
     `privado_abierto_al_publico` un mercado, un restaurante. Su administrador
     `institucion_publica`        municipalidad, comisaría. Trámite escrito
     `templo_religioso`           la parroquia o la hermandad, y no el municipio
     `patrimonio_cultural`        ⚠ además puede necesitar autorización del
                                  Ministerio de Cultura, que es otro trámite y
                                  otro plazo. */
  tipo text not null default 'espacio_publico'
    check (tipo in ('espacio_publico','espacio_privado','privado_abierto_al_publico',
                    'institucion_publica','templo_religioso','patrimonio_cultural')),

  /* Quién manda ahí. Persona o entidad, porque las dos existen: el dueño de la
     chacra es una persona; la parroquia, no. */
  responsable_id uuid references personas(id) on delete set null,
  entidad_responsable text,

  /* ⚠ `por_verificar` es el estado real de casi todo: nadie mira el registro
     del Ministerio antes de rodar. Con un booleano, esa locación quedaría
     marcada `false` y dada por libre para siempre. */
  es_patrimonio_declarado text not null default 'por_verificar'
    check (es_patrimonio_declarado in ('si','no','por_verificar')),

  direccion text,
  alias text[] not null default '{}',
  nota  text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_locacion_nombre on locacion(lower(nombre));
alter table locacion drop constraint if exists locacion_tipo;
alter table locacion add constraint locacion_tipo
  check (tipo in ('espacio_publico','espacio_privado','privado_abierto_al_publico',
                  'institucion_publica','templo_religioso','patrimonio_cultural'));
alter table locacion drop constraint if exists locacion_patrimonio;
alter table locacion add constraint locacion_patrimonio
  check (es_patrimonio_declarado in ('si','no','por_verificar'));

comment on table locacion is
  'Dónde se rueda. Catálogo GLOBAL: quién administra un templo no cambia con el '
  'documental. El permiso de filmación sí es por proyecto y vive en autorizacion.';

-- ------------------------------------------------------------
-- 2 · LA ACTIVIDAD — del proyecto
--     La procesión, la misa, la corrida, el concurso de danzas. Existe porque
--     alguien la organiza, y ese alguien firma por ella.
-- ------------------------------------------------------------
create table if not exists actividad_rodaje (
  id uuid primary key default gen_random_uuid(),
  /* ⚠ Del proyecto y NOT NULL: la procesión de 2026 no es la de 2027. */
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  nombre text not null,

  fecha_inicio date,
  fecha_fin date,
  locacion_id uuid references locacion(id) on delete set null,

  /* Quién la organiza, que es a quien se le pide. Persona o entidad: el
     mayordomo de un cargo es una persona; la parroquia y el municipio, no. */
  organizador_persona_id uuid references personas(id) on delete set null,
  organizador_entidad text,
  es_institucional boolean not null default false,

  /* ⚠ Marca el material que puede tener restricciones de plataforma o de
     festival: una corrida de toros, un rito con animales, una escena que puede
     afectar al honor o a la seguridad de alguien. Se decide una vez y se ve
     siempre, en vez de descubrirlo cuando la plataforma lo rechaza. */
  contenido_sensible boolean not null default false,
  nota text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_actividad_proy on actividad_rodaje(proyecto_id);

/* ⚠ AQUÍ IBA `actividad_agrupacion` (qué bandas tocan en cada actividad) Y SE
   QUITÓ: se creaba con sus políticas y su realtime y no la leía ni la escribía
   una sola línea de código. Una tabla vacía que nadie llena no es una función a
   medias, es una promesa: quien la vea creerá que el dato está en algún sitio.
   Vuelve el día que haya pantalla — y entonces cuesta cinco líneas, porque la
   relación es obvia. Hoy, qué banda toca en el cargo se sabe por sus
   autorizaciones de interpretación, que sí existen. */

comment on table actividad_rodaje is
  'Un momento organizado del rodaje: la procesión, la misa, la corrida. Del '
  'PROYECTO. ⚠ El permiso de quien la organiza cubre la actividad, NO a cada '
  'persona que participa en ella: eso son autorizaciones aparte.';

-- ------------------------------------------------------------
-- 3 · EL MATERIAL APORTADO — del proyecto
-- ------------------------------------------------------------
create table if not exists material_aportado (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  descripcion text not null,

  tipo text not null default 'fotografia'
    check (tipo in ('fotografia','video','documento','audio','otro')),

  /* ── QUIÉN LO PRESTA Y QUIÉN LO HIZO SON DOS COSAS ──
     ⚠ Tener el material no es tener sus derechos. La señora que presta el álbum
     de su padre no es la autora de las fotos, y con un solo campo se acaba
     pidiéndole permiso a quien no puede darlo. */
  entregado_por_persona_id uuid references personas(id) on delete set null,
  autor_conocido boolean not null default false,
  autor_nombre text,
  anio_aproximado int,

  origen text not null default 'desconocido'
    check (origen in ('archivo_familiar','internet','institucional','prensa','desconocido')),

  /* Si se devolvió. Un álbum familiar prestado hay que devolverlo, y no hacerlo
     rompe una relación que cuesta años construir en una comunidad. */
  devuelto boolean not null default false,
  nota text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_material_proy on material_aportado(proyecto_id);

/* ⚠ Y AQUÍ IBA `material_persona` (quién sale retratado), por lo mismo. La idea
   es correcta y es importante —ni quien presta la foto ni quien la hizo pueden
   ceder la imagen de quienes salen en ella— pero sin pantalla que la llene, la
   tabla vacía diría que nadie sale en ninguna foto. Cuando se levante, cada
   persona retratada tendrá que generar su propia `autorizacion` de
   imagen_voz_testimonio, que es lo que de verdad falta.

alter table material_aportado drop constraint if exists material_aportado_tipo;
alter table material_aportado add constraint material_aportado_tipo
  check (tipo in ('fotografia','video','documento','audio','otro'));
alter table material_aportado drop constraint if exists material_aportado_origen;
alter table material_aportado add constraint material_aportado_origen
  check (origen in ('archivo_familiar','internet','institucional','prensa','desconocido'));

comment on table material_aportado is
  'Foto, vídeo o documento que un tercero entrega. ⚠ Separa a quien lo ENTREGA '
  'de quien lo CREÓ: tener el material no es tener sus derechos. Y quien sale '
  'retratado tiene además su propio derecho de imagen.';

-- ------------------------------------------------------------
-- 4 · RLS Y REALTIME — ANTES QUE LOS CHECKS, Y NO DESPUÉS
--
--     ⚠ ESTE BLOQUE ESTABA AL FINAL Y ERA UN AGUJERO DE VERDAD.
--     Más abajo se añaden checks que VALIDAN LAS FILAS EXISTENTES, y hay filas
--     que no los cumplen (ver §5). Con el orden anterior, el `add constraint`
--     fallaba, el script moría ahí —no hay transacción, es la lección de
--     pgBouncer— y las cinco tablas quedaban creadas y expuestas por PostgREST
--     SIN row level security. Y el `select` de verificación tampoco llegaba a
--     correr, así que nadie se enteraba.
--     Lo que protege va primero. Siempre.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['locacion','actividad_rodaje','material_aportado'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_sel', t);
    execute format('drop policy if exists %I on %I', t || '_ins', t);
    execute format('drop policy if exists %I on %I', t || '_upd', t);
    execute format('drop policy if exists %I on %I', t || '_del', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_ins', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_upd', t);
    execute format('create policy %I on %I for delete to authenticated using (true)', t || '_del', t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                    and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5 · LOS TRES OBJETOS NUEVOS EN `autorizacion`
-- ------------------------------------------------------------
alter table autorizacion add column if not exists objeto_locacion_id uuid
  references locacion(id) on delete restrict;
alter table autorizacion add column if not exists objeto_actividad_id uuid
  references actividad_rodaje(id) on delete restrict;
alter table autorizacion add column if not exists objeto_material_id uuid
  references material_aportado(id) on delete restrict;

/* ── EL CHECK DE «EXACTAMENTE UN OBJETO», REHECHO PARA SIETE ──
   Añadir columnas sin tocarlo dejaría una autorización con objeto de locación Y
   de persona pasando la validación, porque el viejo solo contaba los cuatro que
   conocía.
   Este SÍ puede validar lo existente sin problema: las filas viejas tienen
   exactamente uno de los cuatro primeros y los tres nuevos en null, así que la
   suma sigue dando 1. */
alter table autorizacion drop constraint if exists autorizacion_un_objeto;
alter table autorizacion add constraint autorizacion_un_objeto check (
  (case when objeto_persona_id    is not null then 1 else 0 end
 + case when objeto_obra_id       is not null then 1 else 0 end
 + case when objeto_grabacion_id  is not null then 1 else 0 end
 + case when objeto_agrupacion_id is not null then 1 else 0 end
 + case when objeto_locacion_id   is not null then 1 else 0 end
 + case when objeto_actividad_id  is not null then 1 else 0 end
 + case when objeto_material_id   is not null then 1 else 0 end) = 1
);

/* ── ⚠ Y ESTOS TRES, `NOT VALID` A PROPÓSITO ──
   Hasta esta migración, `META_TIPO_AUT` decía que el objeto de `locacion` y
   `actividad_organizada` era «libre» —y la pantalla escribía `objeto_persona_id`,
   el responsable— y el de `material_aportado` era una obra. Esas filas existen.
   Un `add constraint` normal las VALIDA, falla con «is violated by some row», y
   sin transacción mata el script a medias.
   `not valid` significa: se aplica a todo lo que se escriba de ahora en
   adelante, y no se pelea con lo que ya está. Las filas viejas se repuntan a
   mano —la consulta que las lista está al final de este archivo— y después se
   corre `alter table autorizacion validate constraint <nombre>` para cerrar.
   Es la diferencia entre una migración que se puede correr y una que hay que
   arreglar a mano en producción. */
alter table autorizacion drop constraint if exists autorizacion_locacion_objeto;
alter table autorizacion add constraint autorizacion_locacion_objeto check (
  tipo <> 'locacion' or objeto_locacion_id is not null
) not valid;
alter table autorizacion drop constraint if exists autorizacion_actividad_objeto;
alter table autorizacion add constraint autorizacion_actividad_objeto check (
  tipo <> 'actividad_organizada' or objeto_actividad_id is not null
) not valid;
alter table autorizacion drop constraint if exists autorizacion_material_objeto;
alter table autorizacion add constraint autorizacion_material_objeto check (
  tipo <> 'material_aportado' or objeto_material_id is not null
) not valid;

create index if not exists idx_aut_obj_loc on autorizacion(objeto_locacion_id)
  where objeto_locacion_id is not null;
create index if not exists idx_aut_obj_act on autorizacion(objeto_actividad_id)
  where objeto_actividad_id is not null;
create index if not exists idx_aut_obj_mat on autorizacion(objeto_material_id)
  where objeto_material_id is not null;

-- ------------------------------------------------------------
-- VERIFICAR
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in
      ('locacion','actividad_rodaje','material_aportado'))          as tablas_debe_ser_3,
  /* Las tres columnas nuevas del objeto. */
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='autorizacion'
      and column_name in ('objeto_locacion_id','objeto_actividad_id','objeto_material_id'))
                                                                   as cols_objeto_debe_ser_3,
  /* ⚠ Y que el check de «un solo objeto» sea el NUEVO. Si se quedó el viejo,
     una autorización con locación Y persona pasa la validación y el modelo deja
     de decir sobre qué recae. Se comprueba que la definición nombre los siete. */
  (select count(*) from pg_constraint
    where conrelid='public.autorizacion'::regclass
      and conname='autorizacion_un_objeto'
      and pg_get_constraintdef(oid) ilike '%objeto_material_id%')   as check_objeto_al_dia,
  (select count(*) from pg_constraint
    where conrelid='public.autorizacion'::regclass
      and conname in ('autorizacion_locacion_objeto','autorizacion_actividad_objeto',
                      'autorizacion_material_objeto'))              as checks_tipo_debe_ser_3,
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('locacion','actividad_rodaje','material_aportado'))
                                                                   as politicas_debe_ser_12,
  (select count(*) from locacion)                                   as locaciones,
  (select count(*) from actividad_rodaje)                           as actividades,
  (select count(*) from material_aportado)                          as materiales;

-- ------------------------------------------------------------
-- LA LISTA DE TRABAJO — los permisos que apuntan al objeto viejo.
--   Son los que se registraron cuando la pantalla pedía «elige al responsable
--   como objeto». Hay que crear su locación / actividad / material y repuntarlos.
--   Cuando esta consulta devuelva CERO filas, cierra los tres checks con:
--       alter table autorizacion validate constraint autorizacion_locacion_objeto;
--       alter table autorizacion validate constraint autorizacion_actividad_objeto;
--       alter table autorizacion validate constraint autorizacion_material_objeto;
-- ------------------------------------------------------------
select a.id, a.tipo, a.proyecto_id,
       a.objeto_persona_id, a.objeto_obra_id,
       left(coalesce(a.notas, ''), 120) as la_nota_donde_se_apuntó
  from autorizacion a
 where (a.tipo = 'locacion'             and a.objeto_locacion_id  is null)
    or (a.tipo = 'actividad_organizada' and a.objeto_actividad_id is null)
    or (a.tipo = 'material_aportado'    and a.objeto_material_id  is null)
 order by a.tipo;
