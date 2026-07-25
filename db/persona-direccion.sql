-- ============================================================
-- PERSONAS: dirección del domicilio del DNI
--
-- El censo DAFO pide, por persona, el domicilio del DNI desglosado:
-- dirección + departamento (ya existe como `region`) + provincia + distrito
-- (ya existen). Faltaba la dirección (la línea de calle).
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table personas add column if not exists direccion text;

comment on column personas.direccion is 'Dirección (calle) del domicilio del DNI (censo DAFO).';

select
  (select count(*) from information_schema.columns
     where table_name='personas' and column_name='direccion') as tiene_direccion;
