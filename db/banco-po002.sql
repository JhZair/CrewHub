-- ============================================================
--  db/banco-po002.sql — ESTADOS DE CUENTA Y MOVIMIENTOS · PO-002
--  Linderaje: Raices de Armonia · KAWSAYPACHATV E.I.R.L.
--  Cuenta corriente BCP 285-7097563-0-40 (soles) — la cuenta exclusiva que
--  exige la clausula 6.1 del acta 178-2024-DAFO.
--
--  Diez estados mensuales: diciembre 2024 a septiembre 2025. 207 movimientos.
--
--  ── DE DONDE SALEN LOS NUMEROS ──
--  De EstadosCuentaLinderaje.pdf, los diez estados del banco en un solo
--  archivo. Trae capa de texto: no hubo OCR ni transcripcion a mano. Se
--  parseo y se genero este archivo.
--
--  ── LAS TRES COMPROBACIONES QUE YA PASARON, EN LOS DIEZ MESES ──
--  1. La formula del propio banco (A+B+C-D-E+F-G=H).
--  2. El saldo de cierre de cada mes es el de apertura del siguiente, sin
--     saltos: eso prueba que no falta ningun estado en medio.
--  3. Fila a fila: la suma de los movimientos coincide con el resumen del mes
--     y el saldo corrido cuadra movimiento a movimiento. Esta encontro que se
--     estaba perdiendo una fila en julio (ver abajo).
--  Y el cuadre del periodo entero: -20.50 + 340,200.00 - 339,564.98 = 614.52,
--  que es el saldo del ultimo estado.
--
--  ── LA CLAVE UNICA CON `saldo` NO ERA UN LUJO ──
--  Aqui hay CUATRO pares de movimientos identicos en fecha, glosa, monto y
--  tipo: dos transferencias de S/ 6,900.00 el 15/01, dos de S/ 3,000.00 el
--  31/05, dos retiros de S/ 1,500.00 el 04/07 y dos de S/ 2,000.00 el 21/07.
--  Todos reales —minutos de diferencia, operaciones consecutivas—. Con la
--  clave anterior el `on conflict do nothing` habria cargado uno de cada par y
--  el fondo cuadraria S/ 13,400.00 de menos, sin dar ningun error. Con `saldo`
--  en la clave (db/banco-po001.sql, paso 1) las 207 filas son unicas.
--  El paso 1 se repite aqui por si este archivo se corre en una base donde
--  aquel no paso: es `if not exists`, asi que no molesta.
--
--  ── UNA FILA QUE COSTO ENCONTRAR ──
--  El 08/07/2025 hay una transferencia cuya glosa —«TRANSF.BCO.CAJA CMAC A»—
--  llena el campo de descripcion entero y deja UN solo espacio antes del medio
--  de atencion. El parseo pedia dos y se comia la fila: julio cuadraba
--  S/ 404.80 de menos. Se arreglo anclando el medio a la lista que el propio
--  estado declara en su leyenda (VEN, CAJ, POS, TLC, INT, BPT, BPI) en vez de
--  aceptar tres mayusculas cualesquiera.
--
--  ── QUE SE GUARDA EN `intereses` ──
--  Los ACREEDORES (los que gana el fondo): 0.00 en los diez meses. El unico
--  interes del periodo es un DEUDOR de S/ 0.83 en diciembre, que es un cargo
--  del banco y no un rendimiento; sumarlo ahi inflaria lo que hay que reportar
--  ante DAFO. Va en la nota del mes.
--
--  ── LO QUE ESTE ARCHIVO NO HACE ──
--  · No sube los PDF: `url` queda en null.
--  · No ata ningun movimiento a su RHE (`rhe_id` en null). Por la clausula 6.1
--    TODO retiro es gasto directo del proyecto, asi que los 109 retiros de
--    este periodo —S/ 339,043.35— habra que atarlos uno a uno desde /fondo.
--  · No toca `fecha_desembolso`: ya esta en 24/12/2024 y el estado de
--    diciembre la confirma.
--
--  Correr en: Supabase -> SQL Editor. De arriba abajo, nada que descomentar.
--  Idempotente: correrlo dos veces no duplica nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · LA CLAVE UNICA QUE ADMITE MOVIMIENTOS GEMELOS
-- ------------------------------------------------------------
alter table movimiento_banco
  drop constraint if exists movimiento_banco_postulacion_id_fecha_glosa_monto_tipo_key;

create unique index if not exists uq_movbanco_fila
  on movimiento_banco (postulacion_id, fecha, glosa, monto, tipo, saldo);

-- ------------------------------------------------------------
-- 2 · LOS DIEZ ESTADOS MENSUALES
-- ------------------------------------------------------------
insert into estado_cuenta (postulacion_id, periodo, saldo, intereses, nota)
select po.id, v.periodo::date, v.saldo, v.intereses, v.nota
  from (select id from postulaciones where codigo = 'PO-002') po,
       (values

  ('2024-12-01', 340121.17, 0.00, 'Desembolso del estimulo: S/ 340,200.00 el 24/12/2024 por ventanilla (SUC LIMA, origen Banco de la Nacion). Es la fecha desde la que corre el plazo de dos anios del acta 178-2024-DAFO. El mes abre en S/ -20.50: la cuenta ya existia antes del estimulo. Intereses deudores del mes: S/ 0.83 (cargo del banco, no rendimiento).'),
  ('2025-01-01', 290091.87, 0.00, null),
  ('2025-02-01', 278240.87, 0.00, null),
  ('2025-03-01', 217187.32, 0.00, null),
  ('2025-04-01', 172517.27, 0.00, null),
  ('2025-05-01', 119865.22, 0.00, null),
  ('2025-06-01', 75387.22, 0.00, null),
  ('2025-07-01', 33643.57, 0.00, 'Incluye una transferencia a CMAC del 08/07 cuya glosa llena el campo entero (TRANSF.BCO.CAJA CMAC A): se lee bien, pero es la fila que obligo a anclar el medio a la lista del banco al parsear.'),
  ('2025-08-01', 6965.32, 0.00, null),
  ('2025-09-01', 614.52, 0.00, 'Ultimo estado cargado. La cuenta queda en S/ 614.52: se ejecuto el 99.8% del estimulo.')
       ) as v(periodo, saldo, intereses, nota)
on conflict (postulacion_id, periodo) do nothing;

-- ------------------------------------------------------------
-- 3 · LOS 207 MOVIMIENTOS
--     `categoria` sale de la glosa del banco:
--       desembolso   1 · S/ 340,200.00   retiro   109 · S/ 339,043.35
--       comision    96 · S/     520.80   interes    1 · S/       0.83
-- ------------------------------------------------------------
insert into movimiento_banco (postulacion_id, fecha, glosa, medio, tipo, monto, saldo, categoria)
select po.id, v.fecha::date, v.glosa, v.medio, v.tipo, v.monto, v.saldo, v.categoria
  from (select id from postulaciones where codigo = 'PO-002') po,
       (values

  ('2024-12-24','BCO.NACI0000','VEN','abono',340200.00,340179.50,'desembolso'),
  ('2024-12-25','IMPUESTO ITF','INT','cargo',17.00,340162.50,'comision'),
  ('2024-12-31','ENVIO.EST.CTA','INT','cargo',5.50,340157.00,'comision'),
  ('2024-12-31','INTERESES DEUDORES','INT','cargo',0.83,340156.17,'interes'),
  ('2024-12-31','COM.MANTENIM','INT','cargo',35.00,340121.17,'comision'),
  ('2025-01-02','PORTE EXTRACTO NUMER','INT','cargo',3.50,340117.67,'comision'),
  ('2025-01-15','TRAN.CTAS.TERC.BM','BPI','cargo',6900.00,333217.67,'retiro'),
  ('2025-01-15','TRAN.CTAS.TERC.BM','BPI','cargo',6900.00,326317.67,'retiro'),
  ('2025-01-15','IMPUESTO ITF','INT','cargo',0.60,326317.07,'comision'),
  ('2025-01-16','TRAN.CTAS.TERC.BM','BPI','cargo',6000.00,320317.07,'retiro'),
  ('2025-01-16','TRANSF.BCO.BBVA','BPI','cargo',12064.00,308253.07,'retiro'),
  ('2025-01-16','IMPUESTO ITF','INT','cargo',0.90,308252.17,'comision'),
  ('2025-01-17','TRAN.CTAS.TERC.BM','BPI','cargo',2300.00,305952.17,'retiro'),
  ('2025-01-17','TRAN.CTAS.TERC.BM','BPI','cargo',4900.00,301052.17,'retiro'),
  ('2025-01-17','IMPUESTO ITF','INT','cargo',0.30,301051.87,'comision'),
  ('2025-01-24','RETIRO EFECTIVO','CAJ','cargo',3900.00,297151.87,'retiro'),
  ('2025-01-24','IMPUESTO ITF','INT','cargo',0.15,297151.72,'comision'),
  ('2025-01-27','TRANSF.BCO.INTERBANK','BPI','cargo',3019.00,294132.72,'retiro'),
  ('2025-01-27','TRAN.CTAS.TERC.BM','BPI','cargo',4000.00,290132.72,'retiro'),
  ('2025-01-27','IMPUESTO ITF','INT','cargo',0.35,290132.37,'comision'),
  ('2025-01-31','ENVIO.EST.CTA','INT','cargo',5.50,290126.87,'comision'),
  ('2025-01-31','COM.MANTENIM','INT','cargo',35.00,290091.87,'comision'),
  ('2025-02-15','TRAN.CTAS.TERC.BM','BPI','cargo',4900.00,285191.87,'retiro'),
  ('2025-02-16','IMPUESTO ITF','INT','cargo',0.20,285191.67,'comision'),
  ('2025-02-17','MANT TD ADIC NEG','INT','cargo',10.00,285181.67,'comision'),
  ('2025-02-20','TRAN.CTAS.TERC.BM','BPI','cargo',3900.00,281281.67,'retiro'),
  ('2025-02-20','IMPUESTO ITF','INT','cargo',0.15,281281.52,'comision'),
  ('2025-02-27','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,278281.52,'retiro'),
  ('2025-02-27','IMPUESTO ITF','INT','cargo',0.15,278281.37,'comision'),
  ('2025-02-28','ENVIO.EST.CTA','INT','cargo',5.50,278275.87,'comision'),
  ('2025-02-28','COM.MANTENIM','INT','cargo',35.00,278240.87,'comision'),
  ('2025-03-01','TRAN.CTAS.TERC.BM','BPI','cargo',10000.00,268240.87,'retiro'),
  ('2025-03-01','TRAN.CTAS.TERC.BM','BPI','cargo',14000.00,254240.87,'retiro'),
  ('2025-03-01','TRAN.CTAS.TERC.BM','BPI','cargo',15000.00,239240.87,'retiro'),
  ('2025-03-02','IMPUESTO ITF','INT','cargo',1.95,239238.92,'comision'),
  ('2025-03-17','MANT TD ADIC NEG','INT','cargo',10.00,239228.92,'comision'),
  ('2025-03-22','TRAN.CTAS.TERC.BM','BPI','cargo',10000.00,229228.92,'retiro'),
  ('2025-03-22','TRAN.CTAS.TERC.BM','BPI','cargo',12000.00,217228.92,'retiro'),
  ('2025-03-23','IMPUESTO ITF','INT','cargo',1.10,217227.82,'comision'),
  ('2025-03-31','ENVIO.EST.CTA','INT','cargo',5.50,217222.32,'comision'),
  ('2025-03-31','COM.MANTENIM','INT','cargo',35.00,217187.32,'comision'),
  ('2025-04-04','TRANSF.BCO.BBVA','BPI','cargo',1913.50,215273.82,'retiro'),
  ('2025-04-04','IMPUESTO ITF','INT','cargo',0.05,215273.77,'comision'),
  ('2025-04-05','TRAN.CTAS.TERC.BM','BPI','cargo',3900.00,211373.77,'retiro'),
  ('2025-04-06','IMPUESTO ITF','INT','cargo',0.15,211373.62,'comision'),
  ('2025-04-07','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,208373.62,'retiro'),
  ('2025-04-07','IMPUESTO ITF','INT','cargo',0.15,208373.47,'comision'),
  ('2025-04-08','TRAN.CTAS.TERC.BM','BPI','cargo',300.00,208073.47,'retiro'),
  ('2025-04-08','RETIRO EFECTIVO','CAJ','cargo',900.00,207173.47,'retiro'),
  ('2025-04-08','REPOSICION.DEBITO','INT','cargo',15.00,207158.47,'retiro'),
  ('2025-04-09','TRAN.CTAS.TERC.BM','BPI','cargo',10589.00,196569.47,'retiro'),
  ('2025-04-09','IMPUESTO ITF','INT','cargo',0.50,196568.97,'comision'),
  ('2025-04-10','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,193568.97,'retiro'),
  ('2025-04-10','IMPUESTO ITF','INT','cargo',0.15,193568.82,'comision'),
  ('2025-04-12','RETIRO EFECTIVO','CAJ','cargo',3000.00,190568.82,'retiro'),
  ('2025-04-13','IMPUESTO ITF','INT','cargo',0.15,190568.67,'comision'),
  ('2025-04-15','TRAN.CTAS.TERC.BM','BPI','cargo',4000.00,186568.67,'retiro'),
  ('2025-04-15','RETIRO EFECTIVO','CAJ','cargo',4000.00,182568.67,'retiro'),
  ('2025-04-15','MANT TD ADIC NEG','INT','cargo',10.00,182558.67,'comision'),
  ('2025-04-15','IMPUESTO ITF','INT','cargo',0.40,182558.27,'comision'),
  ('2025-04-21','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,179558.27,'retiro'),
  ('2025-04-21','IMPUESTO ITF','INT','cargo',0.15,179558.12,'comision'),
  ('2025-04-28','RETIRO EFECTIVO','CAJ','cargo',4000.00,175558.12,'retiro'),
  ('2025-04-28','IMPUESTO ITF','INT','cargo',0.20,175557.92,'comision'),
  ('2025-04-29','RETIRO EFECTIVO','CAJ','cargo',3000.00,172557.92,'retiro'),
  ('2025-04-29','IMPUESTO ITF','INT','cargo',0.15,172557.77,'comision'),
  ('2025-04-30','ENVIO.EST.CTA','INT','cargo',5.50,172552.27,'comision'),
  ('2025-04-30','COM.MANTENIM','INT','cargo',35.00,172517.27,'comision'),
  ('2025-05-03','TRAN.CTAS.TERC.BM','BPI','cargo',4000.00,168517.27,'retiro'),
  ('2025-05-04','IMPUESTO ITF','INT','cargo',0.20,168517.07,'comision'),
  ('2025-05-06','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,165517.07,'retiro'),
  ('2025-05-06','RETIRO EFECTIVO','CAJ','cargo',3400.00,162117.07,'retiro'),
  ('2025-05-06','IMPUESTO ITF','INT','cargo',0.30,162116.77,'comision'),
  ('2025-05-08','RETIRO EFECTIVO','CAJ','cargo',4000.00,158116.77,'retiro'),
  ('2025-05-08','TRAN.CTAS.TERC.BM','BPI','cargo',5000.00,153116.77,'retiro'),
  ('2025-05-08','IMPUESTO ITF','INT','cargo',0.45,153116.32,'comision'),
  ('2025-05-09','RETIRO EFECTIVO','CAJ','cargo',4000.00,149116.32,'retiro'),
  ('2025-05-09','IMPUESTO ITF','INT','cargo',0.20,149116.12,'comision'),
  ('2025-05-15','RETIRO EFECTIVO','CAJ','cargo',4000.00,145116.12,'retiro'),
  ('2025-05-15','MANT TD ADIC NEG','INT','cargo',10.00,145106.12,'comision'),
  ('2025-05-15','IMPUESTO ITF','INT','cargo',0.20,145105.92,'comision'),
  ('2025-05-19','RETIRO EFECTIVO','CAJ','cargo',4000.00,141105.92,'retiro'),
  ('2025-05-19','IMPUESTO ITF','INT','cargo',0.20,141105.72,'comision'),
  ('2025-05-23','RETIRO EFECTIVO','CAJ','cargo',4000.00,137105.72,'retiro'),
  ('2025-05-23','IMPUESTO ITF','INT','cargo',0.20,137105.52,'comision'),
  ('2025-05-27','RETIRO EFECTIVO','CAJ','cargo',4000.00,133105.52,'retiro'),
  ('2025-05-27','IMPUESTO ITF','INT','cargo',0.20,133105.32,'comision'),
  ('2025-05-29','RETIRO EFECTIVO','CAJ','cargo',1500.00,131605.32,'retiro'),
  ('2025-05-29','IMPUESTO ITF','INT','cargo',0.05,131605.27,'comision'),
  ('2025-05-31','TRAN.CTAS.TERC.BM','BPI','cargo',1699.00,129906.27,'retiro'),
  ('2025-05-31','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,126906.27,'retiro'),
  ('2025-05-31','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,123906.27,'retiro'),
  ('2025-05-31','RETIRO EFECTIVO','CAJ','cargo',4000.00,119906.27,'retiro'),
  ('2025-05-31','ENVIO.EST.CTA','INT','cargo',5.50,119900.77,'comision'),
  ('2025-05-31','COM.MANTENIM','INT','cargo',35.00,119865.77,'comision'),
  ('2025-05-31','IMPUESTO ITF','INT','cargo',0.55,119865.22,'comision'),
  ('2025-06-03','RETIRO EFECTIVO','CAJ','cargo',4000.00,115865.22,'retiro'),
  ('2025-06-03','IMPUESTO ITF','INT','cargo',0.20,115865.02,'comision'),
  ('2025-06-06','TRAN.CTAS.TERC.BM','BPI','cargo',10000.00,105865.02,'retiro'),
  ('2025-06-06','IMPUESTO ITF','INT','cargo',0.50,105864.52,'comision'),
  ('2025-06-10','RETIRO EFECTIVO','CAJ','cargo',4000.00,101864.52,'retiro'),
  ('2025-06-10','IMPUESTO ITF','INT','cargo',0.20,101864.32,'comision'),
  ('2025-06-13','TRAN.CTAS.TERC.BM','BPI','cargo',1268.50,100595.82,'retiro'),
  ('2025-06-13','IMPUESTO ITF','INT','cargo',0.05,100595.77,'comision'),
  ('2025-06-15','RETIRO EFECTIVO','CAJ','cargo',2500.00,98095.77,'retiro'),
  ('2025-06-14','RETIRO EFECTIVO','CAJ','cargo',3900.00,94195.77,'retiro'),
  ('2025-06-15','IMPUESTO ITF','INT','cargo',0.25,94195.52,'comision'),
  ('2025-06-16','MANT TD ADIC NEG','INT','cargo',10.00,94185.52,'comision'),
  ('2025-06-18','RETIRO EFECTIVO','CAJ','cargo',3000.00,91185.52,'retiro'),
  ('2025-06-18','IMPUESTO ITF','INT','cargo',0.15,91185.37,'comision'),
  ('2025-06-20','RETIRO EFECTIVO','CAJ','cargo',1000.00,90185.37,'retiro'),
  ('2025-06-20','TRAN.CTAS.TERC.BM','BPI','cargo',3357.00,86828.37,'retiro'),
  ('2025-06-20','IMPUESTO ITF','INT','cargo',0.20,86828.17,'comision'),
  ('2025-06-22','TRAN.CTAS.TERC.BM','BPI','cargo',2000.00,84828.17,'retiro'),
  ('2025-06-22','IMPUESTO ITF','INT','cargo',0.10,84828.07,'comision'),
  ('2025-06-23','RETIRO EFECTIVO','CAJ','cargo',2500.00,82328.07,'retiro'),
  ('2025-06-23','IMPUESTO ITF','INT','cargo',0.10,82327.97,'comision'),
  ('2025-06-26','TRAN.CTAS.TERC.BM','BPI','cargo',1500.00,80827.97,'retiro'),
  ('2025-06-26','IMPUESTO ITF','INT','cargo',0.05,80827.92,'comision'),
  ('2025-06-28','RETIRO EFECTIVO','CAJ','cargo',1500.00,79327.92,'retiro'),
  ('2025-06-28','RETIRO EFECTIVO','CAJ','cargo',2000.00,77327.92,'retiro'),
  ('2025-06-29','IMPUESTO ITF','INT','cargo',0.15,77327.77,'comision'),
  ('2025-06-30','RETIRO EFECTIVO','CAJ','cargo',400.00,76927.77,'retiro'),
  ('2025-06-30','RETIRO EFECTIVO','CAJ','cargo',1500.00,75427.77,'retiro'),
  ('2025-06-30','ENVIO.EST.CTA','INT','cargo',5.50,75422.27,'comision'),
  ('2025-06-30','COM.MANTENIM','INT','cargo',35.00,75387.27,'comision'),
  ('2025-06-30','IMPUESTO ITF','INT','cargo',0.05,75387.22,'comision'),
  ('2025-07-03','TRAN.CTAS.TERC.BM','BPI','cargo',330.00,75057.22,'retiro'),
  ('2025-07-03','RETIRO EFECTIVO','CAJ','cargo',1500.00,73557.22,'retiro'),
  ('2025-07-03','TRAN.CTAS.TERC.BM','BPI','cargo',2970.00,70587.22,'retiro'),
  ('2025-07-03','IMPUESTO ITF','INT','cargo',0.15,70587.07,'comision'),
  ('2025-07-04','RETIRO EFECTIVO','CAJ','cargo',1500.00,69087.07,'retiro'),
  ('2025-07-04','RETIRO EFECTIVO','CAJ','cargo',1500.00,67587.07,'retiro'),
  ('2025-07-04','IMPUESTO ITF','INT','cargo',0.10,67586.97,'comision'),
  ('2025-07-05','RETIRO EFECTIVO','CAJ','cargo',4000.00,63586.97,'retiro'),
  ('2025-07-06','IMPUESTO ITF','INT','cargo',0.20,63586.77,'comision'),
  ('2025-07-07','RETIRO EFECTIVO','CAJ','cargo',1500.00,62086.77,'retiro'),
  ('2025-07-07','IMPUESTO ITF','INT','cargo',0.05,62086.72,'comision'),
  ('2025-07-08','TRANSF.BCO.CAJA CMAC A','BPI','cargo',404.80,61681.92,'retiro'),
  ('2025-07-10','RETIRO EFECTIVO','CAJ','cargo',1500.00,60181.92,'retiro'),
  ('2025-07-10','RETIRO EFECTIVO','CAJ','cargo',2500.00,57681.92,'retiro'),
  ('2025-07-10','IMPUESTO ITF','INT','cargo',0.15,57681.77,'comision'),
  ('2025-07-11','TRAN.CTAS.TERC.BM','BPI','cargo',685.00,56996.77,'retiro'),
  ('2025-07-15','RETIRO EFECTIVO','CAJ','cargo',1500.00,55496.77,'retiro'),
  ('2025-07-15','MANT TD ADIC NEG','INT','cargo',10.00,55486.77,'comision'),
  ('2025-07-15','IMPUESTO ITF','INT','cargo',0.05,55486.72,'comision'),
  ('2025-07-16','TRAN.CTAS.TERC.BM','BPI','cargo',450.00,55036.72,'retiro'),
  ('2025-07-16','TRANSF.BCO.INTERBANK','BPI','cargo',1561.75,53474.97,'retiro'),
  ('2025-07-16','IMPUESTO ITF','INT','cargo',0.05,53474.92,'comision'),
  ('2025-07-17','RETIRO EFECTIVO','CAJ','cargo',4000.00,49474.92,'retiro'),
  ('2025-07-17','IMPUESTO ITF','INT','cargo',0.20,49474.72,'comision'),
  ('2025-07-19','TRAN.CTAS.TERC.BM','BPI','cargo',400.00,49074.72,'retiro'),
  ('2025-07-20','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,46074.72,'retiro'),
  ('2025-07-20','IMPUESTO ITF','INT','cargo',0.15,46074.57,'comision'),
  ('2025-07-21','RETIRO EFECTIVO','CAJ','cargo',2000.00,44074.57,'retiro'),
  ('2025-07-21','RETIRO EFECTIVO','CAJ','cargo',2000.00,42074.57,'retiro'),
  ('2025-07-21','IMPUESTO ITF','INT','cargo',0.20,42074.37,'comision'),
  ('2025-07-22','RETIRO EFECTIVO','CAJ','cargo',1500.00,40574.37,'retiro'),
  ('2025-07-23','IMPUESTO ITF','INT','cargo',0.05,40574.32,'comision'),
  ('2025-07-27','TRAN.CTAS.TERC.BM','BPI','cargo',720.00,39854.32,'retiro'),
  ('2025-07-26','RETIRO EFECTIVO','CAJ','cargo',3000.00,36854.32,'retiro'),
  ('2025-07-29','IMPUESTO ITF','INT','cargo',0.15,36854.17,'comision'),
  ('2025-07-30','RETIRO EFECTIVO','CAJ','cargo',1500.00,35354.17,'retiro'),
  ('2025-07-30','RETIRO EFECTIVO','CAJ','cargo',1670.00,33684.17,'retiro'),
  ('2025-07-30','IMPUESTO ITF','INT','cargo',0.10,33684.07,'comision'),
  ('2025-07-31','ENVIO.EST.CTA','INT','cargo',5.50,33678.57,'comision'),
  ('2025-07-31','COM.MANTENIM','INT','cargo',35.00,33643.57,'comision'),
  ('2025-08-02','TRAN.CTAS.TERC.BM','BPI','cargo',600.00,33043.57,'retiro'),
  ('2025-08-02','TRAN.CTAS.TERC.BM','BPI','cargo',900.00,32143.57,'retiro'),
  ('2025-08-02','RETIRO EFECTIVO','CAJ','cargo',1500.00,30643.57,'retiro'),
  ('2025-08-03','IMPUESTO ITF','INT','cargo',0.05,30643.52,'comision'),
  ('2025-08-04','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,27643.52,'retiro'),
  ('2025-08-04','IMPUESTO ITF','INT','cargo',0.15,27643.37,'comision'),
  ('2025-08-05','TRAN.CTAS.TERC.BM','BPI','cargo',1500.00,26143.37,'retiro'),
  ('2025-08-05','RETIRO EFECTIVO','CAJ','cargo',1500.00,24643.37,'retiro'),
  ('2025-08-06','IMPUESTO ITF','INT','cargo',0.10,24643.27,'comision'),
  ('2025-08-07','TRAN.CTAS.TERC.BM','BPI','cargo',350.00,24293.27,'retiro'),
  ('2025-08-07','TRAN.CTAS.TERC.BM','BPI','cargo',1307.00,22986.27,'retiro'),
  ('2025-08-07','TRAN.CTAS.TERC.BM','BPI','cargo',1500.00,21486.27,'retiro'),
  ('2025-08-07','TRANSF.BCO.INTERBANK','BPI','cargo',1719.80,19766.47,'retiro'),
  ('2025-08-07','IMPUESTO ITF','INT','cargo',0.15,19766.32,'comision'),
  ('2025-08-08','TRAN.CTAS.TERC.BM','BPI','cargo',300.00,19466.32,'retiro'),
  ('2025-08-08','TRAN.CTAS.TERC.BM','BPI','cargo',1000.00,18466.32,'retiro'),
  ('2025-08-08','IMPUESTO ITF','INT','cargo',0.05,18466.27,'comision'),
  ('2025-08-09','TRAN.CTAS.TERC.BM','BPI','cargo',400.00,18066.27,'retiro'),
  ('2025-08-11','RETIRO EFECTIVO','CAJ','cargo',1300.00,16766.27,'retiro'),
  ('2025-08-11','RETIRO EFECTIVO','CAJ','cargo',2000.00,14766.27,'retiro'),
  ('2025-08-11','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,11766.27,'retiro'),
  ('2025-08-11','IMPUESTO ITF','INT','cargo',0.30,11765.97,'comision'),
  ('2025-08-13','TRAN.CTAS.TERC.BM','BPI','cargo',250.00,11515.97,'retiro'),
  ('2025-08-15','RETIRO EFECTIVO','CAJ','cargo',1500.00,10015.97,'retiro'),
  ('2025-08-15','MANT TD ADIC NEG','INT','cargo',10.00,10005.97,'comision'),
  ('2025-08-15','IMPUESTO ITF','INT','cargo',0.05,10005.92,'comision'),
  ('2025-08-16','RETIRO EFECTIVO','CAJ','cargo',1500.00,8505.92,'retiro'),
  ('2025-08-17','IMPUESTO ITF','INT','cargo',0.05,8505.87,'comision'),
  ('2025-08-27','RETIRO EFECTIVO','CAJ','cargo',1500.00,7005.87,'retiro'),
  ('2025-08-27','IMPUESTO ITF','INT','cargo',0.05,7005.82,'comision'),
  ('2025-08-30','ENVIO.EST.CTA','INT','cargo',5.50,7000.32,'comision'),
  ('2025-08-30','COM.MANTENIM','INT','cargo',35.00,6965.32,'comision'),
  ('2025-09-01','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,3965.32,'retiro'),
  ('2025-09-01','IMPUESTO ITF','INT','cargo',0.15,3965.17,'comision'),
  ('2025-09-15','TRAN.CTAS.TERC.BM','BPI','cargo',300.00,3665.17,'retiro'),
  ('2025-09-15','TRAN.CTAS.TERC.BM','BPI','cargo',3000.00,665.17,'retiro'),
  ('2025-09-15','MANT TD ADIC NEG','INT','cargo',10.00,655.17,'comision'),
  ('2025-09-15','IMPUESTO ITF','INT','cargo',0.15,655.02,'comision'),
  ('2025-09-30','ENVIO.EST.CTA','INT','cargo',5.50,649.52,'comision'),
  ('2025-09-30','COM.MANTENIM','INT','cargo',35.00,614.52,'comision')
       ) as v(fecha, glosa, medio, tipo, monto, saldo, categoria)
on conflict do nothing;

-- ------------------------------------------------------------
-- 4 · VERIFICAR — la cadena de saldos, ya dentro de la base.
--     `salto` debe ser null en la primera fila y 0.00 en las otras nueve.
-- ------------------------------------------------------------
select e.periodo, e.saldo, e.intereses,
       coalesce(m.cargos, 0) as movimientos_del_mes,
       e.saldo - (lag(e.saldo) over (order by e.periodo) - coalesce(m.cargos,0) + coalesce(m.abonos,0)) as salto
  from estado_cuenta e
  join postulaciones p on p.id = e.postulacion_id
  left join lateral (
    select sum(monto) filter (where tipo='cargo') as cargos,
           sum(monto) filter (where tipo='abono') as abonos
      from movimiento_banco b
     where b.postulacion_id = e.postulacion_id
       and b.fecha >= e.periodo and b.fecha < (e.periodo + interval '1 month')) m on true
 where p.codigo = 'PO-002'
 order by e.periodo;

-- 4b · Por categoria. TOTAL 207: si sale menos, la clave unica se comio filas.
select b.categoria, count(*) as movs, sum(b.monto) as total
  from movimiento_banco b join postulaciones p on p.id = b.postulacion_id
 where p.codigo = 'PO-002' group by b.categoria order by sum(b.monto) desc;

-- 4c · Los cuatro pares gemelos: tienen que salir OCHO filas, no cuatro.
select b.fecha, b.glosa, b.monto, b.saldo
  from movimiento_banco b join postulaciones p on p.id = b.postulacion_id
 where p.codigo = 'PO-002'
   and (b.fecha, b.monto) in (('2025-01-15', 6900), ('2025-05-31', 3000),
                              ('2025-07-04', 1500), ('2025-07-21', 2000))
 order by b.fecha, b.saldo desc;

-- 4d · El cuadre del periodo. `descuadre` tiene que dar 0.00.
select -20.50 as saldo_al_01_12_2024,
       sum(b.monto) filter (where b.tipo='abono') as entradas,
       sum(b.monto) filter (where b.tipo='cargo') as salidas,
       -20.50 + sum(b.monto) filter (where b.tipo='abono')
              - sum(b.monto) filter (where b.tipo='cargo')
              - (select saldo from estado_cuenta e2 where e2.postulacion_id = p.id
                  order by e2.periodo desc limit 1) as descuadre
  from movimiento_banco b join postulaciones p on p.id = b.postulacion_id
 where p.codigo = 'PO-002' group by p.id;
