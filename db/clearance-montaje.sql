-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-montaje.sql — LA BITÁCORA DE MONTAJE
--
--  ⚠ QUINTO Y ÚLTIMO DE LA SERIE. Correr DESPUÉS de clearance-lugares.sql.
--
-- Las dos tablas de aquí NO son autorizaciones. Son DECISIONES DOCUMENTADAS
-- sobre el corte, y esa diferencia es el motivo de que existan aparte:
--
--   · Una autorización dice «esta persona firmó».
--   · Una aparición incidental dice «esta persona sale y NO firmó, y esto es
--     lo que decidimos hacer al respecto».
--
-- Meter lo segundo en `autorizacion` con estado `no_aplica` lo convertiría en
-- un permiso que no existe, y perdería lo único que importa: qué se hizo.
--
-- ── EL CASO QUE LAS PIDIÓ ──
-- Al cargo del Patrón San Esteban en Yaurisque acudió mucha gente. En la
-- procesión y en la misa sale un montón de personas junto al mayordomo, y de
-- ellas no tenemos ni los nombres. No se les puede pedir un release —no se sabe
-- quiénes son— y tampoco se puede fingir que no salen. Lo que sí se puede es
-- decidir, plano por plano, qué se hace: usarlo, reencuadrar, desenfocar,
-- quitar el audio, sustituir el plano o descartarlo. Y dejarlo escrito.
--
-- ── POR QUÉ ESO BASTA (Y CUÁNDO NO) ──
-- El art. 15 del Código Civil peruano admite excepciones al consentimiento
-- cuando la imagen se capta en un lugar público y la persona no es el objeto
-- principal del plano. Por eso las dos columnas que deciden todo aquí son
-- `es_identificable` y `tiene_protagonismo`: alguien de espaldas en una
-- multitud es una cosa, y un primer plano de dos segundos es otra. Y por eso
-- `es_menor` y `contexto_sensible` son campos aparte: ahí no hay excepción que
-- valga.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · LA APARICIÓN INCIDENTAL
-- ------------------------------------------------------------
create table if not exists aparicion_incidental (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,

  /* Dónde, en las palabras del montaje: un código de plano, un timecode, «la
     salida de la procesión». Texto libre porque el montaje nombra las cosas a
     su manera y forzar un formato hace que no se apunte. */
  escena_o_plano text not null,
  actividad_id uuid references actividad_rodaje(id) on delete set null,

  /* ⚠ SIN DATO IDENTIFICATIVO INNECESARIO. «Señora de pollera roja a la
     izquierda» basta para encontrar el plano, y es lo único que hace falta.
     Apuntar más —un nombre a medias, un parentesco— es recoger un dato personal
     de alguien que no lo dio, para una finalidad que no necesita ese dato. */
  descripcion_persona text not null,

  /* ── LAS DOS COLUMNAS QUE DECIDEN TODO ──
     El art. 15 del Código Civil admite excepciones cuando la imagen se capta en
     un lugar público y la persona no es el objeto principal. Alguien de espaldas
     en una multitud y un primer plano de dos segundos no son el mismo caso, y
     con un solo campo «¿sale?» los dos se ven igual. */
  es_identificable boolean not null default true,
  tiene_protagonismo boolean not null default false,

  /* ⚠ `por_revisar` es el estado real cuando se apunta desde el visionado y no
     se sabe. Con un booleano habría que elegir entre «sí» y «no» sin saberlo, y
     «no» se elegiría siempre porque es lo cómodo. Aquí no hay excepción del
     art. 15 que valga: un menor identificable sin autorización de su
     representante legal solo se resuelve desenfocando o descartando. */
  es_menor text not null default 'por_revisar'
    check (es_menor in ('si','no','por_revisar')),

  /* Puede afectar al honor, la intimidad o la seguridad de esa persona. Un
     borracho en la fiesta, alguien en un momento de duelo, una discusión. Ahí
     el lugar público no excusa nada. */
  contexto_sensible boolean not null default false,

  /* Si se puso el cartel de «se está filmando» en el acceso. No es un
     consentimiento, pero es parte de haber actuado con diligencia y baja el
     riesgo de lo incidental. */
  aviso_filmacion_colocado boolean not null default false,

  /* ── QUÉ SE DECIDIÓ ──
     `usar` no es «no hacer nada»: es la decisión de que ese plano se queda tal
     cual, tomada a conciencia. La diferencia entre eso y no haberlo mirado es
     justamente lo que esta tabla registra. */
  decision_montaje text not null default 'pendiente'
    check (decision_montaje in ('pendiente','usar','reencuadrar','desenfocar',
                                'quitar_audio','sustituir_plano','pedir_release','descartar')),

  /* Si se acabó pidiendo la firma, dónde está. */
  autorizacion_id uuid references autorizacion(id) on delete set null,

  /* ⚠ `resuelto` NO se deduce de `decision_montaje`. Decidir «desenfocar» es
     una cosa y haberlo hecho en el corte es otra, y entre las dos pasan
     semanas. El semáforo mira ESTA columna: una decisión tomada y no aplicada
     sigue siendo una persona sin desenfocar en la película. */
  resuelto boolean not null default false,
  nota text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_incidental_proy on aparicion_incidental(proyecto_id);
/* Para la vista de «lo que falta»: las sin resolver, que es lo único que se
   mira a diario. Parcial porque las resueltas se acumulan y no se consultan. */
create index if not exists idx_incidental_pend on aparicion_incidental(proyecto_id)
  where resuelto = false;

alter table aparicion_incidental drop constraint if exists aparicion_incidental_menor;
alter table aparicion_incidental add constraint aparicion_incidental_menor
  check (es_menor in ('si','no','por_revisar'));
alter table aparicion_incidental drop constraint if exists aparicion_incidental_decision;
alter table aparicion_incidental add constraint aparicion_incidental_decision
  check (decision_montaje in ('pendiente','usar','reencuadrar','desenfocar',
                              'quitar_audio','sustituir_plano','pedir_release','descartar'));

comment on table aparicion_incidental is
  'Quien sale sin firmar, y qué se decidió hacer. NO es una autorización: es la '
  'decisión documentada. `resuelto` es aparte de `decision_montaje` porque '
  'decidir desenfocar y haberlo hecho son dos cosas distintas.';

-- ------------------------------------------------------------
-- 2 · EL RECORRIDO MUSICAL DEL CORTE
--     Qué suena en cada minuto. Es lo que permite pasar la película entera y
--     saber, sin abrir el proyecto de montaje, qué música hay dentro.
-- ------------------------------------------------------------
create table if not exists uso_musical_corte (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,

  /* Texto y no un tipo de tiempo: los timecodes vienen del montaje en el
     formato que use la sala (HH:MM:SS:FF, MM:SS, o el que sea) y convertirlos
     al apuntar hace que se apunte mal o no se apunte. Se ordena como cadena,
     que en un formato consistente ordena bien. */
  timecode_inicio text,
  timecode_fin text,
  escena text,

  obra_id      uuid references obra(id) on delete set null,
  grabacion_id uuid references grabacion(id) on delete set null,
  /* Cuando es ejecución en vivo de una banda que estaba ahí. */
  agrupacion_id uuid references agrupacion(id) on delete set null,

  /* ── CÓMO APARECE, QUE ES LO QUE DECIDE EL RIESGO ──
     ⚠ `ambiental_de_local_o_altavoz` y `reproducida_por_organizador` son, casi
     siempre, GRABACIONES COMERCIALES: la radio del comedor, el altavoz de la
     plaza. Y son el único elemento del proyecto que puede bloquear un vídeo de
     forma automática, sin que ninguna persona presente un reclamo — lo hace un
     sistema de identificación. Por eso merecen su propio filtro en la pantalla.
     `generada_con_ia` no está en la especificación original y se añade por lo
     mismo que en `grabacion.origen`: describe algo real que no cabía en los
     otros seis. */
  modo_aparicion text not null default 'ejecucion_en_vivo_registrada'
    check (modo_aparicion in ('ejecucion_en_vivo_registrada','ambiental_de_local_o_altavoz',
                              'reproducida_por_organizador','radio_o_television_en_escena',
                              'musica_original_encargada','libreria_licenciada','generada_con_ia')),

  decision_montaje text not null default 'pendiente'
    check (decision_montaje in ('pendiente','licenciar','atenuar','sustituir',
                                'cambiar_toma','mantener')),

  /* ⚠ DÓNDE ESTÁ LA LICENCIA QUE LO RESUELVE.
     Sin esta columna, elegir `licenciar` no podía apuntar a nada: la decisión
     decía «la licenciamos» y no había forma de enseñar el papel, ni siquiera si
     existía. Y entonces lo único capaz de bloquear un vídeo sin que nadie
     reclame se silenciaba con dos clics.
     `set null` y no `cascade`: si se borra la licencia, la música sigue sonando
     — y lo que hay que ver es que se quedó sin papel, no que desapareció. */
  autorizacion_id uuid references autorizacion(id) on delete set null,

  /* Igual que en las incidentales: decidir «sustituir» y haberlo hecho son dos
     cosas, y el semáforo mira esta. */
  resuelto boolean not null default false,
  nota text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_uso_musical_proy on uso_musical_corte(proyecto_id);
create index if not exists idx_uso_musical_pend on uso_musical_corte(proyecto_id)
  where resuelto = false;

alter table uso_musical_corte drop constraint if exists uso_musical_corte_modo;
alter table uso_musical_corte add constraint uso_musical_corte_modo
  check (modo_aparicion in ('ejecucion_en_vivo_registrada','ambiental_de_local_o_altavoz',
                            'reproducida_por_organizador','radio_o_television_en_escena',
                            'musica_original_encargada','libreria_licenciada','generada_con_ia'));
alter table uso_musical_corte drop constraint if exists uso_musical_corte_decision;
alter table uso_musical_corte add constraint uso_musical_corte_decision
  check (decision_montaje in ('pendiente','licenciar','atenuar','sustituir',
                              'cambiar_toma','mantener'));

comment on table uso_musical_corte is
  'Qué música suena en cada punto del corte. Permite recorrer la película y '
  'saber qué hay dentro sin abrir el montaje. ⚠ Lo ambiental y lo reproducido '
  'por el organizador son casi siempre grabaciones comerciales, y son lo único '
  'que puede bloquear un vídeo sin que nadie reclame.';

-- ── RLS y realtime ──
do $$
declare t text;
begin
  foreach t in array array['aparicion_incidental','uso_musical_corte'] loop
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
-- VERIFICAR
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema='public'
      and table_name in ('aparicion_incidental','uso_musical_corte'))  as tablas_debe_ser_2,
  (select count(*) from pg_constraint
    where conrelid in ('public.aparicion_incidental'::regclass,
                       'public.uso_musical_corte'::regclass)
      and conname in ('aparicion_incidental_menor','aparicion_incidental_decision',
                      'uso_musical_corte_modo','uso_musical_corte_decision'))
                                                                        as checks_debe_ser_4,
  (select count(*) from pg_indexes where schemaname='public'
     and indexname in ('idx_incidental_pend','idx_uso_musical_pend'))   as indices_pend_debe_ser_2,
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('aparicion_incidental','uso_musical_corte'))     as politicas_debe_ser_8,
  (select count(*) from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public'
     and tablename in ('aparicion_incidental','uso_musical_corte'))     as en_realtime_debe_ser_2,
  (select count(*) from aparicion_incidental where resuelto = false)    as incidentales_pendientes,
  (select count(*) from uso_musical_corte where resuelto = false)       as musica_pendiente;
