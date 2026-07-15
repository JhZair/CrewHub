-- Fecha de la última verificación del DNI en RENIEC.
--
-- El botón ya consultaba y dejaba una línea en el historial, pero no
-- guardaba nada: para saber cuándo se verificó por última vez había que
-- bucear en la bitácora. Ahora vive junto al DNI, igual que la de SUNAT.
alter table personas add column if not exists fecha_verificacion_reniec date;

-- El nombre que devolvió RENIEC. Es el nombre OFICIAL: si no coincide con
-- el registrado, el que está mal es el nuestro, y las carpetas de
-- postulación se arman con éste.
alter table personas add column if not exists nombre_reniec text;
