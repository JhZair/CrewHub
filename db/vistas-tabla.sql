-- ============================================================
-- VISTAS DE TABLA (módulo tipo SeaTable)
--
-- `vistas_guardadas` existe desde el primer esquema y nunca se usó: se creó
-- pensando en el feed («Rendición DAFO», «Rodaje»). Se reaprovecha para las
-- vistas de tabla en vez de crear una tabla gemela —dos tablas que guardan
-- «un conjunto de filtros con nombre» acabarían divergiendo—, pero hace falta
-- decir DE QUÉ es cada vista: una de personas no puede aparecer en empresas.
--
-- `config` guarda el resto (columnas visibles, orden, filtros) como jsonb y no
-- como columnas: la forma va a cambiar mientras el módulo crece, y migrar un
-- jsonb es no migrar nada. Cuando se estabilice, se normaliza.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table vistas_guardadas add column if not exists entidad text;
alter table vistas_guardadas add column if not exists config jsonb not null default '{}'::jsonb;

comment on column vistas_guardadas.entidad is
  'De qué es la vista: persona | empresa | proyecto… Null = vista del feed '
  '(el uso original, que nunca se llegó a implementar).';
comment on column vistas_guardadas.config is
  'Columnas visibles, orden y filtros de una vista de tabla. jsonb porque la '
  'forma todavía se mueve: {cols:[], orden:{col,asc}, filtros:[{col,op,val}]}.';

create index if not exists idx_vistas_entidad on vistas_guardadas(entidad, orden);

-- Verificación
select
  (select count(*) from information_schema.columns
    where table_name = 'vistas_guardadas' and column_name = 'entidad')  as col_entidad,
  (select count(*) from information_schema.columns
    where table_name = 'vistas_guardadas' and column_name = 'config')   as col_config,
  (select count(*) from pg_indexes
    where tablename = 'vistas_guardadas' and indexname = 'idx_vistas_entidad') as indice;
