-- La suspensión de retenciones de 4ta categoría CADUCA cada 31 de
-- diciembre: se pide a SUNAT (Formulario 1609) y vale solo por ese año
-- calendario. Un booleano miente en enero — seguiría diciendo "Sí"
-- cuando ya venció, y alguien dejaría de retener el 8% por un dato
-- muerto. Guardamos el año, que se autodelata al pasar.
alter table personas add column if not exists suspension_4ta_anio int;

-- Los que ya estaban marcados como suspendidos: se asume el año actual.
update personas set suspension_4ta_anio = extract(year from current_date)::int
 where suspension_4ta is true and suspension_4ta_anio is null;

-- Una vez comprobado, se retira el booleano viejo:
-- alter table personas drop column if exists suspension_4ta;
