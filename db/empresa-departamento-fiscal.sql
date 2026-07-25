-- ============================================================
-- EMPRESAS: departamento del domicilio fiscal (DAFO)
--
-- Completa el domicilio fiscal desglosado (Departamento · Provincia · Distrito)
-- igual que la plataforma DAFO. La provincia y el distrito ya existen
-- (empresa-partida-domicilio.sql); faltaba el departamento.
--
-- (La reserva regional ya no usa los campos SUNARP/SUNAT: se decide con
--  «Región donde opera». Esas columnas viejas quedan sin uso, no se borran.)
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table empresas add column if not exists departamento_fiscal text;

comment on column empresas.departamento_fiscal is 'Departamento del domicilio fiscal (SUNAT/DAFO).';

select
  (select count(*) from information_schema.columns
     where table_name='empresas' and column_name='departamento_fiscal') as tiene_departamento_fiscal;
