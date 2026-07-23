-- ============================================================
--  Fusionar los duplicados de Hilda y Zenaida.
--  Se CONSERVA el registro original (con su rol/historial) y se absorbe la
--  copia recién creada. persona_fusionar reasigna los RHE (y todo lo demás)
--  al registro que se queda, así que no se pierde ningún recibo.
--  Después se le pasa el DNI al que se queda y se marca «proveedor».
--
--    Hilda:   conservar 643fbb4b… (colaborador eventual)  ← absorber 9a5cdc78… (1 RHE)
--    Zenaida: conservar 03700f3a… (Servicios Contables)   ← absorber 99e44aa9… (2 RHE)
-- ============================================================

-- 1) Fusionar (mueve los RHE al registro que se queda)
select persona_fusionar('643fbb4b-86a2-430c-aa09-4e9a621f6e39',   -- Hilda: se queda
                         '9a5cdc78-1d86-45ea-9cdc-d6c7d6fd273a')   -- Hilda: se absorbe
       as hilda;
select persona_fusionar('03700f3a-4333-47d4-8835-4946ca07afc8',   -- Zenaida: se queda
                         '99e44aa9-df60-4f4f-bc64-3f877e0e3e20')   -- Zenaida: se absorbe
       as zenaida;

-- 2) Pasar el DNI al que se queda + marcar «proveedor» (sin repetir relaciones)
update personas set
  ruc_dni = '40634286',
  relaciones = (select array(select distinct e from unnest(relaciones || '{proveedor}'::text[]) e))
 where id = '643fbb4b-86a2-430c-aa09-4e9a621f6e39';

update personas set
  ruc_dni = '46978092',
  relaciones = (select array(select distinct e from unnest(relaciones || '{proveedor}'::text[]) e))
 where id = '03700f3a-4333-47d4-8835-4946ca07afc8';

-- 3) Comprobación: deben quedar 2 personas (no 4), cada una con su DNI y sus RHE
select p.nombre, p.alias, p.ruc_dni, p.tipo, p.rol,
       (select count(*) from rhe r where r.persona_id = p.id) as rhe
  from personas p
 where p.id in ('643fbb4b-86a2-430c-aa09-4e9a621f6e39',
                '03700f3a-4333-47d4-8835-4946ca07afc8')
 order by p.nombre;
