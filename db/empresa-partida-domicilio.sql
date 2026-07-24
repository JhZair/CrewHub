-- ============================================================
-- EMPRESAS: N° de partida electrónica + domicilio fiscal desglosado
--
-- Datos que el expediente DAFO pide de la empresa y que no teníamos sueltos:
--   · partida_electronica → N° de partida registral (SUNARP)
--   · provincia_fiscal    → provincia del domicilio fiscal
--   · distrito_fiscal     → distrito del domicilio fiscal
-- (El DEPARTAMENTO fiscal ya existe como `sunat_region_domicilio`, usado también
--  por la reserva regional; el expediente lo reutiliza.)
--
-- Se listan solos en el expediente de cada postulación (auto-llenado por clave
-- y por etiqueta).
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table empresas add column if not exists partida_electronica text;
alter table empresas add column if not exists provincia_fiscal text;
alter table empresas add column if not exists distrito_fiscal text;

comment on column empresas.partida_electronica is 'N° de partida electrónica registral (SUNARP).';
comment on column empresas.provincia_fiscal is 'Provincia del domicilio fiscal (SUNAT).';
comment on column empresas.distrito_fiscal is 'Distrito del domicilio fiscal (SUNAT).';

select
  (select count(*) from information_schema.columns where table_name='empresas' and column_name='partida_electronica') as tiene_partida,
  (select count(*) from information_schema.columns where table_name='empresas' and column_name='provincia_fiscal') as tiene_provincia,
  (select count(*) from information_schema.columns where table_name='empresas' and column_name='distrito_fiscal') as tiene_distrito;
