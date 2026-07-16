-- ============================================================
--  La puerta de cada credencial
--
--  El inventario guardaba con QUÉ entrar —usuario, método, dónde vive la
--  clave— pero no A DÓNDE. Para entrar a DAFO había que acordarse de
--  «plataformamincu.cultura.gob.pe/administrados», que nadie recuerda: se
--  busca en Google, se entra por el primer resultado, y ahí es donde
--  aparecen las páginas falsas.
--
--  Guardar la URL no es comodidad: es la única forma de que el equipo
--  entre siempre por la puerta correcta.
-- ============================================================
alter table credenciales add column if not exists url text;

-- La misma plataforma se repite en varias credenciales (seis empresas con
-- DAFO-Estímulos). Rellenar de una las que compartan nombre:
--
-- update credenciales c set url = 'https://plataformamincu.cultura.gob.pe/administrados'
--  where c.plataforma ilike '%dafo%' and c.url is null;
--
-- update credenciales c set url = 'https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm'
--  where c.plataforma ilike '%sunat%' and c.url is null;

-- Ver cómo quedó
select plataforma, count(*) as credenciales,
       count(url) as con_url,
       max(url) as url
  from credenciales
 group by 1 order by 2 desc;
