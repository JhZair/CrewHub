-- ============================================================
--  RHE: eje «etapa» (informe económico)
--
--  El informe económico agrupa los gastos por ETAPA (Pre / Producción / Post).
--  Antes el eje «actividad» apuntaba a una fila del cronograma (actividad_id);
--  se decidió usar la etapa (más simple y cercano al informe). Se guarda la
--  clave de la etapa como texto (preproduccion / produccion / postproduccion).
-- ============================================================

alter table rhe add column if not exists etapa text;

comment on column rhe.etapa is
  'Etapa del informe económico a la que pertenece el gasto (clave: preproduccion / produccion / postproduccion / …). Es el eje que agrupa los RHE para el informe.';
