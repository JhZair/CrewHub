-- ============================================================
--  db/sunat-dj-anual-2023-2024.sql — JURADAS ANUALES 2023 Y 2024
--
--  Fuentes oficiales, una por ejercicio:
--    2024 → R.S. 000304-2024/SUNAT  (cronogramas/2025/cRenta2024.html)
--    2023 → R.S. 000269-2023/SUNAT  (cronogramas/2024/cRenta2023.html)
--
--  Los dos años traen los DOS cronogramas, como 2025: el general y el de
--  MYPE/Ley 31940. La diferencia entre ambos ronda los dos meses en los tres
--  ejercicios, así que la elección de cronograma pesa lo mismo hacia atrás que
--  hacia delante — y es lo que decide si una declaración vieja se presentó
--  dentro o fuera de plazo.
--
--  ── PARA QUÉ SIRVE CARGAR ESTO ──
--  Para que el sistema pueda decir «declarado FUERA DE PLAZO» de un ejercicio
--  cerrado. Sin la fecha, un periodo de 2023 solo sabe decir «✅ declarado»,
--  que es la mitad de la verdad. Es la misma razón por la que se cargaron los
--  cronogramas mensuales de 2024 y 2025.
--
--  ⚠ Ojo con el AÑO: `anio` es el EJERCICIO, no el del vencimiento. La jurada
--  del ejercicio 2023 vence en 2024 y va como (anio 2023, mes 0, '2024-xx-xx').
--
--  Verificado al generarlo: ninguna fecha en fin de semana, dígitos crecientes,
--  BC nunca antes que el 9, y el cronograma MYPE siempre posterior al general.
--  Idempotente. Al final verifica.
-- ============================================================

insert into vencimiento_oficial (clase, anio, mes, digito, fecha, fuente) values
  ('dj_anual', 2023, 0, 0, '2024-03-26', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 1, '2024-03-27', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 2, '2024-04-01', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 3, '2024-04-02', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 4, '2024-04-03', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 5, '2024-04-04', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 6, '2024-04-05', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 7, '2024-04-08', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 8, '2024-04-09', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, 9, '2024-04-10', 'R.S. 000269-2023/SUNAT · general'),
  ('dj_anual', 2023, 0, -2, '2024-04-11', 'R.S. 000269-2023/SUNAT · general · BC'),
  ('dj_anual_mype', 2023, 0, 0, '2024-05-27', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 1, '2024-05-28', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 2, '2024-05-29', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 3, '2024-05-30', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 4, '2024-05-31', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 5, '2024-06-03', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 6, '2024-06-04', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 7, '2024-06-05', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 8, '2024-06-06', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, 9, '2024-06-10', 'R.S. 000269-2023/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2023, 0, -2, '2024-06-11', 'R.S. 000269-2023/SUNAT · Ley 31940 · BC'),
  ('dj_anual', 2024, 0, 0, '2025-03-26', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 1, '2025-03-27', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 2, '2025-03-28', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 3, '2025-03-31', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 4, '2025-04-01', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 5, '2025-04-02', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 6, '2025-04-03', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 7, '2025-04-04', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 8, '2025-04-07', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, 9, '2025-04-08', 'R.S. 000304-2024/SUNAT · general'),
  ('dj_anual', 2024, 0, -2, '2025-04-09', 'R.S. 000304-2024/SUNAT · general · BC'),
  ('dj_anual_mype', 2024, 0, 0, '2025-05-26', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 1, '2025-05-27', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 2, '2025-05-28', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 3, '2025-05-29', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 4, '2025-05-30', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 5, '2025-06-02', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 6, '2025-06-03', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 7, '2025-06-04', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 8, '2025-06-05', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, 9, '2025-06-06', 'R.S. 000304-2024/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2024, 0, -2, '2025-06-09', 'R.S. 000304-2024/SUNAT · Ley 31940 · BC')
on conflict (clase, anio, mes, digito) do nothing;

/* ── CARGAR EL CALENDARIO NO CREA LOS PERIODOS VIEJOS ──
   `obligacion_generar` arranca en `obligacion.desde`, y si está vacío asume el
   año pasado. O sea: con la obligación creada hoy, esta carga NO hará aparecer
   2023 ni 2024 — solo dejará las fechas listas para cuando aparezcan.
   Es deliberado: nadie quiere que dar de alta una obligación destape de golpe
   cinco ejercicios sin declarar que quizá sí se declararon. Pedir el año de
   arranque es pedir un dato que solo sabe quien lleva la empresa.

   Para traer el histórico, dile desde cuándo declara y vuelve a generar: */
-- update obligacion set desde = '2023-01-01'
--  where clase in ('dj_anual', 'dj_anual_mype')
--    and entidad_id = (select id from empresas where ruc = '20612545058');
-- select public.obligaciones_generar_todas();

select public.obligaciones_generar_todas() as periodos_nuevos;

-- ── VERIFICAR ── Los tres ejercicios, con sus dos cronogramas.
select anio as ejercicio, clase,
       max(fecha) filter (where digito = 0) as d0,
       max(fecha) filter (where digito = 8) as d8,
       max(fecha) filter (where digito = -2) as bc,
       count(*) as filas
  from vencimiento_oficial
 where mes = 0
 group by anio, clase
 order by anio desc, clase;

-- Y los periodos anuales de cada empresa con la fecha que les toca.
select e.nombre, o.clase, p.anio as ejercicio, p.vence, p.declarado_en,
       case when p.declarado_en is null then '—'
            when p.declarado_en > p.vence then 'FUERA DE PLAZO'
            else 'a tiempo' end as puntualidad
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  left join empresas e on e.id = o.entidad_id
 where p.mes = 0
 order by 1, 3 desc;
