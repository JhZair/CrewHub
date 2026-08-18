-- ============================================================
--  db/rhe-urls-po003.sql — EL PDF DE CADA RECIBO, DESDE DRIVE
--
--  Los 26 RHE de PO-003 entraron por carga y se quedaron sin comprobante: la
--  cabecera del bloque marca «📎 26 sin comprobante». El escaneo NO es un
--  adorno — es lo que se presenta. Un RHE en la base sin su PDF es una cifra
--  que no se puede rendir.
--
--  Aquí se les pone el enlace de Drive a los 26 de una vez, en vez de pegarlos
--  a mano uno por uno.
--
--  ── DE DÓNDE SALEN LOS ENLACES ──
--  Del conector de Drive, leyendo la carpeta
--  `042-2024-DAFO-Chaccu/EntregablesDAFO/RecibosPorHonorarios`
--  (id 1oUiC-jLT_xbywmfCL1ksKz9VZ4um6LpX). No se tecleó ningún id.
--  El enlace es `https://drive.google.com/file/d/<ID>/view`: el ID de un
--  archivo de Drive es permanente —sobrevive a renombrarlo y a moverlo de
--  carpeta— y solo muere si alguien BORRA el archivo y sube otro. Para
--  reemplazar el contenido hay que usar «Gestionar versiones», no subir uno
--  nuevo; si se sube uno nuevo, este enlace queda apuntando a la papelera.
--
--  ⚠ EL ENLACE HEREDA LOS PERMISOS DE LA UNIDAD COMPARTIDA. Abre para quien
--  tenga acceso al Drive del colectivo y para nadie más. Sirve mientras la
--  rendición se lea puertas adentro; el día que haya que enseñársela a un
--  contador externo o a DAFO, o se cambian los permisos o se entregan los PDF
--  aparte. Que quede dicho ahora y no el día de la entrega.
--
--  ── CÓMO SE CRUZA, Y POR QUÉ NO BASTA EL NÚMERO ──
--  El nombre del archivo trae RUC y número: `F-00240-1040025424-R01-E001-35`.
--  Pero `E001-3` aparece CUATRO veces en este fondo, de cuatro personas
--  distintas, y `E001-4` tres y `E001-6` otras tres. Cruzar solo por número
--  habría colgado el recibo de Frank en la ficha de otro — sin error, porque
--  el update habría encontrado fila. La clave es (PERSONA, número).
--  La persona sale del RUC: RUC = 10 + DNI(8) + dígito verificador, así que el
--  DNI son los ocho dígitos del medio. Y se compara contra DNI **y** RUC
--  porque uno de los archivos —el de Katy, `1040025424`— viene con el
--  verificador de menos, así que su «RUC» de diez dígitos no casa con nada:
--  su DNI sí.
--
--  ── LA COMPROBACIÓN QUE YA SE HIZO ──
--  Los 26 nombres de archivo de Drive se cruzaron contra los 26 `archivo` del
--  lote que cargó estos mismos recibos (db/rhe-po003.sql): DNI y número
--  coinciden en los 26, ninguno sobra, ninguno falta. No es el mismo dato
--  mirado dos veces — uno viene del nombre en Drive y el otro de lo que se
--  leyó dentro del PDF en su día.
--
--  Idempotente. Correr por pasos.
-- ============================================================

drop table if exists rhe_url_po003;
create table rhe_url_po003(archivo text, ruc text, dni text, numero text, link text);

insert into rhe_url_po003(archivo, ruc, dni, numero, link) values
('F-00241-10074203120-R01-E001-57.pdf','10074203120','07420312','E001-57','https://drive.google.com/file/d/12BZJ3qXxeT7VEGXB9_RwRtPqnk2nBF_a/view'),
('F-00266-10074203120-R01-E001-58.pdf','10074203120','07420312','E001-58','https://drive.google.com/file/d/1iD2MBKK5G-6NuwEVuqpmxK4K3Ku-2odp/view'),
('F-00336-10074203120-R01-E001-59.pdf','10074203120','07420312','E001-59','https://drive.google.com/file/d/1EHLvFuE2NckZGYLNTk0C6Gn7ksu6UBLa/view'),
('RHE10106268440E00-1-61(Miguel Mejia).pdf','10106268440','10626844','E001-61','https://drive.google.com/file/d/1RofssOMnwfrzFSJV_ShpzJYsOq1vMe3v/view'),
('F-00252-10242892432-R01-E001-3.pdf','10242892432','24289243','E001-3','https://drive.google.com/file/d/1p7DoWWAhRCTFz4TMdfqho_2TS0OnYvCN/view'),
('F-00274-10242893285-R01-E001-7.pdf','10242893285','24289328','E001-7','https://drive.google.com/file/d/18y01omnH2Q-KxWhOe-HICAApLSaVbyU9/view'),
('F-00257-10242905615-R01-E001-17.pdf','10242905615','24290561','E001-17','https://drive.google.com/file/d/1aoUda9Ub_SIRZ-Od0D23ipYiN3w7aGN6/view'),
('F-00278-10242918571-R01-E001-27.pdf','10242918571','24291857','E001-27','https://drive.google.com/file/d/1w-nZzRZix-ilRpnrrR5rfdT7C1FGs6A_/view'),
('F-00240-1040025424-R01-E001-35.pdf','1040025424','40025424','E001-35','https://drive.google.com/file/d/17RLVMixy65N92NFAth93Ys7C-buqGNl4/view'),
('F-00243-10412998591-R01-E001-42.pdf','10412998591','41299859','E001-42','https://drive.google.com/file/d/1IVhj2s0DLrCTDzKHU9mOEbZewxqdYSjQ/view'),
('F-00372-10412998591-R01E001-49.pdf','10412998591','41299859','E001-49','https://drive.google.com/file/d/1MkCGUq2k-tZpnvyDjQ9isrDLzTQ15b9E/view'),
('F-00270-10427488735-R01-E001-33.pdf','10427488735','42748873','E001-33','https://drive.google.com/file/d/1bVVpw2TEJygfr04hH4ZIP0rohJDm_eHi/view'),
('F-00265-10438933668-R01-E001-3.pdf','10438933668','43893366','E001-3','https://drive.google.com/file/d/1egP6U8gQ0M-9Y-JynTKAzdnM4gQ4Byeg/view'),
('F-00269-10475564591-R01-E001-4.pdf','10475564591','47556459','E001-4','https://drive.google.com/file/d/19IGaOqz-fcYOOheTOtodPgsgmQAZsIAh/view'),
('F-00245-10478816893-R01-E001-87.pdf','10478816893','47881689','E001-87','https://drive.google.com/file/d/1XpgKww1NxfHR4pwcbHyfbMXkIX4rCIqR/view'),
('F-00268-10478816893-R01-E001-88.pdf','10478816893','47881689','E001-88','https://drive.google.com/file/d/1fY1khR4NVHBIoU5jbJQCZxv7z6Qu-URG/view'),
('F-00338-10478816893-R01-E001-89.pdf','10478816893','47881689','E001-89','https://drive.google.com/file/d/1sowMaBRbWuVjAg4TyVR3BYeRherQ5NDy/view'),
('F-00277-10604982699-R01-E001-4.pdf','10604982699','60498269','E001-4','https://drive.google.com/file/d/1mq3RVhfbFt7BylZAR7KqVfw_xLmcbsjE/view'),
('F-00247-10707103073-R01-E001-2.pdf','10707103073','70710307','E001-2','https://drive.google.com/file/d/1WSCtTS96vRPGncdo_EjZCbCE570OSw1i/view'),
('F-00279-10710826698-R01-E001-4.pdf','10710826698','71082669','E001-4','https://drive.google.com/file/d/1ODaLIaTnPAX5AztL-OkbZEC8KxutXuD3/view'),
('F-00248-10715178651-R01-E001-3.pdf','10715178651','71517865','E001-3','https://drive.google.com/file/d/1rWUlIBzVBRxs71kPJ1KkTM3XBu1Gp90A/view'),
('F-00250-10715178651-R01-E001-12.pdf','10715178651','71517865','E001-12','https://drive.google.com/file/d/1th71PbBuscQOt9AB85YIit6d97F3EyUv/view'),
('F-00271-10716979836-R01-E001-6.pdf','10716979836','71697983','E001-6','https://drive.google.com/file/d/1S3I9ohxd1PoqKvGYB-DpmWV5TIw5QQo0/view'),
('F-00264-10717135445-R01-E001-6.pdf','10717135445','71713544','E001-6','https://drive.google.com/file/d/1NsUQy201fro7otsRyjlcy3N_sI_S9Q1u/view'),
('F-00273-10740957215-R01-E001-6.pdf','10740957215','74095721','E001-6','https://drive.google.com/file/d/1UIbwzCGIGtDH9dbeGxjP4tqBHVNfOgO3/view'),
('F-00272-10741993771-R01-E001-3.pdf','10741993771','74199377','E001-3','https://drive.google.com/file/d/1X6RD5EfaSkDLdjfWdvEJE9kkUvLRiwp6/view')
;


-- ------------------------------------------------------------
-- 1 · MIRAR — no escribe nada
--     Cada archivo con el recibo al que se va a pegar. Lo que interesa es la
--     columna `estado`: si alguno dice «SIN RECIBO», el cruce falló y hay que
--     mirar por qué ANTES de escribir.
-- ------------------------------------------------------------
select u.archivo,
       u.numero,
       coalesce(pe.alias, pe.nombre, '⚠ persona no encontrada') as persona,
       case
         when x.id is null then '⚠ SIN RECIBO — no se pegará'
         when x.url is not null and x.url <> '' then 'ya tiene enlace (se respeta)'
         else 'listo para pegar'
       end as estado,
       x.url as enlace_actual
  from rhe_url_po003 u
  left join personas pe
    on regexp_replace(coalesce(pe.ruc_dni,''), '\D', '', 'g') in (u.dni, u.ruc)
  left join rhe x
    on x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and x.persona_id = pe.id
   and x.numero = u.numero
 order by u.archivo;

-- El recuento. Debe dar 26 archivos y 26 emparejados.
select count(*) as archivos,
       count(x.id) as emparejados,
       count(*) - count(x.id) as huerfanos
  from rhe_url_po003 u
  left join personas pe
    on regexp_replace(coalesce(pe.ruc_dni,''), '\D', '', 'g') in (u.dni, u.ruc)
  left join rhe x
    on x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and x.persona_id = pe.id
   and x.numero = u.numero;


-- ------------------------------------------------------------
-- 2 · ESCRIBIR — descomenta y corre
--     `x.url is null or x.url = ''` no es cautela de más: si alguien ya
--     adjuntó un comprobante a mano desde la pantalla, esa decisión es más
--     reciente y mejor informada que este lote. Pisarla sería deshacer trabajo
--     de una persona sin avisarle.
-- ------------------------------------------------------------
-- update rhe x
--    set url = u.link
--   from rhe_url_po003 u
--   join personas pe
--     on regexp_replace(coalesce(pe.ruc_dni,''), '\D', '', 'g') in (u.dni, u.ruc)
--  where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--    and x.persona_id = pe.id
--    and x.numero = u.numero
--    and (x.url is null or x.url = '')
-- ;


-- ------------------------------------------------------------
-- 3 · VERIFICAR — debe dar 26 con enlace y 0 sin él
-- ------------------------------------------------------------
select count(*) as recibos,
       count(*) filter (where url is not null and url <> '') as con_pdf,
       count(*) filter (where url is null or url = '')       as sin_pdf
  from rhe
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';

-- Y que no haya dos recibos apuntando al MISMO archivo de Drive: eso
-- significaría que el cruce emparejó de más y que uno de los dos enseña el
-- comprobante de otra persona. CERO filas.
select url, count(*) as veces, string_agg(numero, ', ') as recibos
  from rhe
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and url is not null and url <> ''
 group by url having count(*) > 1;


-- ------------------------------------------------------------
-- 4 · LIMPIAR — cuando el paso 3 haya dado 26 · 26 · 0
-- ------------------------------------------------------------
-- drop table if exists rhe_url_po003;
