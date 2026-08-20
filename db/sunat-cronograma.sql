-- ============================================================
--  db/sunat-cronograma.sql — CARGAR UN AÑO DEL CALENDARIO DE SUNAT
--
--  Esta es la plantilla que se corre UNA VEZ AL AÑO, cuando SUNAT publica su
--  Resolución de Superintendencia con el cronograma de vencimientos.
--
--  ── POR QUÉ ESTO ES DATO Y NO CÓDIGO ──
--  Las fechas no siguen una fórmula: cada año SUNAT reordena los dígitos. En
--  2025 el dígito 8 de esta asociación vencía el 24 de cada mes; hay tablas
--  circulando por internet que para 2026 le ponen el 10. Una de las dos está
--  mal, y la equivocada no se nota — se cumple, y la multa llega después.
--  Por eso `fuente` no es decorativa: dice de dónde salió cada fecha.
--
--  ── DE DÓNDE SACARLAS ──
--  De la R.S. publicada en sunat.gob.pe, o del cuadro de
--  https://www.sunat.gob.pe/cronogramasunat/index.html
--  NO de un blog contable: se parecen mucho y no son lo mismo.
--
--  ── CÓMO USARLA ──
--  1. Copia el bloque de abajo.
--  2. Cambia el año y pon las fechas de la resolución.
--  3. Basta con cargar los dígitos de TUS empresas — no hace falta la tabla
--     entera. Si un dígito no está, sus periodos salen «sin fecha», que es
--     verdad, y se cargan cuando haga falta.
--  4. Al final, `obligaciones_generar_todas()` rellena los periodos que ya
--     existían sin fecha. No pisa ninguna corregida a mano.
--
--  ⚠ `mes` es el MES DEL PERIODO, no el del vencimiento. El periodo diciembre
--  2025 vence en enero de 2026: va como (anio 2025, mes 12, fecha 2026-01-xx).
--  Confundirlo es el error fácil de esta tabla y no da ningún aviso.
--
--  Idempotente: `on conflict do nothing`. Para CORREGIR una fecha ya cargada,
--  usa el bloque de rectificación del final.
-- ============================================================

-- ── EJEMPLO REAL: lo que ya está cargado (2025, dígito 8) ──
--    Salió de la tabla histórica del equipo, no de la resolución. Sirve de
--    modelo del formato y de recordatorio de que conviene cotejarlo.
--
--    ('igv_renta', 2025,  1, 8, '2025-02-24', '…'),   ← periodo enero 2025
--    ('igv_renta', 2025, 12, 8, '2026-01-23', '…'),   ← periodo diciembre 2025

-- ============================================================
--  PEGA AQUÍ EL AÑO NUEVO
-- ============================================================
insert into vencimiento_oficial (clase, anio, mes, digito, fecha, fuente) values
  -- clase        año  mes  díg  vence         de dónde salió
  -- ('igv_renta', 2026,  1,  8, '2026-02-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  2,  8, '2026-03-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  3,  8, '2026-04-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  4,  8, '2026-05-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  5,  8, '2026-06-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  6,  8, '2026-07-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  7,  8, '2026-08-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  8,  8, '2026-09-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026,  9,  8, '2026-10-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026, 10,  8, '2026-11-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026, 11,  8, '2026-12-XX', 'R.S. NNN-2025/SUNAT'),
  -- ('igv_renta', 2026, 12,  8, '2027-01-XX', 'R.S. NNN-2025/SUNAT'),
  -- ↑ descomenta y corrige. La línea de abajo existe solo para que el archivo
  --   se pueda correr sin haber pegado nada todavía.
  ('igv_renta', 1900, 0, -1, '1900-01-01', 'fila de relleno — ignorar')
on conflict (clase, anio, mes, digito) do nothing;

-- La fila de relleno no debe quedarse.
delete from vencimiento_oficial where anio = 1900;

-- ── RELLENAR LOS PERIODOS QUE SE CREARON SIN FECHA ──
select public.obligaciones_generar_todas() as periodos_nuevos;

-- ============================================================
--  RECTIFICAR una fecha ya cargada (el `on conflict` de arriba NO la pisa)
-- ============================================================
-- update vencimiento_oficial
--    set fecha = '2026-02-10', fuente = 'R.S. NNN-2025/SUNAT'
--  where clase = 'igv_renta' and anio = 2026 and mes = 1 and digito = 8;
--
-- Y después, para que el cambio llegue a los periodos ya creados:
-- update obligacion_periodo p set vence = v.fecha
--   from obligacion o, vencimiento_oficial v, empresas e
--  where p.obligacion_id = o.id and o.entidad_id = e.id
--    and v.clase = o.clase and v.anio = p.anio and v.mes = p.mes
--    and v.digito = right(regexp_replace(e.ruc, '\D', '', 'g'), 1)::int
--    and p.declarado_en is null;   -- lo ya declarado no se toca

-- ── VERIFICAR: qué años y dígitos hay cargados ──
select clase, anio, digito, count(*) as meses,
       min(fecha) as primera, max(fecha) as ultima,
       max(fuente) as fuente
  from vencimiento_oficial
 group by clase, anio, digito
 order by clase, anio, digito;

-- ── Y qué periodos siguen sin fecha, con el dígito que haría falta cargar ──
select e.nombre as empresa,
       right(regexp_replace(e.ruc, '\D', '', 'g'), 1) as digito,
       o.clase, p.anio, count(*) as meses_sin_fecha
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  left join empresas e on e.id = o.entidad_id
 where p.vence is null
 group by 1, 2, 3, 4
 order by 1, 4;
