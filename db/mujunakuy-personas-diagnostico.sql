-- Ver las 2 parejas duplicadas (Hilda y Zenaida) con sus datos e ids.
-- Sirve para decidir cuál conservar antes de fusionar. Muestra cuántos RHE
-- cuelga cada registro (los recién creados deberían tener los RHE).
select p.id,
       p.nombre,
       p.alias,
       p.ruc_dni,
       p.tipo,
       p.rol,
       p.relaciones,
       p.creado_en::date as creada,
       (select count(*) from rhe r where r.persona_id = p.id) as rhe
  from personas p
 where p.ruc_dni in ('46978092', '40634286')
    or nrm_nombre(p.nombre) in (nrm_nombre('Zenaida Callañaupa Quispe'),
                                nrm_nombre('Hilda Perez Diaz'))
 order by nrm_nombre(p.nombre), p.creado_en;
