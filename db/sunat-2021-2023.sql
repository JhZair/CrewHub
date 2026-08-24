-- ============================================================
--  db/sunat-2021-2023.sql — EL HUECO DEL CALENDARIO, Y CÓMO CERRARLO
--
--  ⚠ ESTE ARCHIVO NO SE CORRE TAL CUAL. Es una plantilla: hay que pegar
--  dentro las tablas reales de la resolución. Correrlo vacío no hace nada,
--  que es lo correcto.
--
--  ── QUÉ FALTA, EXACTAMENTE ──
--  Medido el 24/08/2026 sobre `vencimiento_oficial`:
--
--      igv_renta      2024, 2025, 2026   ✅ (132 filas cada uno)
--      dj_anual       2023, 2024, 2025   ✅
--      dj_anual_mype  2023, 2024, 2025   ✅
--      igv_renta      2021, 2022, 2023   ❌ NO ESTÁN
--
--  Son 3 años × 12 meses × 11 dígitos = 396 filas.
--
--  ── QUÉ SE GANA, Y QUÉ NO ──
--  Nada pendiente depende de esto: los periodos de esos años están todos
--  declarados. Lo que se gana es RETROSPECTIVO, y no es poco — sin fecha de
--  vencimiento el sistema no puede decir si se presentaron a tiempo, así que
--  los pinta apagados y cuenta «N sin poder comprobar el plazo».
--
--  iVirtualP es el caso: treinta periodos de 2021 a 2023 presentados todos en
--  dos días de octubre de 2024. Sin calendario, ni un ámbar. Con calendario,
--  el patrón queda a la vista — y ese patrón es de lo más útil que da esta
--  pantalla, porque dice si alguien viene arrastrando plazos.
--
--  ── DE DÓNDE SACAR LAS FECHAS ──
--  De la RESOLUCIÓN, no de una tabla encontrada por ahí. El comentario de
--  lib/obligaciones.ts lo dice y no es teórico: «hay tablas de cronograma
--  circulando por internet que se parecen mucho a la resolución de SUNAT y no
--  lo son —una de ellas contradecía en dos semanas los datos reales de este
--  equipo—. Una fecha equivocada no se nota: se cumple, y la multa llega
--  después.»
--
--    · Periodos 2021 → R.S. N.º 000224-2020/SUNAT
--    · Periodos 2022 → R.S. N.º 000189-2021/SUNAT
--    · Periodos 2023 → R.S. N.º 000281-2022/SUNAT
--
--  (Confirma el número en el buscador de normas de SUNAT antes de fiarte de
--  esta lista: son de memoria y esa es exactamente la clase de dato que este
--  archivo dice que no se copie sin verificar.)
--
--  ── CÓMO SE PEGA ──
--  Una fila por (mes del periodo, último dígito de RUC). `mes` es el MES DEL
--  PERIODO, no el del vencimiento: el periodo de enero 2021 vence en febrero.
--  `digito` va de 0 a 9, más el 10 si la resolución trae la columna de «buenos
--  contribuyentes» (si no aplica, se omite).
--  Y `fuente` con el número de la resolución: es lo que permite auditar de
--  dónde salió cada fecha el día que una no cuadre.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================

insert into vencimiento_oficial (clase, anio, mes, digito, fecha, fuente) values
  -- ── PEGAR AQUÍ. Ejemplo del formato, con datos INVENTADOS que hay que
  --    sustituir por los de la resolución:
  -- ('igv_renta', 2021,  1, 0, '2021-02-16', 'R.S. 000224-2020/SUNAT'),
  -- ('igv_renta', 2021,  1, 1, '2021-02-17', 'R.S. 000224-2020/SUNAT'),
  -- ...
  -- ('igv_renta', 2023, 12, 9, '2024-01-22', 'R.S. 000281-2022/SUNAT')

  -- Fila neutra para que el archivo corra sin errores estando vacío. No entra
  -- nunca: el `where false` la descarta. Quítala al pegar los datos de verdad.
  ('igv_renta', 1900, 1, 0, '1900-01-01', 'plantilla vacía')
on conflict (clase, anio, mes, digito) do nothing;
delete from vencimiento_oficial where anio = 1900;


-- ============================================================
--  VERIFICAR — esto es lo que atrapa una transcripción mala
-- ============================================================
-- Tres comprobaciones en una sola sentencia (el SQL Editor solo enseña el
-- resultado de la última):
--
--   1. CUÁNTAS HAY por año. Tiene que decir 132 en cada uno (12 × 11). Un año
--      con 120 es un mes que se saltó al pegar, y ese mes se queda sin fecha
--      sin que nada avise.
--   2. FINES DE SEMANA. SUNAT no vence en sábado ni domingo: si sale alguna,
--      hay una fila mal copiada. Es el error más común y el más silencioso.
--   3. FUERA DE RANGO. El vencimiento de un periodo cae en los tres meses
--      siguientes; una fecha lejos de ahí es un año o un mes mal tecleado.
select 'por año'        as prueba,
       clase || ' ' || anio as detalle,
       count(*)::text    as valor,
       case when count(*) = 132 then '✅' else '⚠ deberían ser 132' end as ok
  from vencimiento_oficial where clase = 'igv_renta' group by 1, 2
union all
select 'fin de semana', clase || ' ' || anio || '-' || mes || ' díg ' || digito,
       to_char(fecha, 'DD/MM/YYYY'), '⚠ cae en sábado o domingo'
  from vencimiento_oficial
 where extract(dow from fecha) in (0, 6)
union all
select 'fecha lejos del periodo', clase || ' ' || anio || '-' || mes || ' díg ' || digito,
       to_char(fecha, 'DD/MM/YYYY'), '⚠ revisar: no cae en los 3 meses siguientes'
  from vencimiento_oficial
 where mes between 1 and 12
   and (fecha < make_date(anio, mes, 1) + interval '15 days'
     or fecha > make_date(anio, mes, 1) + interval '4 months')
 order by 1, 2;
