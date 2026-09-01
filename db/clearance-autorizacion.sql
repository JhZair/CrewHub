-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-autorizacion.sql — LA AUTORIZACIÓN, ENTIDAD CENTRAL
--
--  ⚠ TERCERO Y ÚLTIMO DE LA SERIE. Correr DESPUÉS de:
--       1. clearance-agrupacion.sql
--       2. clearance-obra.sql
--    Referencia a las dos. Requiere también db/proyecto-cesiones.sql.
--
-- ── POR QUÉ «AUTORIZACIÓN» Y NO «CESIÓN» ──
-- La tabla de ayer se llamaba `proyecto_cesion` y casi nada de lo que guardaba
-- era una cesión. En derecho peruano son tres cosas distintas:
--
--   · CESIÓN         el titular TRANSFIERE sus derechos patrimoniales. Es lo
--                    que pasa en el contrato con el compositor de la música
--                    original: la productora pasa a ser titular.
--   · LICENCIA       permiso de uso bajo condiciones, sin transferir nada. Es
--                    la enorme mayoría de los casos.
--   · CONSENTIMIENTO el permiso de una persona sobre su propia imagen y voz.
--                    Técnicamente no es ni lo uno ni lo otro: es un acto de
--                    disposición sobre un derecho de la personalidad
--                    (Código Civil, art. 15).
--
-- Llamarlo todo «cesión» hace creer a quien firma que está entregando más de lo
-- que entrega, y a quien lee el expediente que la productora tiene una
-- titularidad que no tiene.
--
-- ── LAS TRES COSAS QUE LA TABLA VIEJA NO PODÍA EXPRESAR ──
--
-- 1. QUE «MÚSICA» SON TRES DERECHOS DE TRES PERSONAS.
--    La interpretación es de quien toca, la composición de quien la escribió y
--    la grabación de quien la produjo. En la tabla vieja las tres eran
--    `tipo='musica'` sobre la misma persona, así que la cesión de Jennifer
--    parecía cubrir la canción de Zenobio Dágha. No la cubre.
--
-- 2. LA CALIDAD DEL FIRMANTE.
--    Jennifer puede firmar por sí misma o como representante de Las Patronas, y
--    no es lo mismo. `calidad_firmante` es el campo que faltaba y es la razón
--    principal de esta migración: sin él, la firma de la líder se contaba como
--    la de las once y el sistema daba por cubierto lo que no lo estaba.
--
-- 3. QUE HAY PERMISOS QUE NO CUELGAN DE UNA PERSONA.
--    Una locación cuelga de su propietario, una obra de su autor, una actividad
--    de quien la organiza. `proyecto_cesion.persona_id` era NOT NULL, así que
--    para guardarlos había que inventarse una persona.
--
-- ── EL OBJETO VA EN COLUMNAS, NO EN UN `objeto_id` SUELTO ──
-- Un `objeto_tipo` + `objeto_id` genérico no tiene integridad referencial: nada
-- impide que apunte a una fila borrada o a la tabla equivocada, y no se entera
-- nadie. Seis columnas nullable con un check de que exactamente una está
-- poblada es más verboso y no deja mentir.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · ANTES — cuántas cesiones hay que migrar, y de qué tipo.
-- ------------------------------------------------------------
select count(*)                                        as cesiones_viejas,
       count(*) filter (where tipo = 'imagen')          as de_imagen,
       count(*) filter (where tipo = 'musica')          as de_musica,
       count(*) filter (where tipo = 'otro')            as de_otro,
       count(*) filter (where estado = 'firmada')       as firmadas
  from proyecto_cesion;

-- ------------------------------------------------------------
-- 2 · EL DOCUMENTO FIRMADO, como entidad propia
--     Un mismo papel puede respaldar VARIAS autorizaciones: un release de campo
--     que cubre imagen y a la vez la interpretación se escanea una vez y se
--     apunta dos veces. Con la url metida en cada autorización, ese PDF vivía
--     duplicado y al corregir uno el otro se quedaba apuntando al viejo.
-- ------------------------------------------------------------
create table if not exists documento_firmado (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,

  modelo text not null default 'otro'
    check (modelo in ('release_individual','release_simplificado',
                      'autorizacion_agrupacion','anexo_integrantes',
                      'autorizacion_actividad_comunidad','autorizacion_locacion',
                      'entrega_material_terceros','licencia_obra',
                      'licencia_fonograma','contrato_equipo',
                      'autorizacion_representante_menor','otro')),

  archivo_url text,

  /* Para detectar que alguien sustituyó el PDF por otro. No es paranoia: el
     expediente de clearance se enseña meses después a un fondo o a una
     aseguradora, y entonces importa poder decir que es el mismo archivo. */
  hash_archivo text,

  firmado_el  date,
  lugar_firma text,

  /* En campo se firma con huella tan a menudo como con firma. Que conste. */
  tiene_huella_digital boolean not null default false,

  /* El «¿me autoriza a grabarlo?» dicho a cámara. En un documental de campo es
     a veces la única prueba que hay, y vale: es consentimiento informado y
     grabado. No sustituye al papel, pero lo respalda. */
  consentimiento_grabado_url text,
  testigos text,
  nota text,

  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

create index if not exists idx_docfirm_proy on documento_firmado(proyecto_id);
alter table documento_firmado drop constraint if exists documento_firmado_modelo;
alter table documento_firmado add constraint documento_firmado_modelo
  check (modelo in ('release_individual','release_simplificado',
                    'autorizacion_agrupacion','anexo_integrantes',
                    'autorizacion_actividad_comunidad','autorizacion_locacion',
                    'entrega_material_terceros','licencia_obra',
                    'licencia_fonograma','contrato_equipo',
                    'autorizacion_representante_menor','otro'));

-- ------------------------------------------------------------
-- 3 · LA AUTORIZACIÓN
-- ------------------------------------------------------------
create table if not exists autorizacion (
  id uuid primary key default gen_random_uuid(),

  /* ⚠ NOT NULL, Y ES LA BARRERA MÁS IMPORTANTE DE TODO EL MODELO.
     Un release firmado para un documental NO autoriza otro documental: se
     otorga para una obra concreta, nombrada en el propio papel. Si la misma
     persona sale en dos películas, firma dos veces.
     Esta columna es lo que impide que el sistema dé por cubierta a alguien en
     el proyecto B porque firmó en el A. El catálogo —personas, obras,
     agrupaciones— sí se comparte; el permiso, nunca (regla R10). */
  proyecto_id uuid not null references proyectos(id) on delete cascade,

  /* ── QUÉ SE AUTORIZA ──
     Once tipos, y los tres primeros son los que la tabla vieja no distinguía:
     interpretar, componer y grabar son tres derechos de tres personas. */
  tipo text not null
    check (tipo in ('imagen_voz_testimonio','interpretacion_musical',
                    'interpretacion_danza','obra_musical','obra_no_musical',
                    'fonograma','material_aportado','locacion',
                    'actividad_organizada','aporte_de_equipo','otro')),

  /* Cesión, licencia o consentimiento. Independiente del tipo —un compositor
     puede ceder o licenciar la misma obra— pero con un valor razonable por
     defecto según el tipo, que pone la acción. Pedirlo en blanco en cada alta
     lo convierte en un campo que se rellena a ojo. */
  naturaleza text not null default 'licencia'
    check (naturaleza in ('consentimiento','licencia','cesion')),

  -- ── QUIÉN FIRMA ──
  otorgante_tipo text not null default 'persona'
    check (otorgante_tipo in ('persona','agrupacion','entidad_externa')),
  otorgante_persona_id    uuid references personas(id) on delete restrict,
  otorgante_agrupacion_id uuid references agrupacion(id) on delete restrict,
  otorgante_entidad_nombre text,

  /* ── EN QUÉ CALIDAD — EL CAMPO QUE FALTABA ──
     `titular` firma por derecho propio. `representante_agrupacion` compromete
     al colectivo y NO a sus integrantes: cada intérprete tiene su propio
     derecho conexo y lo cede él. Confundir las dos es lo que hacía que la firma
     de Jennifer se leyera como once firmas.
     `autoridad_comunal` es complementaria y no sustitutiva: el permiso del
     presidente de la comunidad no reemplaza al de cada persona que sale. */
  calidad_firmante text not null default 'titular'
    check (calidad_firmante in ('titular','representante_agrupacion',
                                'representante_legal_menor','heredero_o_causahabiente',
                                'propietario_administrador','organizador_actividad',
                                'autoridad_comunal','representante_entidad')),

  /* ── SOBRE QUÉ ──
     Columnas por tipo y no un `objeto_id` genérico: ver la cabecera. */
  /* ⚠ `restrict` y NO `cascade`. Con cascade, borrar la ficha de un menor
     borraba la autorización que su madre firmó —con su documento y su fecha—,
     que es justo lo que no puede desaparecer nunca. `set null` tampoco vale:
     violaría el check de que hay exactamente un objeto. Así que no se deja
     borrar el objeto mientras cuelgue de él un permiso, y quien quiera hacerlo
     tiene que quitar antes el permiso a conciencia. */
  objeto_persona_id    uuid references personas(id) on delete restrict,
  objeto_obra_id       uuid references obra(id) on delete restrict,
  objeto_grabacion_id  uuid references grabacion(id) on delete restrict,
  objeto_agrupacion_id uuid references agrupacion(id) on delete restrict,

  -- ── ALCANCE: ¿PARA QUÉ SIRVE ESTE PERMISO? ──
  /* Multiselección. Un permiso sin medios es un permiso que no se sabe si vale
     para el festival al que ya se inscribió la película. */
  medios text[] not null default '{}',
  territorio text not null default 'mundial'
    check (territorio in ('mundial','nacional','regional','especifico')),
  territorio_detalle text,
  tipo_plazo text not null default 'indefinido'
    check (tipo_plazo in ('indefinido','anios','hasta_fecha')),
  plazo_anios int,
  plazo_hasta date,
  exclusividad text not null default 'no_exclusiva'
    check (exclusividad in ('no_exclusiva','exclusiva')),
  onerosidad text not null default 'gratuita'
    check (onerosidad in ('gratuita','onerosa')),
  /* ⚠ Acceso restringido: no va en exportaciones compartibles ni en listados. */
  monto_acordado numeric(12,2),
  moneda text,
  permite_fragmentos boolean not null default true,

  /* ── EL CAMPO MÁS EXPUESTO DE LA TABLA ──
     El tráiler, el afiche y la miniatura son lo que ve más gente y lo que se
     publica antes, a menudo años antes del estreno. Un permiso que autoriza
     salir en la película y no en su promoción es frecuente y perfectamente
     legítimo, y si no se puede registrar acaba incumpliéndose sin querer.
     El sistema tiene que poder listar «quiénes no pueden ir en promoción». */
  permite_uso_promocional boolean not null default true,
  permite_materiales_derivados boolean not null default true,

  /* ── LA EXPLOTACIÓN COMERCIAL FUTURA ──
     Aunque hoy el canal no monetice. Un permiso redactado solo para «YouTube
     sin publicidad» obliga a rehacer TODAS las firmas el día que el canal se
     monetice o la película se venda — y para entonces la gente ya no está
     localizable, que es el problema entero. */
  incluye_explotacion_comercial_futura boolean not null default false,

  /* Lo que el otorgante excluyó expresamente. Va en texto porque una
     restricción real —«que no salga mi casa», «nada de la misa»— no cabe en
     ningún enum, y tenerla escrita vale más que clasificarla. */
  restricciones text,

  -- ── DÓNDE VA ──
  estado text not null default 'no_iniciada'
    check (estado in ('no_iniciada','en_gestion','solicitada','firmada',
                      'rechazada','no_ubicable','no_aplica')),

  /* ⚠ SOLO EL MANUAL. El riesgo calculado NO se guarda: se calcula al leer,
     con una función pura sobre la fila. Guardado, se queda rancio en cuanto
     cambie cualquier cosa que lo alimenta —una obra que pasa a verificada, un
     menor que cumple 18— y entonces el semáforo de publicación miente con toda
     la autoridad de un dato escrito.
     Esta columna es la excepción razonada: cuando el equipo decide que ese caso
     concreto es más o menos grave de lo que la regla supone. `null` significa
     «usa el calculado», que es lo normal. */
  riesgo_manual text
    check (riesgo_manual is null or riesgo_manual in ('bajo','medio','alto','critico')),

  prioridad text not null default 'media'
    check (prioridad in ('urgente','alta','media','baja')),
  responsable_interno_id uuid references personas(id) on delete set null,
  fecha_limite date,

  documento_id uuid references documento_firmado(id) on delete set null,
  firmado_el date,
  notas text,

  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);

/* ── EXACTAMENTE UN OTORGANTE, COHERENTE CON SU TIPO ──
   Sin esto, una autorización podía tener a la vez una persona y una agrupación
   como firmante, o ninguna, y el expediente diría que alguien firmó sin decir
   quién. */
alter table autorizacion drop constraint if exists autorizacion_un_otorgante;
alter table autorizacion add constraint autorizacion_un_otorgante check (
  (otorgante_tipo = 'persona'
     and otorgante_persona_id is not null
     and otorgante_agrupacion_id is null and otorgante_entidad_nombre is null)
  or (otorgante_tipo = 'agrupacion'
     and otorgante_agrupacion_id is not null
     and otorgante_persona_id is null and otorgante_entidad_nombre is null)
  or (otorgante_tipo = 'entidad_externa'
     and coalesce(btrim(otorgante_entidad_nombre), '') <> ''
     and otorgante_persona_id is null and otorgante_agrupacion_id is null)
);

/* ── Y EXACTAMENTE UN OBJETO ──
   Una autorización sin objeto no dice sobre qué se firmó; con dos, no se sabe
   cuál cuenta. */
/* ⚠ SOLO SI clearance-lugares.sql NO SE HA CORRIDO TODAVÍA.
   Aquel archivo amplía este mismo check a SIETE objetos. Re-correr esta tanda
   después de aquella lo devolvía a cuatro —y una autorización con locación Y
   persona volvía a pasar la validación—; o peor, si ya había filas con los
   objetos nuevos, el `add` fallaba con el `drop` ya hecho y la tabla se quedaba
   SIN NINGÚN check de «un solo objeto», en silencio y sin transacción.
   Los cinco archivos se anuncian re-ejecutables, y este era el único que no lo
   era de verdad. */
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='autorizacion'
                    and column_name='objeto_material_id') then
    execute 'alter table autorizacion drop constraint if exists autorizacion_un_objeto';
    execute $c$alter table autorizacion add constraint autorizacion_un_objeto check (
      (case when objeto_persona_id    is not null then 1 else 0 end
     + case when objeto_obra_id       is not null then 1 else 0 end
     + case when objeto_grabacion_id  is not null then 1 else 0 end
     + case when objeto_agrupacion_id is not null then 1 else 0 end) = 1)$c$;
  end if;
end $$;

/* ── R2 EN LA BASE: LA OBRA NO CUELGA DEL INTÉRPRETE ──
   Quien toca una canción no tiene derechos sobre la composición. Una
   autorización de `obra_musical` cuyo objeto sea una persona sería exactamente
   el error que este modelo existe para impedir, así que Postgres lo rechaza.
   La acción lo explica antes con palabras; esto es la red de abajo. */
alter table autorizacion drop constraint if exists autorizacion_obra_no_persona;
alter table autorizacion add constraint autorizacion_obra_no_persona check (
  tipo not in ('obra_musical','obra_no_musical') or objeto_obra_id is not null
);
/* ── R1 EN LA BASE: LA INTERPRETACIÓN CUELGA DE LA AGRUPACIÓN ──
   `META_TIPO_AUT` declara que el objeto de una interpretación es la agrupación,
   y hasta ahora nada lo imponía: las dos formas eran legales y el recuento
   «n de m» solo veía una. Una discrepancia así no da error, da un número — y el
   número decía «0 de 11» sobre una banda cuyas integrantes sí habían firmado.
   ⚠ Se admite también el objeto persona, para el solista que no está en ninguna
   agrupación. Lo que no se admite es ninguna de las otras dos. */
alter table autorizacion drop constraint if exists autorizacion_interpretacion_objeto;
alter table autorizacion add constraint autorizacion_interpretacion_objeto check (
  tipo not in ('interpretacion_musical','interpretacion_danza')
  or objeto_agrupacion_id is not null or objeto_persona_id is not null
);

/* Coherencia del plazo: decir «hasta una fecha» sin la fecha, o «a N años» sin
   el N, es un alcance que nadie puede comprobar. */
alter table autorizacion drop constraint if exists autorizacion_plazo_coherente;
alter table autorizacion add constraint autorizacion_plazo_coherente check (
  (tipo_plazo = 'hasta_fecha' and plazo_hasta is not null)
  or (tipo_plazo = 'anios' and plazo_anios is not null and plazo_anios > 0)
  or tipo_plazo = 'indefinido'
);

alter table autorizacion drop constraint if exists autorizacion_fonograma_objeto;
alter table autorizacion add constraint autorizacion_fonograma_objeto check (
  tipo <> 'fonograma' or objeto_grabacion_id is not null
);

/* Una firmada tiene fecha de firma. Sin esto, «firmada» sin fecha es alguien
   diciendo que hay un papel. */
alter table autorizacion drop constraint if exists autorizacion_firmada_con_fecha;
alter table autorizacion add constraint autorizacion_firmada_con_fecha check (
  estado <> 'firmada' or firmado_el is not null
);

/* `no_aplica` exige razón escrita: es el estado que dice «esto se analizó y se
   decidió que no hace falta», y sin el motivo es indistinguible de un olvido. */
alter table autorizacion drop constraint if exists autorizacion_noaplica_con_nota;
alter table autorizacion add constraint autorizacion_noaplica_con_nota check (
  estado <> 'no_aplica' or coalesce(btrim(notas), '') <> ''
);

/* ── LOS VOCABULARIOS, REPUESTOS FUERA DEL `create table` ──
   ⚠ Un `check` inline dentro de `create table if not exists` NO se aplica si la
   tabla ya existía: el `if not exists` se salta la sentencia ENTERA. Este
   archivo repone sus seis checks compuestos y se dejaba los ONCE de columna,
   incluido el de `estado`, que es el que sostiene el semáforo entero. Sobre una
   tabla creada por un borrador anterior, el archivo prometía once vocabularios
   cerrados y no ponía ninguno.
   Está contado en db/proyecto-cesiones.sql y en db/proyecto-obra.sql, y aquí se
   había olvidado justo donde más caro sale. */
do $$
declare
  d record;
begin
  for d in select * from (values
    ('autorizacion','aut_ck_tipo','tipo',
     $q$tipo in ('imagen_voz_testimonio','interpretacion_musical','interpretacion_danza','obra_musical','obra_no_musical','fonograma','material_aportado','locacion','actividad_organizada','aporte_de_equipo','otro')$q$),
    ('autorizacion','aut_ck_naturaleza','naturaleza',
     $q$naturaleza in ('consentimiento','licencia','cesion')$q$),
    ('autorizacion','aut_ck_otorgante_tipo','otorgante_tipo',
     $q$otorgante_tipo in ('persona','agrupacion','entidad_externa')$q$),
    ('autorizacion','aut_ck_calidad','calidad_firmante',
     $q$calidad_firmante in ('titular','representante_agrupacion','representante_legal_menor','heredero_o_causahabiente','propietario_administrador','organizador_actividad','autoridad_comunal','representante_entidad')$q$),
    ('autorizacion','aut_ck_territorio','territorio',
     $q$territorio in ('mundial','nacional','regional','especifico')$q$),
    ('autorizacion','aut_ck_tipo_plazo','tipo_plazo',
     $q$tipo_plazo in ('indefinido','anios','hasta_fecha')$q$),
    ('autorizacion','aut_ck_exclusividad','exclusividad',
     $q$exclusividad in ('no_exclusiva','exclusiva')$q$),
    ('autorizacion','aut_ck_onerosidad','onerosidad',
     $q$onerosidad in ('gratuita','onerosa')$q$),
    ('autorizacion','aut_ck_estado','estado',
     $q$estado in ('no_iniciada','en_gestion','solicitada','firmada','rechazada','no_ubicable','no_aplica')$q$),
    ('autorizacion','aut_ck_riesgo','riesgo_manual',
     $q$riesgo_manual is null or riesgo_manual in ('bajo','medio','alto','critico')$q$),
    ('autorizacion','aut_ck_prioridad','prioridad',
     $q$prioridad in ('urgente','alta','media','baja')$q$),
    ('gestion_contacto','ges_ck_canal','canal',
     $q$canal in ('llamada','whatsapp','correo','presencial','carta','intermediario')$q$),
    ('gestion_contacto','ges_ck_resultado','resultado',
     $q$resultado in ('sin_respuesta','respondio','acepto','rechazo','no_ubicable')$q$)
  ) as v(tabla, nombre, col, expr) loop
    execute format('alter table %I drop constraint if exists %I', d.tabla, d.nombre);
    execute format('alter table %I add constraint %I check (%s)', d.tabla, d.nombre, d.expr);
  end loop;
end $$;

create index if not exists idx_aut_proy on autorizacion(proyecto_id);
create index if not exists idx_aut_obj_persona on autorizacion(objeto_persona_id)
  where objeto_persona_id is not null;
create index if not exists idx_aut_obj_agr on autorizacion(objeto_agrupacion_id)
  where objeto_agrupacion_id is not null;
create index if not exists idx_aut_otor_persona on autorizacion(otorgante_persona_id)
  where otorgante_persona_id is not null;

comment on table autorizacion is
  'La entidad central del clearance: quién autoriza qué, en qué calidad y para '
  'qué sirve. proyecto_id es NOT NULL a propósito — un permiso no cruza de un '
  'documental a otro (R10). Sustituye a proyecto_cesion.';
comment on column autorizacion.calidad_firmante is
  'En qué calidad firma. representante_agrupacion NO cubre a los integrantes: '
  'el derecho de intérprete es personal y lo cede cada uno (R1).';

-- ------------------------------------------------------------
-- 4 · GESTIÓN DE CONTACTO — el rastro de los intentos
--     Cuando no se logra ubicar a un titular, la prueba del intento razonable
--     es parte de la defensa. Una autorización NUNCA se borra por no encontrar
--     a quien firma: se documenta lo que se intentó.
-- ------------------------------------------------------------
create table if not exists gestion_contacto (
  id uuid primary key default gen_random_uuid(),
  autorizacion_id uuid not null references autorizacion(id) on delete cascade,
  fecha date not null default current_date,
  canal text not null default 'llamada'
    check (canal in ('llamada','whatsapp','correo','presencial','carta','intermediario')),
  resultado text not null default 'sin_respuesta'
    check (resultado in ('sin_respuesta','respondio','acepto','rechazo','no_ubicable')),
  evidencia_url text,
  detalle text,
  creado_en  timestamptz not null default now(),
  creado_por uuid references perfiles(id)
);
create index if not exists idx_gestion_aut on gestion_contacto(autorizacion_id);

-- ------------------------------------------------------------
-- 5 · BACKFILL — las cesiones de ayer, sin perder ninguna
--
--     El mapeo de tipos, y por qué:
--       imagen  → imagen_voz_testimonio · consentimiento · objeto = la persona
--       musica  → interpretacion_musical · licencia       · objeto = la persona
--                 ⚠ Y NO `obra_musical`. Lo que Jennifer firmó fue que se le
--                 grabara tocando: su interpretación. La composición es de otro
--                 y necesita su propia autorización, que hoy NO existe — y ese
--                 hueco es correcto que aparezca, porque es real.
--       otro    → otro · licencia · objeto = la persona
--
--     `calidad_firmante = titular` en todas: hasta hoy no había forma de
--     registrar otra cosa, así que es lo único que se puede afirmar. Si alguna
--     era en realidad de representante, se corrige a mano — y ahora se puede.
-- ------------------------------------------------------------
alter table autorizacion add column if not exists _origen_cesion uuid;

insert into autorizacion (
  proyecto_id, tipo, naturaleza, otorgante_tipo, otorgante_persona_id,
  calidad_firmante, objeto_persona_id, estado, firmado_el, notas,
  medios, incluye_explotacion_comercial_futura,
  creado_en, creado_por, _origen_cesion)
select
  pc.proyecto_id,
  case pc.tipo when 'imagen' then 'imagen_voz_testimonio'
               when 'musica' then 'interpretacion_musical'
               else 'otro' end,
  case pc.tipo when 'imagen' then 'consentimiento' else 'licencia' end,
  'persona',
  pc.persona_id,
  'titular',
  pc.persona_id,
  /* ⚠⚠ EL MAPEO DE ESTADOS, Y LA TRAMPA QUE CASI TUMBA LA MIGRACIÓN ENTERA.
     El vocabulario viejo era ('pendiente','firmada','no_aplica') y `pendiente`
     era el DEFAULT — o sea, la mayoría de las filas. En el nuevo NO EXISTE.
     El primer borrador escribía `case when pc.estado in (los tres) then ...
     else 'en_gestion' end`, con las ramas invertidas: la guarda cubría el
     dominio COMPLETO de la columna origen, así que el `else` era inalcanzable y
     `pendiente` pasaba tal cual. Postgres habría rechazado el check y, como un
     `insert ... select` es UNA sentencia, habría abortado entera: cero
     autorizaciones migradas. Y sin transacción, el insert de documentos de más
     abajo sí se habría ejecutado, dejando papeles sin permisos.
     Se enumera valor por valor, y el `else` recoge lo que venga —incluido
     cualquier estado que alguien añada mañana a la tabla vieja—. */
  case
    /* Una «firmada» sin fecha NO puede entrar como firmada: el check la
       rechaza. Baja a `solicitada`, que es lo que de verdad se sabe de ella, y
       queda visible para que alguien le ponga la fecha. Degradar el dato es
       peor que nada, pero mucho mejor que perderlo. */
    when pc.estado = 'firmada' and pc.firmado_en is not null then 'firmada'
    when pc.estado = 'firmada'                               then 'solicitada'
    when pc.estado = 'no_aplica'                             then 'no_aplica'
    else 'en_gestion'
  end,
  pc.firmado_en,
  /* `no_aplica` exige motivo. Si la fila vieja no lo tenía, se dice que no lo
     tenía en vez de dejar que el check tumbe la migración. */
  nullif(btrim(concat_ws(E'\n',
    nullif(btrim(pc.nota), ''),
    case when pc.tipo <> 'imagen' and coalesce(btrim(pc.obra), '') <> ''
         then 'Obra: ' || btrim(pc.obra) end,
    case when coalesce(btrim(pc.motivo), '') <> '' then 'Motivo: ' || btrim(pc.motivo) end,
    case when pc.estado = 'no_aplica' and coalesce(btrim(pc.motivo), '') = ''
         then 'Migrada de proyecto_cesion sin motivo escrito.' end,
    case when pc.url is not null then 'Documento: ' || pc.url end)), ''),
  /* Sin medios declarados: nadie los preguntó hasta hoy, y suponerlos sería
     inventarse el alcance de un permiso ya firmado. El vacío es el dato. */
  '{}',
  false,
  pc.creado_en, pc.creado_por, pc.id
  from proyecto_cesion pc
 where not exists (select 1 from autorizacion a where a._origen_cesion = pc.id);

/* El PDF de cada cesión pasa a ser un documento_firmado propio, y la
   autorización lo apunta. Solo donde había url: sin papel no hay documento. */
alter table documento_firmado add column if not exists _origen_cesion uuid;
insert into documento_firmado (proyecto_id, modelo, archivo_url, firmado_el,
                               creado_en, creado_por, _origen_cesion)
select pc.proyecto_id,
       case pc.tipo when 'imagen' then 'release_individual'
                    when 'musica' then 'anexo_integrantes'
                    else 'otro' end,
       pc.url, pc.firmado_en, pc.creado_en, pc.creado_por, pc.id
  from proyecto_cesion pc
 where coalesce(btrim(pc.url), '') <> ''
   and not exists (select 1 from documento_firmado d where d._origen_cesion = pc.id);

update autorizacion a
   set documento_id = d.id
  from documento_firmado d
 where a.documento_id is null
   and a._origen_cesion is not null
   and d._origen_cesion = a._origen_cesion;

/* ── `proyecto_cesion` SE QUEDA, PERO YA NO MANDA ──
   ⚠ No se borra. Mientras el código viejo siga desplegado sigue leyéndola, y
   es el rastro del que salió este backfill. `_origen_cesion` tampoco se borra:
   a diferencia del `_origen_po` de las obras, este es el puente que permite
   volver a correr la migración sin duplicar, y vale la pena conservarlo hasta
   que se retire la tabla vieja. */
comment on table proyecto_cesion is
  'OBSOLETA desde db/clearance-autorizacion.sql. La relación vive ahora en '
  '`autorizacion`, que distingue interpretación de composición y de grabación, '
  'y guarda en qué calidad firma quien firma. Se conserva como rastro.';

-- ── RLS ──
alter table autorizacion enable row level security;
drop policy if exists aut_sel on autorizacion;
drop policy if exists aut_ins on autorizacion;
drop policy if exists aut_upd on autorizacion;
drop policy if exists aut_del on autorizacion;
create policy aut_sel on autorizacion for select to authenticated using (true);
create policy aut_ins on autorizacion for insert to authenticated with check (true);
create policy aut_upd on autorizacion for update to authenticated using (true) with check (true);
create policy aut_del on autorizacion for delete to authenticated using (true);

alter table documento_firmado enable row level security;
drop policy if exists doc_sel on documento_firmado;
drop policy if exists doc_ins on documento_firmado;
drop policy if exists doc_upd on documento_firmado;
drop policy if exists doc_del on documento_firmado;
create policy doc_sel on documento_firmado for select to authenticated using (true);
create policy doc_ins on documento_firmado for insert to authenticated with check (true);
create policy doc_upd on documento_firmado for update to authenticated using (true) with check (true);
create policy doc_del on documento_firmado for delete to authenticated using (true);

alter table gestion_contacto enable row level security;
drop policy if exists ges_sel on gestion_contacto;
drop policy if exists ges_ins on gestion_contacto;
drop policy if exists ges_upd on gestion_contacto;
drop policy if exists ges_del on gestion_contacto;
create policy ges_sel on gestion_contacto for select to authenticated using (true);
create policy ges_ins on gestion_contacto for insert to authenticated with check (true);
create policy ges_upd on gestion_contacto for update to authenticated using (true) with check (true);
create policy ges_del on gestion_contacto for delete to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['autorizacion','documento_firmado','gestion_contacto'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                    and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- VERIFICAR — `perdidas` tiene que ser 0. Es la comprobación que vale.
-- ------------------------------------------------------------
select
  (select count(*) from proyecto_cesion)                              as cesiones_viejas,
  (select count(*) from autorizacion)                                 as autorizaciones,
  /* Toda cesión vieja tiene su autorización. Si esto no es 0, se perdió un
     permiso en la migración, que es lo único imperdonable aquí. */
  (select count(*) from proyecto_cesion pc
    where not exists (select 1 from autorizacion a where a._origen_cesion = pc.id))
                                                                       as perdidas_debe_ser_0,
  (select count(*) from autorizacion where estado='firmada')           as firmadas,
  /* Las que venían marcadas «firmada» sin fecha y bajaron a `solicitada`.
     No es un error: es lo que de verdad se sabía de ellas. Revísalas. */
  (select count(*) from proyecto_cesion where estado='firmada' and firmado_en is null)
                                                                       as degradadas_a_solicitada,
  (select count(*) from documento_firmado)                             as documentos,
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('autorizacion','documento_firmado','gestion_contacto'))
                                                                       as politicas_debe_ser_12,
  (select count(*) from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public'
     and tablename in ('autorizacion','documento_firmado','gestion_contacto'))
                                                                       as en_realtime_debe_ser_3;
