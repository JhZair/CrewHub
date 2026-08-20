-- ============================================================
--  db/sunat-2026.sql — CRONOGRAMA DE OBLIGACIONES MENSUALES 2026
--
--  Transcrito del cuadro OFICIAL de SUNAT:
--    ww3.sunat.gob.pe/cl-ti-itcronobligme/fvS01Alias · Ejercicio 2026
--
--  ── POR QUÉ ESTE ARCHIVO EXISTE Y NO SE DEDUJO ──
--  Antes de tener el cuadro oficial se encontró en internet una tabla que se
--  presenta como el cronograma 2026 y NO lo es: le daba al dígito 8 los
--  vencimientos más tempranos del mes (10 de febrero) cuando el oficial le da
--  los más tardíos (23 de febrero). Trece días de diferencia, y la diferencia
--  entre declarar a tiempo y una multa. Ninguna fecha de esta tabla se calcula:
--  todas se leen.
--
--  ── QUÉ ES `digito = -2` ──
--  Buenos Contribuyentes y UESP no son un dígito de RUC, son una categoría con
--  fecha propia (uno o dos días hábiles más). Se guardan con -2 para que estén
--  disponibles sin poder cruzarse jamás con el último dígito de un RUC real.
--  Hoy no lo usa nadie; el día que una empresa entre al padrón, el dato ya está.
--
--  ⚠ `mes` es el MES DEL PERIODO, no el del vencimiento: el periodo diciembre
--  2026 vence en enero de 2027 y va como (anio 2026, mes 12, '2027-01-xx').
--
--  Verificado al generarlo: ninguna fecha cae en sábado o domingo.
--  Idempotente. Al final verifica.
-- ============================================================

insert into vencimiento_oficial (clase, anio, mes, digito, fecha, fuente) values
  ('igv_renta', 2026,  1, 0, '2026-02-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 1, '2026-02-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 2, '2026-02-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 3, '2026-02-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 4, '2026-02-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 5, '2026-02-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 6, '2026-02-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 7, '2026-02-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 8, '2026-02-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, 9, '2026-02-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  1, -2, '2026-02-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  2, 0, '2026-03-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 1, '2026-03-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 2, '2026-03-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 3, '2026-03-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 4, '2026-03-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 5, '2026-03-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 6, '2026-03-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 7, '2026-03-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 8, '2026-03-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, 9, '2026-03-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  2, -2, '2026-03-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  3, 0, '2026-04-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 1, '2026-04-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 2, '2026-04-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 3, '2026-04-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 4, '2026-04-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 5, '2026-04-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 6, '2026-04-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 7, '2026-04-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 8, '2026-04-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, 9, '2026-04-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  3, -2, '2026-04-27', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  4, 0, '2026-05-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 1, '2026-05-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 2, '2026-05-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 3, '2026-05-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 4, '2026-05-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 5, '2026-05-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 6, '2026-05-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 7, '2026-05-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 8, '2026-05-25', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, 9, '2026-05-25', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  4, -2, '2026-05-26', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  5, 0, '2026-06-15', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 1, '2026-06-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 2, '2026-06-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 3, '2026-06-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 4, '2026-06-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 5, '2026-06-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 6, '2026-06-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 7, '2026-06-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 8, '2026-06-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, 9, '2026-06-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  5, -2, '2026-06-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  6, 0, '2026-07-15', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 1, '2026-07-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 2, '2026-07-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 3, '2026-07-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 4, '2026-07-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 5, '2026-07-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 6, '2026-07-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 7, '2026-07-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 8, '2026-07-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, 9, '2026-07-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  6, -2, '2026-07-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  7, 0, '2026-08-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 1, '2026-08-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 2, '2026-08-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 3, '2026-08-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 4, '2026-08-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 5, '2026-08-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 6, '2026-08-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 7, '2026-08-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 8, '2026-08-25', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, 9, '2026-08-25', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  7, -2, '2026-08-26', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  8, 0, '2026-09-15', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 1, '2026-09-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 2, '2026-09-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 3, '2026-09-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 4, '2026-09-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 5, '2026-09-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 6, '2026-09-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 7, '2026-09-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 8, '2026-09-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, 9, '2026-09-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  8, -2, '2026-09-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026,  9, 0, '2026-10-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 1, '2026-10-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 2, '2026-10-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 3, '2026-10-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 4, '2026-10-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 5, '2026-10-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 6, '2026-10-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 7, '2026-10-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 8, '2026-10-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, 9, '2026-10-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026,  9, -2, '2026-10-26', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026, 10, 0, '2026-11-16', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 1, '2026-11-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 2, '2026-11-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 3, '2026-11-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 4, '2026-11-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 5, '2026-11-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 6, '2026-11-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 7, '2026-11-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 8, '2026-11-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, 9, '2026-11-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 10, -2, '2026-11-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026, 11, 0, '2026-12-17', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 1, '2026-12-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 2, '2026-12-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 3, '2026-12-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 4, '2026-12-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 5, '2026-12-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 6, '2026-12-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 7, '2026-12-23', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 8, '2026-12-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, 9, '2026-12-24', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 11, -2, '2026-12-28', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP'),
  ('igv_renta', 2026, 12, 0, '2027-01-18', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 1, '2027-01-19', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 2, '2027-01-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 3, '2027-01-20', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 4, '2027-01-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 5, '2027-01-21', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 6, '2027-01-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 7, '2027-01-22', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 8, '2027-01-25', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, 9, '2027-01-25', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme)'),
  ('igv_renta', 2026, 12, -2, '2027-01-26', 'Cronograma SUNAT 2026 (ww3.sunat.gob.pe/cl-ti-itcronobligme) · BC/UESP')
on conflict (clase, anio, mes, digito) do nothing;

-- Rellena los periodos que ya existían sin fecha. No pisa los corregidos a mano.
select public.obligaciones_generar_todas() as periodos_nuevos;

-- ── VERIFICAR ──
select mes,
       max(fecha) filter (where digito = 0) as d0,
       max(fecha) filter (where digito = 8) as d8,
       max(fecha) filter (where digito = 9) as d9,
       max(fecha) filter (where digito = -2) as bc_uesp,
       count(*) as filas
  from vencimiento_oficial
 where clase = 'igv_renta' and anio = 2026
 group by mes order by mes;

-- Ninguna debería salir aquí: SUNAT no vence en fin de semana.
select anio, mes, digito, fecha, to_char(fecha, 'Day') as dia
  from vencimiento_oficial
 where anio = 2026 and extract(isodow from fecha) > 5;
