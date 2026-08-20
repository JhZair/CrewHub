-- ============================================================
--  db/obligacion-dias-aviso.sql — AVISAR 6 DÍAS ANTES, NO 7
--
--  `dias_aviso` es un dato de cada obligación, no una constante: una empresa
--  podría querer más margen que otra. Lo que cambia aquí es el valor con el que
--  nacen las nuevas y el de las que ya existen, que se crearon todas con 7.
--
--  ── POR QUÉ TAMBIÉN EL DEFAULT DE LA COLUMNA ──
--  Tocar solo las filas dejaría la próxima obligación naciendo con 7 y a nadie
--  mirando ahí. El código ya no escribe el número a mano —sale de DIAS_AVISO en
--  lib/obligaciones.ts—, pero un INSERT hecho desde SQL o desde el panel de
--  Supabase se salta el código y cae en el default de la tabla. Los dos sitios
--  o ninguno.
--
--  Idempotente. Al final verifica.
-- ============================================================

alter table obligacion alter column dias_aviso set default 6;

-- Solo las que siguen en el valor viejo: si alguien ya ajustó una a mano,
-- ese ajuste era una decisión y no le toca a una migración deshacerla.
update obligacion set dias_aviso = 6 where dias_aviso = 7;

-- ── VERIFICAR ──
-- Debe salir 6 en todas, y el default de la columna en 6.
select dias_aviso, count(*) as obligaciones
  from obligacion group by dias_aviso order by dias_aviso;

select column_default as default_de_la_columna
  from information_schema.columns
 where table_name = 'obligacion' and column_name = 'dias_aviso';
