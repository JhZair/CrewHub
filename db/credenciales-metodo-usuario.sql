-- ============================================================
--  El método de acceso, dicho como es
--
--  1) «Correo y contraseña» → «Usuario y contraseña»
--     El método decía «correo», pero en DAFO se entra con el RUC y en otras
--     con el DNI. La tarjeta se contradecía sola: un identificador de once
--     dígitos con la etiqueta «correo» al lado. «Usuario» no promete de qué
--     tipo es — solo dice que hay uno.
--
--  2) Clave SOL → «RUC + usuario SOL + contraseña»
--     Ninguna de las dos etiquetas anteriores servía: Clave SOL pide TRES
--     datos, no dos. El que se pierde es el usuario SOL — no se deduce del
--     RUC ni del nombre, lo asigna SUNAT o lo eligió alguien hace años. En
--     la ficha va como dato de la cuenta (`credencial_datos`), y el sistema
--     lo reclama en rojo mientras falte.
--
--  Solo renombra el método. No toca identificadores ni ubicaciones.
-- ============================================================

-- 👀 Cómo está hoy
select plataforma, metodo_acceso, count(*) as credenciales
  from credenciales
 group by 1, 2 order by 3 desc;

-- ✅ Paso 1 — Clave SOL primero (es el caso específico)
-- update credenciales
--    set metodo_acceso = 'RUC + usuario SOL + contraseña'
--  where (plataforma ilike '%clavesol%' or plataforma ilike '%clave sol%')
--    and coalesce(metodo_acceso, '') in ('', 'Correo y contraseña', 'Usuario y contraseña');

-- ✅ Paso 2 — el renombre general (ya sin las de SOL)
-- update credenciales
--    set metodo_acceso = 'Usuario y contraseña'
--  where metodo_acceso = 'Correo y contraseña';

-- 🔎 Control: cuáles de SOL están sin su usuario SOL registrado.
--     Estas no abren nada: están el RUC y la clave, falta el tercero.
-- select c.plataforma, c.identificador
--   from credenciales c
--  where c.metodo_acceso = 'RUC + usuario SOL + contraseña'
--    and not exists (
--          select 1 from credencial_datos d
--           where d.credencial_id = c.id and d.etiqueta ~* 'usuario\s*sol');

-- Control: no debería quedar ninguna con el nombre viejo
-- select count(*) from credenciales where metodo_acceso = 'Correo y contraseña';
