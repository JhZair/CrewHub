-- ============================================================
-- EMPRESAS: PDF de la partida electrónica (SUNARP)
--
-- Como RENCA o la vigencia de poder: el N° de partida ya existe
-- (empresa-partida-domicilio.sql); faltaba el enlace a su PDF escaneado, con su
-- verificación ✓/✗ como los demás documentos.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table empresas add column if not exists partida_electronica_url text;

comment on column empresas.partida_electronica_url is 'PDF de la partida electrónica registral (SUNARP).';

select
  (select count(*) from information_schema.columns
     where table_name='empresas' and column_name='partida_electronica_url') as tiene_partida_url;
