-- Constancia de la suspensión de 4ta (el comprobante que emite SUNAT al
-- tramitar el Formulario 1609). El año dice que está vigente; esto lo
-- prueba. Se renueva junto con el año.
alter table personas add column if not exists suspension_4ta_url text;
