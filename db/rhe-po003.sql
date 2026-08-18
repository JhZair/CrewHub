-- ============================================================
--  RECIBOS POR HONORARIOS — PO-003 · Chaccu: Entre Lana y Tradición
--
--  Fuente: los 26 PDF de EntregablesDAFO/RecibosPorHonorarios (Drive).
--  Leídos con su capa de texto —los RHE de SUNAT la traen— y generado este
--  archivo desde los datos. Nada se transcribió a mano.
--
--  Total bruto: S/ 98,270.00 · retenciones: S/ 0.00 en los 26.
--
--  ── LO QUE HAY QUE MIRAR ANTES DE CARGAR ──
--  20 de los 26 recibos (S/ 80,770.00) están emitidos DESPUÉS del 11/09/2025,
--  que es cuando venció el plazo de ejecución del acta (cl. 7.2), y también
--  después del 20/08/2025, día en que la cuenta del fondo quedó en S/ 0.52.
--  El archivo los carga igual —son los recibos que existen, y ocultarlos no
--  cambia el hecho— pero conviene saberlo antes de armar el informe económico.
--
--  ── CÓMO SE EMPAREJA CADA RECIBO CON SU PERSONA ──
--  Por el DNI que va DENTRO del RUC: un RUC de persona natural es 10 + DNI(8) +
--  dígito verificador, así que `substring(ruc from 3 for 8)` da el DNI, que es
--  lo que guarda `personas.ruc_dni`. Se prueba también contra el RUC completo
--  por si alguna ficha lo tiene así.
--  El nombre NO se usa para emparejar: «MARQUEZ QUISPE GABRIELA» y «Gabriela
--  Márquez» son la misma persona y no se parecen como texto, mientras que dos
--  personas distintas sí pueden llamarse parecido. El documento es el dato.
--  Lo que no case sale en el paso 2 con nombre y DNI, para darlo de alta o
--  corregir su ficha — nunca se inventa una persona.
--
--  ── EL NÚMERO NO ES ÚNICO ──
--  «E001-3» aparece en cuatro recibos de cuatro personas distintas: cada quien
--  numera su propia serie. La llave anti-duplicado es (persona, número), y por
--  eso el paso 4 la comprueba en vez de fiarse del número solo.
--
--  ── LO QUE ESTE ARCHIVO NO PONE ──
--  · `url`: el enlace de Drive de cada PDF. No está dentro del archivo; se
--    pega desde la pantalla o cuando el conector de Drive esté disponible.
--  · `etapa` y `rubro_item`: los dos ejes de la conciliación. El concepto del
--    recibo no siempre dice a qué etapa del cronograma corresponde, y
--    adivinarlo llenaría la conciliación de números en la casilla equivocada.
--    Se asignan desde /fondo, que es donde se ve el presupuesto al lado.
--
--  Correr en: Supabase → SQL Editor. Idempotente.
-- ============================================================

drop table if exists rhe_po003;
create table rhe_po003(
  ruc text, dni text, emisor text, numero text, fecha date,
  bruto numeric(12,2), retencion numeric(12,2), concepto text, archivo text);

insert into rhe_po003(ruc, dni, emisor, numero, fecha, bruto, retencion, concepto, archivo) values
  ('10400254244','40025424','PEREZ DIAZ KATY','E001-35','2024-09-19',1900.00,0.00,'ORGANIZACION Y PLANIFICACION PARA INICIAR EL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00240-1040025424-R01-E001-35.pdf'),
  ('10715178651','71517865','ORTEGA QUISPE FRANK','E001-3','2024-10-30',3900.00,0.00,'ORGANIZACION Y PLANIFICACION EN EL INICIO DEL PROYECTO CHACCU: ENTRE LANA Y TRADICION EN POMACANCHI.','F-00248-10715178651-R01-E001-3.pdf'),
  ('10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES','E001-57','2024-10-31',4900.00,0.00,'PLANIFICACION Y ORGANIZACION EN EL INICIO DEL PROYECTO CHACCU: ENTRE LANA Y TRADICION EN POMACANCHI.','F-00241-10074203120-R01-E001-57.pdf'),
  ('10412998591','41299859','MAROCHO VILLEGAS ROXANA','E001-42','2024-10-31',3900.00,0.00,'PLANIFICACION Y ORGANIZACION CON EL INICIO DEL PROYECTO CHACCU: ENTRE LANA Y TRADICION EN POMACANCHI.','F-00243-10412998591-R01-E001-42.pdf'),
  ('10478816893','47881689','MARQUEZ QUISPE GABRIELA','E001-87','2024-10-31',1900.00,0.00,'ORGANIZACION Y PLANIFICACION PARA INICIAR EL PROYECTO CHACCU: ENTRE LANA Y TRADICION EN POMACANCHI.','F-00245-10478816893-R01-E001-87.pdf'),
  ('10707103073','70710307','QUINTANA VARGAS PRISCILLA SHAIEL','E001-2','2025-08-20',1000.00,0.00,'PAGO COMO TRADUCTORA EN EL PROYECTO CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00247-10707103073-R01-E001-2.pdf'),
  ('10715178651','71517865','ORTEGA QUISPE FRANK','E001-12','2025-10-05',13000.00,0.00,'PLANEACION, LOGISTICA Y PREPARACION TECNICA EN EL PROYECTO CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI','F-00250-10715178651-R01-E001-12.pdf'),
  ('10242892432','24289243','QUISPICHO QUIJUA FLORENCIO','E001-3','2025-10-06',6000.00,0.00,'POR SERVICIOS DE APOYO TECNICO EN LA CAPACITACION AUDIOVISUAL DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00252-10242892432-R01-E001-3.pdf'),
  ('10438933668','43893366','LUNA GODOY SUSANA','E001-3','2025-10-06',2500.00,0.00,'POR SERVICO DE ALQUILER DE LOCAL PARA EVENTO DE CAPACITACION DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00265-10438933668-R01-E001-3.pdf'),
  ('10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES','E001-58','2025-10-06',6000.00,0.00,'POR LA PLANIFICACION Y LOGISTICA DE EQUIPOS EN EL SITIO, PARA EL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00266-10074203120-R01-E001-58.pdf'),
  ('10475564591','47556459','ARQQUE CCORIMANYA MARIA MAGDALENA','E001-4','2025-10-06',6000.00,0.00,'ALIMENTACION DEL EQUIPO DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00269-10475564591-R01-E001-4.pdf'),
  ('10716979836','71697983','CCAHUANA CCAHUAYA ABEL','E001-6','2025-10-06',2500.00,0.00,'OPERADOR DE DRONE EN EL PROYECTO CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00271-10716979836-R01-E001-6.pdf'),
  ('10740957215','74095721','FARFAN ORTEGA MARY CARMEN','E001-6','2025-10-06',1500.00,0.00,'PAGO POR ENTREVISTADORA EN EL PROYECTO CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00273-10740957215-R01-E001-6.pdf'),
  ('10242905615','24290561','SUNE CABALLERO VICTORIANO','E001-17','2025-10-07',5900.00,0.00,'PAGO COMO ASISTENTE EN EL AREA FORMATIVA DE NARRATIVA DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI','F-00257-10242905615-R01-E001-17.pdf'),
  ('10478816893','47881689','MARQUEZ QUISPE GABRIELA','E001-88','2025-10-07',6300.00,0.00,'POR ACTIVIDADES DE DIRECCION Y PRODUCCIÓN GENERAL DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00268-10478816893-R01-E001-88.pdf'),
  ('10741993771','74199377','APAZA MAMANI OLIVERT JOHN','E001-3','2025-10-07',3000.00,0.00,'POR EL SERVICIO COMO CAMAROGRAFO PARA LA GRABACION DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00272-10741993771-R01-E001-3.pdf'),
  ('10242893285','24289328','CORREDOR MIRANO EDEN','E001-7','2025-10-07',1300.00,0.00,'POR EL SERVICIO DE SEGURIDAD Y VIGILANCIA PARA EL RESGUARDO Y CUSTODIA DEL EQUIPAMIENTO AUDIOVISUAL Y TECNICO EN LA ETAPA DE PRODUCCIÓN DEL PROYECTO DOCUMENTAL, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00274-10242893285-R01-E001-7.pdf'),
  ('10604982699','60498269','CCAHUAYA TURPO MILDER JESUS','E001-4','2025-10-07',1900.00,0.00,'COMO ASISTENTE DE CAMAROGRAFO DURANTE LA FILMACION/RODAJE EN LA ETAPA DE PRODUCCIÓN DEL PROYECTO DOCUMENTAL, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI','F-00277-10604982699-R01-E001-4.pdf'),
  ('10242918571','24291857','PUMA CHOQQUEMAMANI JUSTINO','E001-27','2025-10-07',2500.00,0.00,'POR SERVICIO COMO CAMARÓGRAFO DE REGISTRO CONTINUO PARA LA DOCUMENTACIÓN DE PLANOS GENERALES Y TOMAS DE APOYO EN LA ETAPA DE PRODUCCIÓN DEL PROYECTO DOCUMENTAL, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00278-10242918571-R01-E001-27.pdf'),
  ('10717135445','71713544','CCORAHUA MACHACCA AGUSTINA','E001-6','2025-10-08',300.00,0.00,'POR EL SERVICIO DE FOTOCOPIADO E IMPRESION DE MATERIAL PARA TALLER FORMATIVO DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00264-10717135445-R01-E001-6.pdf'),
  ('10427488735','42748873','CAMARGO PEÑA GUILLERMO','E001-33','2025-10-08',3000.00,0.00,'TRANSPORTE DE PERSONAS Y CARGA TERRESTRE PARA EL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00270-10427488735-R01-E001-33.pdf'),
  ('10710826698','71082669','PFOCCORI TAYPE REINALDO','E001-4','2025-10-08',1500.00,0.00,'PAGO COMO SONIDISTA PARA EL REGISTRO DE SONIDO DIRECTO Y PAISAJES SONOROS DURANTE LA ACTIVIDAD FILMACIÓN / RODAJE EN LA ETAPA DE PRODUCCIÓN DEL PROYECTO CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00279-10710826698-R01-E001-4.pdf'),
  ('10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES','E001-59','2025-10-26',3000.00,0.00,'PAGO POR LA LOGISTICA Y TRANSPORTE PARA SOCIALIZACION DEL PROYECTO CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI','F-00336-10074203120-R01-E001-59.pdf'),
  ('10478816893','47881689','MARQUEZ QUISPE GABRIELA','E001-89','2025-10-27',6900.00,0.00,'POR LA DIRECCION EN POSTPRODUCCIÓN DEL PROYECTO, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI','F-00338-10478816893-R01-E001-89.pdf'),
  ('10412998591','41299859','MAROCHO VILLEGAS ROXANA','E001-49','2025-11-04',6000.00,0.00,'COMO COMPAÑANTE DEL AREA FORMATIVA DEL PROYECTO DOCUMENTAL, CHACCU: ENTRE LANA Y TRADICIÓN EN POMACANCHI.','F-00372-10412998591-R01E001-49.pdf'),
  ('10106268440','10626844','MEJIA CASTRO MIGUEL ANGEL','E001-61','2026-08-03',1670.00,0.00,'DIRECTOR DE FOTOGRAFIA Y CAMARA EN CAMPO DEL PROYECTO CHACCU: ENTRE LANA Y TRADICION','RHE10106268440E00-1-61(Miguel Mejia).pdf')
;

-- ------------------------------------------------------------
-- 1 · A QUIÉN CORRESPONDE CADA UNO
--     Mira la columna `persona`: si dice «⚠ SIN PERSONA», ese recibo no se va
--     a cargar en el paso 3 — no porque falle, sino porque no hay a quién
--     colgárselo. El paso 2 los lista aparte.
-- ------------------------------------------------------------
select r.numero, r.fecha, r.bruto, r.emisor,
       coalesce(p.nombre, '⚠ SIN PERSONA') as persona,
       r.dni
  from rhe_po003 r
  left join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (r.dni, r.ruc)
 order by r.fecha, r.numero;

-- ------------------------------------------------------------
-- 2 · LOS QUE NO ENCONTRARON PERSONA
--     Cada uno es alguien a quien se le giró dinero del fondo y que no está
--     en la base, o cuya ficha tiene el DNI mal. Las dos cosas hay que
--     arreglarlas: un recibo sin persona no aparece en la pestaña Equipo ni
--     cuenta en la conciliación.
-- ------------------------------------------------------------
select r.dni, r.emisor, count(*) as recibos, sum(r.bruto) as total
  from rhe_po003 r
  left join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (r.dni, r.ruc)
 where p.id is null
 group by r.dni, r.emisor
 order by total desc;

-- ------------------------------------------------------------
-- 3 · ESCRIBIR
--     Descomenta y corre cuando el paso 1 y el 2 te parezcan bien.
--     Solo entran los que tienen persona. `not exists` en vez de `on conflict`
--     porque la tabla no tiene un unique sobre (persona, numero): la
--     comprobación se hace aquí, y el paso 4 verifica que funcionó.
-- ------------------------------------------------------------
-- insert into rhe (persona_id, postulacion_id, numero, fecha, monto, retencion, concepto)
-- select p.id, 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad', r.numero, r.fecha, r.bruto, r.retencion, r.concepto
--   from rhe_po003 r
--   join personas p
--     on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (r.dni, r.ruc)
--  where not exists (
--    select 1 from rhe x
--     where x.persona_id = p.id and x.numero = r.numero
--       and x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad');

-- ------------------------------------------------------------
-- 4 · VERIFICAR — cuántos entraron, cuánto suman y si hay duplicados
--     El total debería ser S/ 98,270.00 MENOS lo de las personas que falten.
-- ------------------------------------------------------------
select count(*) as recibos, sum(monto) as total_bruto, sum(retencion) as total_retenido
  from rhe where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';

select persona_id, numero, count(*) as veces
  from rhe where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
 group by persona_id, numero having count(*) > 1;

-- ------------------------------------------------------------
-- 5 · CUÁNTO DEL ESTÍMULO QUEDA SIN SUSTENTAR CON RHE
--     Los honorarios son una parte: el resto va con facturas (tabla
--     `comprobante`) y declaraciones juradas (`gasto_dj`, tope 25% = S/ 50,000
--     según la cl. 5.2.4.3). Esta consulta junta las tres para que el hueco se
--     vea de una vez, en lugar de descubrirlo al armar el informe.
-- ------------------------------------------------------------
select 'RHE (honorarios)' as via,
       coalesce(sum(monto),0) as total
  from rhe where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
union all
select 'Facturas y boletas', coalesce(sum(importe),0)
  from comprobante where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
union all
select 'Declaraciones juradas', coalesce(sum(importe),0)
  from gasto_dj where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
union all
select 'ESTÍMULO OTORGADO', 200000.00;

-- ------------------------------------------------------------
-- 6 · LIMPIAR
-- ------------------------------------------------------------
-- drop table if exists rhe_po003;
