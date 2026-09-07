-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-obra-cesion.sql — LA OBRA APUNTA A LA AUTORIZACIÓN, NO A LA
--                                  CESIÓN VIEJA
--
--  ⚠ EL SEXTO DE LA SERIE. Correr DESPUÉS de los cinco `clearance-*`
--    anteriores. (`clearance-montaje.sql` dice ser «el último» porque lo era
--    cuando se escribió; este salió después, del repaso previo al commit.)
--
-- ── EL RASTRO QUE QUEDÓ ──
-- `proyecto_obra.cesion_id` apunta a `proyecto_cesion`, que la migración de
-- `autorizacion` dejó obsoleta. Así que /musica seguía leyendo la tabla vieja
-- para decir «🔗 atada a su cesión»: la obra de Jennifer podía enseñar en verde
-- una cesión que en ⚖ clearance ya no era la que manda.
--
-- No es lo mismo que el fallo del que sale esta migración —allí había DOS sitios
-- ESCRIBIENDO— pero es la misma familia: un puntero a una tabla que ya no es la
-- fuente. Y el día que alguien limpie `proyecto_cesion`, ese vínculo se queda
-- apuntando al vacío sin que nada avise.
--
-- ── CÓMO SE TRADUCE ──
-- `autorizacion._origen_cesion` guarda de qué fila de `proyecto_cesion` salió
-- cada autorización. Es exactamente el mapa que hace falta, y por eso aquella
-- migración lo dejó puesto en vez de borrarlo. Se usa aquí y sigue ahí: es lo
-- único que permitiría rehacer esto si algo saliera torcido.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · ANTES — cuántas obras tienen cesión atada.
-- ------------------------------------------------------------
select count(*) filter (where cesion_id is not null) as con_cesion_vieja,
       count(*)                                       as obras_en_proyectos
  from proyecto_obra;

-- ------------------------------------------------------------
-- 2 · LA COLUMNA NUEVA
-- ------------------------------------------------------------
alter table proyecto_obra add column if not exists autorizacion_id uuid
  references autorizacion(id) on delete set null;

comment on column proyecto_obra.autorizacion_id is
  'El permiso que cubre esta música, en `autorizacion`. Sustituye a cesion_id, '
  'que apuntaba a la tabla obsoleta `proyecto_cesion`. `set null`: si se borra '
  'el permiso, la música sigue sonando — y lo que hay que ver es que se quedó '
  'sin papel, no que desapareció.';

create index if not exists idx_po_autorizacion on proyecto_obra(autorizacion_id)
  where autorizacion_id is not null;

-- ------------------------------------------------------------
-- 3 · BACKFILL — traducir por `_origen_cesion`
--     `and po.autorizacion_id is null` lo hace repetible sin pisar nada.
-- ------------------------------------------------------------
update proyecto_obra po
   set autorizacion_id = a.id
  from autorizacion a
 where po.autorizacion_id is null
   and po.cesion_id is not null
   and a._origen_cesion = po.cesion_id
   /* ⚠ Y del MISMO proyecto. `_origen_cesion` es único por construcción, pero
      un permiso no cruza de película (R10) y esta migración no va a ser la que
      abra esa puerta por descuido. */
   and a.proyecto_id = po.proyecto_id;

comment on column proyecto_obra.cesion_id is
  'OBSOLETA desde db/clearance-obra-cesion.sql. Apuntaba a proyecto_cesion, que '
  'ya no es la fuente. El vínculo vive ahora en autorizacion_id. Se conserva '
  'como rastro del backfill; no se escribe ni se lee.';

-- ------------------------------------------------------------
-- VERIFICAR — `sin_traducir` tiene que ser 0.
--   Si no lo es, hay música atada a una cesión que no llegó a `autorizacion`, y
--   eso significa que la migración de permisos se dejó algo por el camino.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
/* ⚠ Sin esto, PostgREST sigue con el esquema viejo en caché y /musica responde
   PGRST204 sobre `autorizacion_id` DESPUÉS de haber corrido la migración. El
   mensaje de la pantalla manda entonces a correr un archivo que ya está
   corrido, que es la peor clase de aviso: el que hace perder la tarde. */

select
  (select count(*) from proyecto_obra where cesion_id is not null)       as tenian_cesion,
  (select count(*) from proyecto_obra where autorizacion_id is not null) as ahora_con_permiso,
  (select count(*) from proyecto_obra po
    where po.cesion_id is not null and po.autorizacion_id is null)       as sin_traducir_debe_ser_0,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='proyecto_obra'
      and column_name='autorizacion_id')                                 as columna_debe_ser_1,
  (select count(*) from pg_indexes where schemaname='public'
     and indexname='idx_po_autorizacion')                                as indice_debe_ser_1,
  /* ⚠ Y que lo traducido sea DE INTERPRETACIÓN. La comprobación que impide
     atar una obra a un permiso de imagen se añadió DESPUÉS de que la tabla
     vieja existiera, así que puede haber `cesion_id` históricas apuntando a una
     cesión de imagen. Traducidas, quedan apuntando a un permiso que /musica no
     lee —filtra por interpretación— y la fila dirá «el permiso atado ya no
     existe» sobre uno que sí existe. Si esto no es 0, hay que mirarlas a mano
     con la consulta de abajo. */
  (select count(*) from proyecto_obra po join autorizacion a on a.id = po.autorizacion_id
    where a.tipo not in ('interpretacion_musical','interpretacion_danza'))
                                                                         as tipo_raro_debe_ser_0;

-- Y cuáles son, si las hay.
select po.id, po.titulo, a.tipo, a.estado
  from proyecto_obra po
  join autorizacion a on a.id = po.autorizacion_id
 where a.tipo not in ('interpretacion_musical','interpretacion_danza');
