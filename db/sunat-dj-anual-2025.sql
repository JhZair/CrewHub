-- ============================================================
--  db/sunat-dj-anual-2025.sql — LA JURADA ANUAL DEL EJERCICIO 2025
--
--  Fuente: R.S. N° 000386-2025/SUNAT, publicada en
--  sunat.gob.pe/orientacion/cronogramas/2026/cRenta2025.html
--
--  ── HAY DOS CRONOGRAMAS, NO UNO ──
--  Y esto es lo que hace que esta obligación no se pueda cargar sola:
--
--   a) GENERAL — para quien tuvo ingresos netos en 2024 MAYORES a 1700 UIT,
--      inició operaciones en 2025, está en un grupo económico o queda fuera
--      de la Ley N° 31940.  Vence entre el 26/03 y el 13/04 de 2026.
--
--   b) MYPE / Ley N° 31940 — para personas naturales y micro y pequeñas
--      empresas con ingresos netos en 2024 de hasta 1700 UIT.
--      Vence entre el 27/05 y el 10/06 de 2026.
--
--  Para el mismo último dígito, la diferencia son DOS MESES. Elegir el
--  equivocado no da ningún aviso: da una multa, o dos meses de angustia
--  gratis.
--
--  ── POR QUÉ SON DOS CLASES Y NO UN CAMPO ──
--  Podría ser una casilla «es MYPE» en la obligación. Pero `vencimiento_oficial`
--  se indexa por CLASE, y una clase es «un calendario»: mezclar los dos bajo el
--  mismo nombre obligaría a que la consulta supiera de UIT y de la Ley 31940 —
--  reglas fiscales dentro de una función que solo debería saber leer fechas.
--  Dos calendarios, dos clases. Cuál le toca a cada empresa lo dice quien
--  conoce sus ingresos, no el sistema.
--
--  ⚠ EL SISTEMA NO PUEDE DECIDIR CUÁL. Depende de los ingresos netos de 2024,
--  un dato que no está aquí. Se cargan los dos y se elige al crear la
--  obligación; abajo hay un bloque para corregir la que ya exista.
--
--  `mes = 0` marca las anuales: la jurada de 2025 no es de ningún mes.
--  Idempotente. Al final verifica.
-- ============================================================

insert into vencimiento_oficial (clase, anio, mes, digito, fecha, fuente) values
  -- a) CRONOGRAMA GENERAL · ejercicio 2025
  ('dj_anual', 2025, 0, 0, '2026-03-26', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 1, '2026-03-27', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 2, '2026-03-30', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 3, '2026-03-31', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 4, '2026-04-01', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 5, '2026-04-06', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 6, '2026-04-07', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 7, '2026-04-08', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 8, '2026-04-09', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, 9, '2026-04-10', 'R.S. 000386-2025/SUNAT · general'),
  ('dj_anual', 2025, 0, -2, '2026-04-13', 'R.S. 000386-2025/SUNAT · general · BC'),

  -- b) MYPE / Ley N° 31940 · ejercicio 2025 (hasta 1700 UIT de ingresos 2024)
  ('dj_anual_mype', 2025, 0, 0, '2026-05-27', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 1, '2026-05-28', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 2, '2026-05-29', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 3, '2026-06-01', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 4, '2026-06-02', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 5, '2026-06-03', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 6, '2026-06-04', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 7, '2026-06-05', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 8, '2026-06-08', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, 9, '2026-06-09', 'R.S. 000386-2025/SUNAT · Ley 31940'),
  ('dj_anual_mype', 2025, 0, -2, '2026-06-10', 'R.S. 000386-2025/SUNAT · Ley 31940 · BC')
on conflict (clase, anio, mes, digito) do nothing;

select public.obligaciones_generar_todas() as periodos_nuevos;

-- ============================================================
--  SI LA OBLIGACIÓN QUE YA CREASTE ES LA DEL OTRO CRONOGRAMA
--
--  La que existe se creó como `dj_anual` (la GENERAL, que es la que vence en
--  marzo/abril). Si la asociación tuvo en 2024 ingresos netos de hasta 1700
--  UIT —lo normal en un colectivo de este tamaño—, le toca la de MYPE y hay
--  que cambiarla. Descomenta y corre:
--
--  update obligacion set clase = 'dj_anual_mype'
--   where clase = 'dj_anual'
--     and entidad_id = (select id from empresas where ruc = '20612545058');
--
--  -- y refrescar la fecha del periodo ya creado, que quedó con la vieja:
--  update obligacion_periodo p set vence = null
--    from obligacion o where o.id = p.obligacion_id and o.clase = 'dj_anual_mype';
--  select public.obligaciones_generar_todas();
-- ============================================================

-- ── VERIFICAR ──
select clase, digito, fecha, fuente
  from vencimiento_oficial
 where anio = 2025 and mes = 0
 order by clase, digito;

-- Qué fecha le queda a cada obligación anual del sistema.
select e.nombre, o.clase,
       right(regexp_replace(e.ruc, '\D', '', 'g'), 1) as digito,
       p.anio, p.vence
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  left join empresas e on e.id = o.entidad_id
 where p.mes = 0
 order by 1, 4;

-- Y comprobar que ya no queda ningún periodo sin fecha.
select o.clase, p.anio, count(*) as sin_fecha
  from obligacion_periodo p join obligacion o on o.id = p.obligacion_id
 where p.vence is null group by 1, 2 order by 2;
