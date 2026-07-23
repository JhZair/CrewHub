-- ============================================================
--  Crear las 2 personas que faltaban para cargar sus RHE.
--  Solo se insertan si no existen ya (por DNI). Después de correr esto,
--  vuelve a correr db/mujunakuy-rhe.sql y entran sus 3 RHE (S/ 3,050).
-- ============================================================

insert into personas (nombre, alias, ruc_dni, tipo, relaciones)
select d.nombre, d.alias, d.ruc_dni, 'independiente', array['contacto','proveedor']
from (values
  ('Hilda Perez Diaz',          'HildaP',   '40634286'),
  ('Zenaida Callañaupa Quispe', 'ZenaidaC', '46978092')
) as d(nombre, alias, ruc_dni)
where not exists (select 1 from personas p where p.ruc_dni = d.ruc_dni);

-- Comprobación: que ya existan
select nombre, alias, ruc_dni
  from personas
 where ruc_dni in ('40634286', '46978092')
 order by nombre;
