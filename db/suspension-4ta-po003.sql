-- ============================================================
--  db/suspension-4ta-po003.sql — LAS CONSTANCIAS DE SUSPENSIÓN
--
--  Los 26 recibos de este fondo tienen retención CERO. Eso solo es correcto si
--  quien los emitió tenía la suspensión de 4ta vigente ese año, y lo único que
--  lo prueba es la constancia del Formulario 1609 que devuelve SUNAT. Sin
--  ellas, la pregunta «¿y el 8 % que no retuvieron?» no tiene respuesta.
--
--  Son veinte, en la subcarpeta `Suspension de 4ta categoria` del Drive.
--
--  ── NO SE CREYÓ AL NOMBRE DEL ARCHIVO ──
--  Se abrieron los veinte PDF y se leyó lo que dice SUNAT dentro: RUC, nombre,
--  año, fecha de presentación y número de operación. No fue celo de más:
--
--    · `SuspensionMilderCcahuana.pdf` NO es de ningún Ccahuana. Dentro dice
--      CCAHUAYA TURPO MILDER JESUS, RUC 10604982699. Hay además un ABEL
--      CCAHUANA CCAHUAYA en el mismo fondo, con su propia constancia. Cruzar
--      por el nombre del archivo le habría colgado a Abel la constancia de
--      Milder — y Abel habría quedado «cubierto» dos veces mientras Milder
--      figuraba sin nada.
--    · `SuspencionGaby2026.pdf` no dice ningún apellido. Dentro: MARQUEZ
--      QUISPE GABRIELA, año 2026.
--
--  Un archivo mal nombrado no da error. Solo miente.
--
--  ── UNA PERSONA, UNA FILA; PERO LA SUSPENSIÓN ES ANUAL ──
--  `personas.suspension_4ta_url` guarda UNA constancia y `suspension_4ta_anio`
--  su año. Aquí hay veinte constancias de dieciocho personas: Gabriela tiene
--  2025 y 2026, y Juan Basilides 2024 y 2025.
--  Se carga la MÁS RECIENTE, que es la que dice si la persona está cubierta
--  HOY — que es la pregunta que contesta la ficha de la persona.
--  Pero ojo con lo que eso NO resuelve: para la rendición no importa el estado
--  de hoy sino si había suspensión EL AÑO DEL RECIBO, y eso es una pregunta
--  por recibo, no por persona. La constancia de 2024 de Juan Basilides —la que
--  cubre su recibo E001-57 del 31/10/2024— queda sin sitio donde vivir.
--  Este archivo la deja escrita en la tabla de trabajo para que exista en
--  alguna parte, pero el sistema todavía no tiene dónde guardarla. Es una
--  carencia real, no un descuido de esta carga.
--
--  Idempotente. El paso 2 va DESCOMENTADO: es un update acotado por RUC, el
--  paso 1 enseña exactamente qué va a cambiar, y comentarlo solo conseguía que
--  se saltara.
-- ============================================================

drop table if exists susp_po003;
create table susp_po003(
  archivo text, ruc text, dni text, nombre text,
  anio int, presentado date, operacion text, link text
);

insert into susp_po003(archivo, ruc, dni, nombre, anio, presentado, operacion, link) values
('SuspensionOlivertApaza.pdf','10741993771','74199377','APAZA MAMANI OLIVERT JOHN',2025,'2025-10-07','25096889','https://drive.google.com/file/d/1t9BhxVT3K4qlRi7OsPWQADG-8C-sUZOz/view'),
('SuspensionMariaArqque.pdf','10475564591','47556459','ARQQUE CCORIMANYA MARIA MAGDALENA',2025,'2025-10-07','25096528','https://drive.google.com/file/d/1ysOlF_7GGDOQaTmZQRNbGJ8wvU1Xdxle/view'),
('SuspensionGuillermoCamargo.pdf','10427488735','42748873','CAMARGO PEÑA GUILLERMO',2025,'2025-10-07','25096185','https://drive.google.com/file/d/1rNPPUVbiZNn6U4GUeCkAFV0JYgn_-g8i/view'),
('SuspensionAbelCcahuana.pdf','10716979836','71697983','CCAHUANA CCAHUAYA ABEL',2025,'2025-10-07','25096803','https://drive.google.com/file/d/1CruY6EgOP_GopI3eXBbnJqp0OAewFLgz/view'),
('SuspensionMilderCcahuana.pdf','10604982699','60498269','CCAHUAYA TURPO MILDER JESUS',2025,'2025-10-08','25100932','https://drive.google.com/file/d/15_7Zh6nJSZvo_a_6hhaTxEAHWhtHcXlu/view'),
('SuspensionAgustinaCcorahua.pdf','10717135445','71713544','CCORAHUA MACHACCA AGUSTINA',2025,'2025-10-07','25096913','https://drive.google.com/file/d/1FwYEUnCMeuShu_3RQBwokNsm6c8XK-Pd/view'),
('SuspensionEdenCorredor.pdf','10242893285','24289328','CORREDOR MIRANO EDEN',2025,'2025-10-08','25100847','https://drive.google.com/file/d/1GuI4ADDBqUSOGiot4bLdmvc8UAMK4dUU/view'),
('Suspension-DeLaSotaJuan-2024.pdf','10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES',2024,'2024-10-31','22285720','https://drive.google.com/file/d/12GAUDovO6ylHzKRUOdbAyW-kTAa7ZTgO/view'),
('SuspensionBasilides2025.pdf','10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES',2025,'2025-01-15','23270849','https://drive.google.com/file/d/19H3FEBB6gGUyGwZUralE60sJ-VkRSqtu/view'),
('SuspensionSusanaLuna.pdf','10438933668','43893366','LUNA GODOY SUSANA',2025,'2025-10-07','25096630','https://drive.google.com/file/d/1kh1RNQCb5qeyqoHGd3xG25mCk04LL64H/view'),
('SuspensionRoxana.pdf','10412998591','41299859','MAROCHO VILLEGAS ROXANA',2025,'2025-10-28','25177566','https://drive.google.com/file/d/1fbim34vBkivvqOCIDKOq2u7ia8KejX3a/view'),
('SuspensionGabrielaMarquez2025.pdf','10478816893','47881689','MARQUEZ QUISPE GABRIELA',2025,'2025-10-08','25100574','https://drive.google.com/file/d/1PQyJYMonV76bBOpvf8ID7EDjfQaG9Cql/view'),
('SuspencionGaby2026.pdf','10478816893','47881689','MARQUEZ QUISPE GABRIELA',2026,'2026-07-09','27703370','https://drive.google.com/file/d/1tFbdWeon-kAfjjWAoaeyIOMyRexuNbea/view'),
('SuspensionMiguelMejia 2025.pdf','10106268440','10626844','MEJIA CASTRO MIGUEL ANGEL',2025,'2025-07-30','24765712','https://drive.google.com/file/d/1glsAQHJmS3H1b-ygNp9rV2ohhIommwyU/view'),
('SuspensionFrank2025.pdf','10715178651','71517865','ORTEGA QUISPE FRANK',2025,'2025-01-13','23197387','https://drive.google.com/file/d/1wGUncgzxYWHHoxRJzcyy8ymtmXbRGIaO/view'),
('SuspensionKaty2025.pdf','10400254244','40025424','PEREZ DIAZ KATY',2025,'2025-01-15','23262122','https://drive.google.com/file/d/1CHGePENU6h3Glfd5IzcCDLlscURkICYi/view'),
('SuspensionReinaldoPfoccori.pdf','10710826698','71082669','PFOCCORI TAYPE REINALDO',2025,'2025-10-08','25100990','https://drive.google.com/file/d/1PXv8hpBnvojreVGAEER8Cs31pqW9F1dw/view'),
('SuspensionJustinoPuma.pdf','10242918571','24291857','PUMA CHOQQUEMAMANI JUSTINO',2025,'2025-10-08','25100964','https://drive.google.com/file/d/1HwWqngsd3D9eAY0uNFYtFDA6wubvJN1H/view'),
('SuspensionFlorencioQuispicho.pdf','10242892432','24289243','QUISPICHO QUIJUA FLORENCIO',2025,'2025-10-07','25096559','https://drive.google.com/file/d/1q3Kcj9f0M4aa7upn6zSs7rbnmS1jJpu5/view'),
('SuspensionVictorianoSune.pdf','10242905615','24290561','SUNE CABALLERO VICTORIANO',2025,'2025-10-07','25096773','https://drive.google.com/file/d/1P9U_rq9QpYlk5LGxURUGot2eBhJBuN3C/view')
;


-- ------------------------------------------------------------
-- 1 · MIRAR — no escribe nada
--     Cada constancia con la persona a la que se va a pegar. Si alguna dice
--     «SIN PERSONA», esa no se cargará y hay que darla de alta antes.
-- ------------------------------------------------------------
select s.nombre, s.anio, s.presentado, s.operacion,
       coalesce(p.alias, p.nombre, '⚠ SIN PERSONA EN EL SISTEMA') as ficha,
       case when p.id is null then '⚠ no se cargará'
            when p.suspension_4ta_url is not null then 'ya tenía una (se pisará si es más nueva)'
            else 'listo' end as estado,
       s.archivo
  from susp_po003 s
  left join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (s.dni, s.ruc)
 order by s.nombre, s.anio;

-- ── QUIÉN COBRÓ Y NO TIENE CONSTANCIA ──
-- Esta es la consulta que importa de todo el archivo: los recibos con
-- retención cero que NO tienen con qué justificarla. Son plata que DAFO puede
-- observar, y el 8 % lo terminaría poniendo la asociación.
select coalesce(pe.alias, pe.nombre) as persona,
       count(*) as recibos, sum(x.monto) as total
  from rhe x
  join personas pe on pe.id = x.persona_id
 where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and coalesce(x.retencion, 0) = 0
   and not exists (
     select 1 from susp_po003 s
      where regexp_replace(coalesce(pe.ruc_dni,''), '\D', '', 'g') in (s.dni, s.ruc))
 group by 1 order by 3 desc;


-- ------------------------------------------------------------
-- 2 · ESCRIBIR — la más reciente de cada persona
--     `distinct on (ruc) ... order by anio desc` es lo que elige una sola por
--     persona. Sin el `distinct on`, Gabriela y Juan Basilides recibirían dos
--     updates y ganaría el que Postgres ejecutara último — o sea, al azar.
-- ------------------------------------------------------------
--     ── NO SE TOCA NINGÚN BOOLEANO, Y ESO ES EL PUNTO ──
--     La primera versión de este update ponía además `suspension_4ta = true`.
--     La base lo rechazó porque esa columna ya no existe: db/suspension-4ta-anio.sql
--     la retiró a propósito. Su argumento sigue siendo mejor que el mío —
--     «un booleano miente en enero: seguiría diciendo Sí cuando ya venció, y
--     alguien dejaría de retener el 8 % por un dato muerto».
--     El AÑO es el hecho y se delata solo al pasar; la bandera era una segunda
--     verdad que había que acordarse de apagar. Manda el hecho, no la bandera.
update personas p
   set suspension_4ta_url  = u.link,
       suspension_4ta_anio = u.anio
  from (select distinct on (ruc) ruc, dni, anio, link
          from susp_po003 order by ruc, anio desc) u
 where regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (u.dni, u.ruc)
   /* No se pisa una constancia MÁS NUEVA que la del lote: si alguien ya
      cargó la de 2027 a mano, este archivo no puede hacerla retroceder. */
   and (p.suspension_4ta_anio is null or p.suspension_4ta_anio <= u.anio);


-- ------------------------------------------------------------
-- 3 · VERIFICAR — debe dar 18 personas con constancia
-- ------------------------------------------------------------
select count(*) as personas_con_constancia,
       min(suspension_4ta_anio) as anio_mas_viejo,
       max(suspension_4ta_anio) as anio_mas_nuevo
  from personas
 where suspension_4ta_url is not null
   and regexp_replace(coalesce(ruc_dni,''), '\D', '', 'g')
       in (select dni from susp_po003 union select ruc from susp_po003);

-- Y el detalle, por si algún año quedó atrás.
select coalesce(p.alias, p.nombre) as persona, p.suspension_4ta_anio, p.suspension_4ta_url
  from personas p
 where p.suspension_4ta_url is not null
   and regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g')
       in (select dni from susp_po003 union select ruc from susp_po003)
 order by p.suspension_4ta_anio, 1;


-- ------------------------------------------------------------
-- 4 · LIMPIAR — cuando el paso 3 haya dado 18
--     ⚠ Antes de borrar: aquí dentro están las DOS constancias de años
--     anteriores (Juan Basilides 2024, Gabriela 2025) que la tabla `personas`
--     no puede guardar. Si alguna vez se añade un historial por año, salen de
--     este archivo — que por eso se queda en el repo.
-- ------------------------------------------------------------
-- drop table if exists susp_po003;


-- ============================================================
--  5 · LO QUE APARECIÓ AL BUSCAR EN TODO EL DRIVE
--
--  Se buscó por RUC dentro del TEXTO de los PDF —no por nombre de archivo ni
--  por carpeta—, y aparecieron constancias que no estaban en
--  `EntregablesDAFO/RecibosPorHonorarios/Suspension de 4ta categoria`.
--  Se leyeron todas para confirmar RUC, nombre y año.
--
--  ── SE CIERRAN DOS HUECOS DE 2024 ──
--  Estaban en `.../Suspension` de OTRO proyecto (el lote de febrero de 2024),
--  que es donde se archivó la tanda de ese año:
--    · PEREZ DIAZ KATY 2024      · op. 20652556 · 31/01/2024
--      → https://drive.google.com/file/d/156jC-g8Lx-0cAT1V3BIi575ZXRuE82u4/view
--    · MAROCHO VILLEGAS ROXANA 2024 · op. 20672807 · 01/02/2024
--      → https://drive.google.com/file/d/1W3RynWtlhDCtNhng0y38AeVzcHrshoGu/view
--  Cubren los recibos E001-35 (19/09/2024) y E001-42 (31/10/2024).
--
--  ⚠ NO SE CARGAN EN `personas`, Y NO ES UN OLVIDO. La ficha guarda UNA
--  constancia y las dos ya tienen una MÁS NUEVA (Katy 2026, Roxana 2025). El
--  update del paso 2 las rechazaría —correctamente— por su propia guarda.
--  Quedan escritas aquí porque son la prueba de dos recibos de 2024 y este es,
--  hoy, el único sitio del sistema donde existen. El día que haya historial
--  por año, salen de estas líneas.
--
--  ── SE APUNTA UNA QUE FALTABA ──
--  FARFAN ORTEGA MARY CARMEN no tenía ninguna. Tiene la de 2026 (op. 26596589,
--  04/02/2026). No cubre su recibo E001-6 del 06/10/2025 —para eso haría falta
--  la de 2025— pero sí deja su ficha con dato en vez de en blanco.
-- ============================================================

-- Mary Carmen: la única de las encontradas que sí cambia algo en `personas`.
update personas p
   set suspension_4ta_url  = 'https://drive.google.com/file/d/1h6FRCgLiU9VTgfol3K_ZAszYYrAbv4d9/view',
       suspension_4ta_anio = 2026
 where regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in ('74095721', '10740957215')
   and (p.suspension_4ta_anio is null or p.suspension_4ta_anio <= 2026);

-- ── LO QUE SIGUE SIN APARECER EN NINGÚN SITIO DEL DRIVE ──
--   · ORTEGA QUISPE FRANK — 2024, para su E001-3 del 30/10/2024 (S/ 3,900)
--   · MARQUEZ QUISPE GABRIELA — 2024, para su E001-87 del 31/10/2024 (S/ 1,900)
--   · FARFAN ORTEGA MARY CARMEN — 2025, para su E001-6 del 06/10/2025 (S/ 1,500)
--   · MEJIA CASTRO MIGUEL ANGEL — 2026, para su E001-61 del 03/08/2026 (S/ 1,670)
--   · QUINTANA VARGAS PRISCILLA SHAIEL — NINGÚN año, para su E001-2 del
--     20/08/2025 (S/ 1,000). Es la única que no tiene constancia de ninguna
--     clase: se buscó su RUC 10707103073 en todo el Drive y solo aparece su
--     propio recibo.
-- Son S/ 9,970 de recibos con retención cero sin el papel del año.
-- Se piden a SUNAT en el Formulario 1609; las de años pasados se descargan
-- igual desde la consulta de solicitudes presentadas.
