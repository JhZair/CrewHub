-- ============================================================
--  «Correo y contraseña» → «Usuario y contraseña»
--
--  El método decía «correo», pero en DAFO se entra con el RUC, en SUNAT
--  con RUC + clave SOL, y en otras con el DNI. La tarjeta se contradecía
--  sola: un identificador de once dígitos con la etiqueta «correo» al lado.
--  «Usuario» no promete de qué tipo es — solo dice que hay uno.
--
--  Solo renombra el método. No toca identificadores ni ubicaciones.
-- ============================================================

-- 👀 Cuántas son
select metodo_acceso, count(*) as credenciales
  from credenciales
 group by 1 order by 2 desc;

-- ✅ El renombre
-- update credenciales
--    set metodo_acceso = 'Usuario y contraseña'
--  where metodo_acceso = 'Correo y contraseña';

-- Control: no debería quedar ninguna con el nombre viejo
-- select count(*) from credenciales where metodo_acceso = 'Correo y contraseña';
