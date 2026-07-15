-- Estado tributario de una persona natural. El RUC no se guarda: se
-- deduce del DNI (10 + DNI + dígito verificador), así no hay que
-- tipearlo ni corregir erratas.
-- `suspension_4ta` ya existía en el esquema desde el inicio, pero nunca
-- se mostró en el formulario: define si al pagarle un recibo por
-- honorarios corresponde retener el 8% de renta de 4ta.
alter table personas add column if not exists estado_sunat text;
alter table personas add column if not exists condicion_sunat text;
alter table personas add column if not exists fecha_verificacion_sunat date;
