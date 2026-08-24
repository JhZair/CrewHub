-- ============================================================
--  db/banco-po001.sql — ESTADOS DE CUENTA Y MOVIMIENTOS · PO-001
--  Mujeres del Ande: Voces que Transforman · PACHA APUS PLUS E.I.R.L.
--
--  Cuenta corriente BCP 285-7320207-0-70 (soles) — la cuenta exclusiva del
--  estimulo que exige la clausula 6.1 del acta 139-2025-DAFO.
--  Seis estados mensuales: enero a junio de 2026. 181 movimientos.
--
--  ── DE DONDE SALEN LOS NUMEROS ──
--  De los seis PDF emitidos por el banco. Vienen protegidos con contrasena
--  pero SI traen capa de texto: no hubo OCR ni transcripcion a mano. Se
--  parsearon y se genero este archivo. Un dedazo en el saldo de un fondo del
--  Estado se descubre en la auditoria, no antes.
--
--  ── LAS TRES COMPROBACIONES QUE YA PASARON ──
--  1. La formula del propio banco (A+B+C-D-E+F-G=H) cuadra en los seis meses.
--  2. El saldo de cierre de cada mes es el de apertura del siguiente, sin
--     saltos. Eso prueba que no falta ningun estado: seis saldos correctos con
--     un mes ausente en medio se ven bien y mienten.
--  3. Fila a fila: la suma de los 181 movimientos coincide con el resumen de
--     cada mes, y el saldo corrido cuadra movimiento a movimiento. Esta es la
--     que prueba que no se perdio ninguna linea al parsear — y de hecho
--     encontro tres veces que si se estaban perdiendo.
--  El paso 4 vuelve a comprobar la cadena YA DENTRO de la base: lo que importa
--  no es que el PDF cuadre, es que cuadre lo que quedo guardado.
--
--  ── POR QUE EL PASO 1 AMPLIA UNA CLAVE UNICA ──
--  El 30/03/2026 hay DOS retiros de S/ 1,500.00, a las 11:35 y 11:36, misma
--  agencia, operaciones 008255 y 008257. Son dos retiros reales. Con la clave
--  unica anterior —(postulacion_id, fecha, glosa, monto, tipo)— eran la misma
--  fila: el `on conflict do nothing` habria cargado uno solo y marzo cuadraria
--  S/ 1,500 de menos, sin dar ningun error. No es raro ni es de estos PDF: le
--  pasa a cualquier fondo donde alguien saque dos veces lo mismo el mismo dia.
--  Con `saldo` en la clave las 181 filas son unicas, porque el saldo corrido
--  no se repite nunca dentro de una cuenta.
--  Ampliar una clave unica solo ADMITE filas que antes bloqueaba, asi que no
--  puede chocar con los movimientos que ya tiene PO-003.
--
--  ── QUE SE GUARDA EN `intereses` ──
--  Los intereses ACREEDORES (los que gana el fondo): 0.00 en los seis meses.
--  El unico interes del semestre es un DEUDOR de S/ 0.07 en enero, que es un
--  cargo del banco, no un rendimiento. Sumarlo ahi inflaria lo que hay que
--  reportar como interes generado ante DAFO. Se dice en la nota, que es donde
--  no engana a ningun total.
--
--  ── LO QUE ESTE ARCHIVO NO HACE ──
--  · No sube los PDF: `url` queda en null. Hay que subirlos a Drive y
--    enlazarlos desde la pantalla (clausula 5.2.3 pide los estados mensuales).
--  · No toca `fecha_desembolso`: ya esta cargada en 05/01/2026 y el estado de
--    enero la confirma (S/ 400,000.00 por ventanilla, origen Banco de la
--    Nacion). No hay nada que corregir.
--  · No ata ningun movimiento a su RHE (`rhe_id` queda null). Por la clausula
--    6.1 TODO retiro es gasto directo del proyecto, asi que los 99 retiros de
--    este semestre —S/ 288,801.22— habra que atarlos uno a uno. Eso es trabajo
--    humano y se hace desde /fondo.
--
--  Correr en: Supabase -> SQL Editor. De arriba abajo, no hay nada que
--  descomentar. Idempotente: correrlo dos veces no duplica nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · AMPLIAR LA CLAVE UNICA DE movimiento_banco
--     Ver la cabecera. Sin esto, el paso 3 pierde un retiro en silencio.
-- ------------------------------------------------------------
alter table movimiento_banco
  drop constraint if exists movimiento_banco_postulacion_id_fecha_glosa_monto_tipo_key;

create unique index if not exists uq_movbanco_fila
  on movimiento_banco (postulacion_id, fecha, glosa, monto, tipo, saldo);

-- ------------------------------------------------------------
-- 2 · LOS SEIS ESTADOS MENSUALES
--     Una sola sentencia: el id se resuelve por codigo dentro del propio
--     insert, no hay tabla de paso que se pueda quedar a medias. Si 'PO-001'
--     no existiera, no escribe nada en vez de escribirle a un fondo ajeno.
--     `do nothing`: si un mes ya estaba cargado no se pisa. Para recargarlo
--     con cifras corregidas, borra esa fila primero.
-- ------------------------------------------------------------
insert into estado_cuenta (postulacion_id, periodo, saldo, intereses, nota)
select po.id, v.periodo::date, v.saldo, v.intereses, v.nota
  from (select id from postulaciones where codigo = 'PO-001') po,
       (values
  ('2026-01-01', 338893.13, 0.00, 'Desembolso del estimulo: S/ 400,000.00 el 05/01/2026 por ventanilla (SUC LIMA, origen Banco de la Nacion). Es la fecha desde la que corre el plazo de dos anios del acta 139-2025-DAFO. El mes abre en S/ -10.50: la cuenta ya existia antes del estimulo. Intereses deudores del mes: S/ 0.07 (cargo del banco, no rendimiento).'),
  ('2026-02-01', 279982.26, 0.00, 'Incluye un porte de extracto del 31/01 cobrado el 02/02 (S/ 3.50): fecha de proceso 02-02, fecha valor 31-01.'),
  ('2026-03-01', 232580.71, 0.00, 'Dos retiros de S/ 1,500.00 el 30/03 a las 11:35 y 11:36 (operaciones 008255 y 008257): son dos, no uno repetido.'),
  ('2026-04-01', 181148.86, 0.00, null),
  ('2026-05-01', 148733.86, 0.00, null),
  ('2026-06-01', 110848.76, 0.00, 'Ultimo estado cargado. A esta fecha van ejecutados S/ 289,140.74 de los S/ 400,000 (72.3%) y quedan S/ 110,848.76 en cuenta.')
       ) as v(periodo, saldo, intereses, nota)
on conflict (postulacion_id, periodo) do nothing;

-- ------------------------------------------------------------
-- 3 · LOS 181 MOVIMIENTOS
--     `categoria` sale de la glosa del banco:
--       desembolso · BCO.NACI (el estimulo entrando)                    1
--       comision   · ITF, mantenimiento, envio de estado, portes       80
--       interes    · intereses deudores                                 1
--       retiro     · todo lo demas que sale: salida real a gastos      99
--     Los 80 cargos de comision suman S/ 339.45 en el semestre. Van
--     separados de los retiros a proposito: sin esa separacion, «cuanto se
--     llevo el banco» solo se puede contestar leyendo 181 lineas.
-- ------------------------------------------------------------
insert into movimiento_banco (postulacion_id, fecha, glosa, medio, tipo, monto, saldo, categoria)
select po.id, v.fecha::date, v.glosa, v.medio, v.tipo, v.monto, v.saldo, v.categoria
  from (select id from postulaciones where codigo = 'PO-001') po,
       (values
  ('2026-01-05','BCO.NACI0000','VEN','abono',400000.00,399989.50,'desembolso'),
  ('2026-01-05','RETIRO EFECTIVO','CAJ','cargo',3000.00,396989.50,'retiro'),
  ('2026-01-05','IMPUESTO ITF','INT','cargo',20.15,396969.35,'comision'),
  ('2026-01-06','RETIRO EFECTIVO','CAJ','cargo',3000.00,393969.35,'retiro'),
  ('2026-01-06','TRAN.CTAS.TERC.BM','BPI','cargo',5000.00,388969.35,'retiro'),
  ('2026-01-06','IMPUESTO ITF','INT','cargo',0.40,388968.95,'comision'),
  ('2026-01-09','TRAN.CTAS.TERC.BM','BPI','cargo',300.00,388668.95,'retiro'),
  ('2026-01-09','TRAN.CTAS.TERC.BM','BPI','cargo',388.00,388280.95,'retiro'),
  ('2026-01-09','TRAN.CTAS.TERC.BM','BPI','cargo',2000.00,386280.95,'retiro'),
  ('2026-01-09','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,383280.95,'retiro'),
  ('2026-01-09','TRAN.CTAS.TERC.BM','BPI','cargo',3600.00,379680.95,'retiro'),
  ('2026-01-09','IMPUESTO ITF','INT','cargo',0.40,379680.55,'comision'),
  ('2026-01-10','RETIRO EFECTIVO','CAJ','cargo',1900.00,377780.55,'retiro'),
  ('2026-01-11','IMPUESTO ITF','INT','cargo',0.05,377780.50,'comision'),
  ('2026-01-15','MANT TD ADIC NEG','INT','cargo',10.00,377770.50,'comision'),
  ('2026-01-17','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,374770.50,'retiro'),
  ('2026-01-18','IMPUESTO ITF','INT','cargo',0.15,374770.35,'comision'),
  ('2026-01-19','RETIRO EFECTIVO','CAJ','cargo',4000.00,370770.35,'retiro'),
  ('2026-01-19','IMPUESTO ITF','INT','cargo',0.20,370770.15,'comision'),
  ('2026-01-20','TRAN.CTAS.TERC.BM','BPI','cargo',3600.00,367170.15,'retiro'),
  ('2026-01-20','TRAN.CTAS.TERC.BM','BPI','cargo',4000.00,363170.15,'retiro'),
  ('2026-01-20','IMPUESTO ITF','INT','cargo',0.35,363169.80,'comision'),
  ('2026-01-21','TRAN.CTAS.TERC.BM','BPI','cargo',6000.00,357169.80,'retiro'),
  ('2026-01-21','IMPUESTO ITF','INT','cargo',0.30,357169.50,'comision'),
  ('2026-01-28','TRAN.CTAS.TERC.BM','BPI','cargo',1065.00,356104.50,'retiro'),
  ('2026-01-28','TRAN.CTAS.TERC.BM','BPI','cargo',1500.00,354604.50,'retiro'),
  ('2026-01-28','RETIRO EFECTIVO','CAJ','cargo',4000.00,350604.50,'retiro'),
  ('2026-01-28','IMPUESTO ITF','INT','cargo',0.30,350604.20,'comision'),
  ('2026-01-29','TRAN.CTAS.TERC.BM','BPI','cargo',8290.00,342314.20,'retiro'),
  ('2026-01-29','IMPUESTO ITF','INT','cargo',0.40,342313.80,'comision'),
  ('2026-01-30','TRAN.CTAS.TERC.BM','BPI','cargo',880.00,341433.80,'retiro'),
  ('2026-01-30','TRAN.CTAS.TERC.BM','BPI','cargo',2500.00,338933.80,'retiro'),
  ('2026-01-30','IMPUESTO ITF','INT','cargo',0.10,338933.70,'comision'),
  ('2026-01-31','ENVIO.EST.CTA','INT','cargo',5.50,338928.20,'comision'),
  ('2026-01-31','INTERESES DEUDORES','INT','cargo',0.07,338928.13,'interes'),
  ('2026-01-31','COM.MANTENIM','INT','cargo',35.00,338893.13,'comision'),
  ('2026-02-02','TRAN.CTAS.TERC.BM','BPI','cargo',2790.00,336103.13,'retiro'),
  ('2026-02-02','TRAN.CTAS.TERC.BM','BPI','cargo',10000.00,326103.13,'retiro'),
  ('2026-02-02','PORTE EXTRACTO NUMER','INT','cargo',3.50,326099.63,'comision'),
  ('2026-02-02','IMPUESTO ITF','INT','cargo',0.60,326099.03,'comision'),
  ('2026-02-03','TRAN.CTAS.TERC.BM','BPI','cargo',4000.00,322099.03,'retiro'),
  ('2026-02-03','TRAN.CTAS.TERC.BM','BPI','cargo',5000.00,317099.03,'retiro'),
  ('2026-02-03','IMPUESTO ITF','INT','cargo',0.45,317098.58,'comision'),
  ('2026-02-07','TRAN.CTAS.TERC.BM','BPI','cargo',10000.00,307098.58,'retiro'),
  ('2026-02-07','TRAN.CTAS.TERC.BM','BPI','cargo',12980.12,294118.46,'retiro'),
  ('2026-02-08','IMPUESTO ITF','INT','cargo',1.10,294117.36,'comision'),
  ('2026-02-09','TRAN.CTAS.TERC.BM','BPI','cargo',300.00,293817.36,'retiro'),
  ('2026-02-16','MANT TD ADIC NEG','INT','cargo',10.00,293807.36,'comision'),
  ('2026-02-17','RETIRO EFECTIVO','CAJ','cargo',4000.00,289807.36,'retiro'),
  ('2026-02-17','IMPUESTO ITF','INT','cargo',0.20,289807.16,'comision'),
  ('2026-02-18','TRAN.CTAS.TERC.BM','BPI','cargo',2000.00,287807.16,'retiro'),
  ('2026-02-18','IMPUESTO ITF','INT','cargo',0.10,287807.06,'comision'),
  ('2026-02-20','TRAN.CTAS.TERC.BM','BPI','cargo',2500.00,285307.06,'retiro'),
  ('2026-02-20','IMPUESTO ITF','INT','cargo',0.10,285306.96,'comision'),
  ('2026-02-23','TRAN.CTAS.TERC.BM','BPI','cargo',2000.00,283306.96,'retiro'),
  ('2026-02-23','IMPUESTO ITF','INT','cargo',0.10,283306.86,'comision'),
  ('2026-02-24','TRAN.CTAS.TERC.BM','BPI','cargo',784.00,282522.86,'retiro'),
  ('2026-02-26','RETIRO EFECTIVO','CAJ','cargo',2500.00,280022.86,'retiro'),
  ('2026-02-26','IMPUESTO ITF','INT','cargo',0.10,280022.76,'comision'),
  ('2026-02-28','ENVIO.EST.CTA','INT','cargo',5.50,280017.26,'comision'),
  ('2026-02-28','COM.MANTENIM','INT','cargo',35.00,279982.26,'comision'),
  ('2026-03-02','RETIRO EFECTIVO','CAJ','cargo',4000.00,275982.26,'retiro'),
  ('2026-03-02','IMPUESTO ITF','INT','cargo',0.20,275982.06,'comision'),
  ('2026-03-07','RETIRO EFECTIVO','CAJ','cargo',4000.00,271982.06,'retiro'),
  ('2026-03-08','IMPUESTO ITF','INT','cargo',0.20,271981.86,'comision'),
  ('2026-03-09','TRAN.CTAS.TERC.BM','BPI','cargo',2070.00,269911.86,'retiro'),
  ('2026-03-09','TRAN.CTAS.TERC.BM','BPI','cargo',2780.00,267131.86,'retiro'),
  ('2026-03-09','IMPUESTO ITF','INT','cargo',0.20,267131.66,'comision'),
  ('2026-03-10','TRAN.CTAS.TERC.BM','BPI','cargo',950.00,266181.66,'retiro'),
  ('2026-03-10','TRAN.CTAS.TERC.BM','BPI','cargo',6750.00,259431.66,'retiro'),
  ('2026-03-10','IMPUESTO ITF','INT','cargo',0.30,259431.36,'comision'),
  ('2026-03-12','TRAN.CTAS.TERC.BM','BPI','cargo',1100.00,258331.36,'retiro'),
  ('2026-03-12','TRAN.CTAS.TERC.BM','BPI','cargo',1600.00,256731.36,'retiro'),
  ('2026-03-12','IMPUESTO ITF','INT','cargo',0.10,256731.26,'comision'),
  ('2026-03-13','TRAN.CTAS.TERC.BM','BPI','cargo',10000.00,246731.26,'retiro'),
  ('2026-03-13','IMPUESTO ITF','INT','cargo',0.50,246730.76,'comision'),
  ('2026-03-16','TRAN.CTAS.TERC.BM','BPI','cargo',1500.00,245230.76,'retiro'),
  ('2026-03-16','RETIRO EFECTIVO','CAJ','cargo',1500.00,243730.76,'retiro'),
  ('2026-03-16','MANT TD ADIC NEG','INT','cargo',10.00,243720.76,'comision'),
  ('2026-03-16','IMPUESTO ITF','INT','cargo',0.10,243720.66,'comision'),
  ('2026-03-17','HONOR CUSCO','POS','cargo',1099.00,242621.66,'retiro'),
  ('2026-03-17','RETIRO EFECTIVO','CAJ','cargo',1500.00,241121.66,'retiro'),
  ('2026-03-17','IMPUESTO ITF','INT','cargo',0.10,241121.56,'comision'),
  ('2026-03-20','RETIRO EFECTIVO','CAJ','cargo',2500.00,238621.56,'retiro'),
  ('2026-03-20','IMPUESTO ITF','INT','cargo',0.10,238621.46,'comision'),
  ('2026-03-26','RETIRO EFECTIVO','CAJ','cargo',1000.00,237621.46,'retiro'),
  ('2026-03-26','IMPUESTO ITF','INT','cargo',0.05,237621.41,'comision'),
  ('2026-03-28','TRAN.CTAS.TERC.BM','BPI','cargo',2000.00,235621.41,'retiro'),
  ('2026-03-29','IMPUESTO ITF','INT','cargo',0.10,235621.31,'comision'),
  ('2026-03-30','RETIRO EFECTIVO','CAJ','cargo',1500.00,234121.31,'retiro'),
  ('2026-03-30','RETIRO EFECTIVO','CAJ','cargo',1500.00,232621.31,'retiro'),
  ('2026-03-30','IMPUESTO ITF','INT','cargo',0.10,232621.21,'comision'),
  ('2026-03-31','ENVIO.EST.CTA','INT','cargo',5.50,232615.71,'comision'),
  ('2026-03-31','COM.MANTENIM','INT','cargo',35.00,232580.71,'comision'),
  ('2026-04-01','RETIRO EFECTIVO','CAJ','cargo',1500.00,231080.71,'retiro'),
  ('2026-04-01','TRAN.CTAS.TERC.BM','BPI','cargo',2780.00,228300.71,'retiro'),
  ('2026-04-01','TRAN.CTAS.TERC.BM','BPI','cargo',9000.00,219300.71,'retiro'),
  ('2026-04-03','IMPUESTO ITF','INT','cargo',0.60,219300.11,'comision'),
  ('2026-04-04','TRAN.CTAS.TERC.BM','BPI','cargo',1700.00,217600.11,'retiro'),
  ('2026-04-04','RETIRO EFECTIVO','CAJ','cargo',2000.00,215600.11,'retiro'),
  ('2026-04-05','IMPUESTO ITF','INT','cargo',0.15,215599.96,'comision'),
  ('2026-04-08','RETIRO EFECTIVO','CAJ','cargo',3000.00,212599.96,'retiro'),
  ('2026-04-08','IMPUESTO ITF','INT','cargo',0.15,212599.81,'comision'),
  ('2026-04-10','TRAN.CTAS.TERC.BM','BPI','cargo',1500.00,211099.81,'retiro'),
  ('2026-04-10','RETIRO EFECTIVO','CAJ','cargo',1500.00,209599.81,'retiro'),
  ('2026-04-10','IMPUESTO ITF','INT','cargo',0.10,209599.71,'comision'),
  ('2026-04-11','TRAN.CTAS.TERC.BM','BPI','cargo',100.00,209499.71,'retiro'),
  ('2026-04-11','PROMART SAN JERONIMO','POS','cargo',3134.60,206365.11,'retiro'),
  ('2026-04-12','IMPUESTO ITF','INT','cargo',0.15,206364.96,'comision'),
  ('2026-04-13','TRAN.CTAS.TERC.BM','BPI','cargo',435.00,205929.96,'retiro'),
  ('2026-04-14','RETIRO EFECTIVO','CAJ','cargo',1500.00,204429.96,'retiro'),
  ('2026-04-14','IMPUESTO ITF','INT','cargo',0.05,204429.91,'comision'),
  ('2026-04-15','TRAN.CTAS.TERC.BM','BPI','cargo',160.00,204269.91,'retiro'),
  ('2026-04-15','TRANSF.BCO.BBVA','BPI','cargo',1913.50,202356.41,'retiro'),
  ('2026-04-15','MANT TD ADIC NEG','INT','cargo',10.00,202346.41,'comision'),
  ('2026-04-15','IMPUESTO ITF','INT','cargo',0.05,202346.36,'comision'),
  ('2026-04-18','RETIRO EFECTIVO','CAJ','cargo',1500.00,200846.36,'retiro'),
  ('2026-04-19','IMPUESTO ITF','INT','cargo',0.05,200846.31,'comision'),
  ('2026-04-20','TRAN.CTAS.TERC.BM','BPI','cargo',1356.00,199490.31,'retiro'),
  ('2026-04-20','IMPUESTO ITF','INT','cargo',0.05,199490.26,'comision'),
  ('2026-04-22','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,196490.26,'retiro'),
  ('2026-04-22','IMPUESTO ITF','INT','cargo',0.15,196490.11,'comision'),
  ('2026-04-27','RETIRO EFECTIVO','CAJ','cargo',4000.00,192490.11,'retiro'),
  ('2026-04-27','IMPUESTO ITF','INT','cargo',0.20,192489.91,'comision'),
  ('2026-04-28','RETIRO EFECTIVO','CAJ','cargo',3000.00,189489.91,'retiro'),
  ('2026-04-28','IMPUESTO ITF','INT','cargo',0.15,189489.76,'comision'),
  ('2026-04-29','TRAN.CTAS.TERC.BM','BPI','cargo',2300.00,187189.76,'retiro'),
  ('2026-04-29','TRAN.CTAS.TERC.BM','BPI','cargo',6000.00,181189.76,'retiro'),
  ('2026-04-29','IMPUESTO ITF','INT','cargo',0.40,181189.36,'comision'),
  ('2026-04-30','ENVIO.EST.CTA','INT','cargo',5.50,181183.86,'comision'),
  ('2026-04-30','COM.MANTENIM','INT','cargo',35.00,181148.86,'comision'),
  ('2026-05-02','TRAN.CTAS.TERC.BM','BPI','cargo',2000.00,179148.86,'retiro'),
  ('2026-05-03','IMPUESTO ITF','INT','cargo',0.10,179148.76,'comision'),
  ('2026-05-05','RETIRO EFECTIVO','CAJ','cargo',2000.00,177148.76,'retiro'),
  ('2026-05-05','IMPUESTO ITF','INT','cargo',0.10,177148.66,'comision'),
  ('2026-05-08','RETIRO EFECTIVO','CAJ','cargo',1500.00,175648.66,'retiro'),
  ('2026-05-08','TRAN.CTAS.TERC.BM','BPI','cargo',3452.00,172196.66,'retiro'),
  ('2026-05-08','IMPUESTO ITF','INT','cargo',0.20,172196.46,'comision'),
  ('2026-05-11','TRAN.CTAS.TERC.BM','BPI','cargo',1000.00,171196.46,'retiro'),
  ('2026-05-11','TRAN.CTAS.TERC.BM','BPI','cargo',9000.00,162196.46,'retiro'),
  ('2026-05-11','IMPUESTO ITF','INT','cargo',0.50,162195.96,'comision'),
  ('2026-05-13','TRAN.CTAS.TERC.BM','BPI','cargo',5000.00,157195.96,'retiro'),
  ('2026-05-13','IMPUESTO ITF','INT','cargo',0.25,157195.71,'comision'),
  ('2026-05-15','MANT TD ADIC NEG','INT','cargo',10.00,157185.71,'comision'),
  ('2026-05-21','RETIRO EFECTIVO','CAJ','cargo',4000.00,153185.71,'retiro'),
  ('2026-05-21','IMPUESTO ITF','INT','cargo',0.20,153185.51,'comision'),
  ('2026-05-23','RETIRO EFECTIVO','CAJ','cargo',1500.00,151685.51,'retiro'),
  ('2026-05-24','IMPUESTO ITF','INT','cargo',0.05,151685.46,'comision'),
  ('2026-05-29','RETIRO EFECTIVO','CAJ','cargo',1500.00,150185.46,'retiro'),
  ('2026-05-29','IMPUESTO ITF','INT','cargo',0.05,150185.41,'comision'),
  ('2026-05-31','TRANSF.BCO.INTERBANK','BPI','cargo',1411.00,148774.41,'retiro'),
  ('2026-05-30','ENVIO.EST.CTA','INT','cargo',5.50,148768.91,'comision'),
  ('2026-05-30','COM.MANTENIM','INT','cargo',35.00,148733.91,'comision'),
  ('2026-05-31','IMPUESTO ITF','INT','cargo',0.05,148733.86,'comision'),
  ('2026-06-01','RETIRO EFECTIVO','CAJ','cargo',3000.00,145733.86,'retiro'),
  ('2026-06-01','IMPUESTO ITF','INT','cargo',0.15,145733.71,'comision'),
  ('2026-06-02','TRAN.CTAS.TERC.BM','BPI','cargo',2550.00,143183.71,'retiro'),
  ('2026-06-02','RETIRO EFECTIVO','CAJ','cargo',4000.00,139183.71,'retiro'),
  ('2026-06-02','IMPUESTO ITF','INT','cargo',0.30,139183.41,'comision'),
  ('2026-06-04','TRAN.CTAS.TERC.BM','BPI','cargo',600.00,138583.41,'retiro'),
  ('2026-06-04','TRAN.CTAS.TERC.BM','BPI','cargo',2550.00,136033.41,'retiro'),
  ('2026-06-04','IMPUESTO ITF','INT','cargo',0.10,136033.31,'comision'),
  ('2026-06-05','TRAN.CTAS.TERC.BM','BPI','cargo',133.00,135900.31,'retiro'),
  ('2026-06-06','RETIRO EFECTIVO','CAJ','cargo',3000.00,132900.31,'retiro'),
  ('2026-06-07','IMPUESTO ITF','INT','cargo',0.15,132900.16,'comision'),
  ('2026-06-09','TRAN.CTAS.TERC.BM','BPI','cargo',500.00,132400.16,'retiro'),
  ('2026-06-12','TRAN.CTAS.TERC.BM','BPI','cargo',500.00,131900.16,'retiro'),
  ('2026-06-12','RETIRO EFECTIVO','CAJ','cargo',1500.00,130400.16,'retiro'),
  ('2026-06-12','IMPUESTO ITF','INT','cargo',0.05,130400.11,'comision'),
  ('2026-06-13','TRAN.CTAS.TERC.BM','BPI','cargo',6000.00,124400.11,'retiro'),
  ('2026-06-13','TRAN.CTAS.TERC.BM','BPI','cargo',9000.00,115400.11,'retiro'),
  ('2026-06-14','IMPUESTO ITF','INT','cargo',0.75,115399.36,'comision'),
  ('2026-06-15','MANT TD ADIC NEG','INT','cargo',10.00,115389.36,'comision'),
  ('2026-06-17','RETIRO EFECTIVO','CAJ','cargo',900.00,114489.36,'retiro'),
  ('2026-06-17','RETIRO EFECTIVO','CAJ','cargo',1500.00,112989.36,'retiro'),
  ('2026-06-17','IMPUESTO ITF','INT','cargo',0.05,112989.31,'comision'),
  ('2026-06-20','TRAN.CTAS.TERC.BM','BPI','cargo',600.00,112389.31,'retiro'),
  ('2026-06-22','RETIRO EFECTIVO','CAJ','cargo',1500.00,110889.31,'retiro'),
  ('2026-06-22','IMPUESTO ITF','INT','cargo',0.05,110889.26,'comision'),
  ('2026-06-30','ENVIO.EST.CTA','INT','cargo',5.50,110883.76,'comision'),
  ('2026-06-30','COM.MANTENIM','INT','cargo',35.00,110848.76,'comision')
       ) as v(fecha, glosa, medio, tipo, monto, saldo, categoria)
on conflict do nothing;

-- ------------------------------------------------------------
-- 4 · VERIFICAR — la cadena de saldos, ya dentro de la base
--     `salto` tiene que ser null en la primera fila y 0.00 en las otras cinco.
--     Cualquier otra cosa significa que falta un estado o que un saldo entro
--     mal.
-- ------------------------------------------------------------
select e.periodo, e.saldo, e.intereses,
       e.saldo - lag(e.saldo) over (order by e.periodo) as variacion,
       coalesce(m.cargos, 0) as movimientos_del_mes,
       e.saldo - (lag(e.saldo) over (order by e.periodo) - coalesce(m.cargos,0) + coalesce(m.abonos,0)) as salto
  from estado_cuenta e
  join postulaciones p on p.id = e.postulacion_id
  left join lateral (
    select sum(monto) filter (where tipo='cargo') as cargos,
           sum(monto) filter (where tipo='abono') as abonos
      from movimiento_banco b
     where b.postulacion_id = e.postulacion_id
       and b.fecha >= e.periodo
       and b.fecha <  (e.periodo + interval '1 month')) m on true
 where p.codigo = 'PO-001'
 order by e.periodo;

-- ------------------------------------------------------------
-- 4b · LOS MOVIMIENTOS POR CATEGORIA
--      Tiene que dar: desembolso 1 / 400,000.00 · retiro 99 / 288,801.22 ·
--      comision 80 / 339.45 · interes 1 / 0.07. Total 181 filas.
--      Si el total no es 181, se perdio alguna por la clave unica.
-- ------------------------------------------------------------
select b.categoria, count(*) as movs, sum(b.monto) as total
  from movimiento_banco b
  join postulaciones p on p.id = b.postulacion_id
 where p.codigo = 'PO-001'
 group by b.categoria
 order by sum(b.monto) desc;

-- ------------------------------------------------------------
-- 4c · EL CUADRE DEL SEMESTRE
--      saldo inicial (-10.50) + desembolso - salidas = saldo al 30/06/2026.
--      `descuadre` tiene que dar 0.00.
-- ------------------------------------------------------------
select -10.50 as saldo_al_01_01_2026,
       sum(b.monto) filter (where b.tipo = 'abono') as entradas,
       sum(b.monto) filter (where b.tipo = 'cargo') as salidas,
       -10.50 + sum(b.monto) filter (where b.tipo='abono')
              - sum(b.monto) filter (where b.tipo='cargo') as saldo_calculado,
       (select saldo from estado_cuenta e2 where e2.postulacion_id = p.id
         order by e2.periodo desc limit 1) as saldo_del_estado,
       -10.50 + sum(b.monto) filter (where b.tipo='abono')
              - sum(b.monto) filter (where b.tipo='cargo')
              - (select saldo from estado_cuenta e2 where e2.postulacion_id = p.id
                  order by e2.periodo desc limit 1) as descuadre
  from movimiento_banco b
  join postulaciones p on p.id = b.postulacion_id
 where p.codigo = 'PO-001'
 group by p.id;
