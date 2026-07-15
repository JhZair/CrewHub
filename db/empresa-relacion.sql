-- Relación de la empresa con nosotros: define de quién SÍ somos responsables.
--   propia  = nuestra (podemos y debemos actuar sobre su SUNAT/RENCA)
--   aliada  = co-postulamos con ella, pero es de terceros
--   externa = cliente, proveedor, institución, etc.
-- Solo las 'propia' generan casos automáticos; el resto es informativo.
alter table empresas add column if not exists relacion text default 'externa';

-- Marca aquí las que SÍ son tuyas (ajusta los nombres a los reales):
-- update empresas set relacion = 'propia'
--   where nombre in ('Pacha Studio', 'A-iCr3a');

-- Y las aliadas con las que co-postulas:
-- update empresas set relacion = 'aliada'
--   where nombre in ('AsocHuaynasP');
