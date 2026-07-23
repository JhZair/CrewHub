-- ============================================================
--  Mujunakuy (PO-005) — Estados de cuenta reales del banco
--
--  Cuenta corriente BCP N° 285-1154499-0-91 (soles), titular
--  «Asociación de Productores Agropecuarios Ca. Pongobamba N.12».
--  8 estados, de oct-2023 a may-2024 (vida del fondo).
--
--  Intereses = 0 en todos: es cuenta CORRIENTE, no genera interés
--  acreedor (el único interés del periodo es deudor, S/0.37 en mayo,
--  que no se declara como generado).
--
--  El estímulo de S/200,000 se abonó el 20/10/2023 → ese es el
--  desembolso. Se fija abajo (bloque 2), revísalo antes de correr.
--
--  Idempotente: on conflict (postulacion_id, periodo) actualiza, no
--  duplica. Resuelve el fondo por su código; si PO-005 no existe, no
--  inserta nada (0 filas).
-- ============================================================

-- ── 1) Los 8 estados de cuenta ──────────────────────────────
with f as (
  select id from postulaciones where codigo = 'PO-005' limit 1
)
insert into estado_cuenta (postulacion_id, periodo, saldo, intereses, url, nota)
select f.id, d.periodo::date, d.saldo, d.intereses, null, d.nota
from f cross join (values
  ('2023-10-01', 180156.50, 0.00, 'BCP 285-1154499-0-91 · estímulo S/200,000 abonado el 20/10/2023 · cargos S/19,848.50'),
  ('2023-11-01', 156548.00, 0.00, 'cargos del mes S/23,608.50'),
  ('2023-12-01', 128839.50, 0.00, 'cargos del mes S/27,708.50'),
  ('2024-01-01',  94891.00, 0.00, 'cargos del mes S/33,948.50'),
  ('2024-02-01',  55722.50, 0.00, 'cargos del mes S/39,168.50'),
  ('2024-03-01',  55684.00, 0.00, 'cargos del mes S/38.50 (solo comisiones)'),
  ('2024-04-01',  33925.50, 0.00, 'cargos del mes S/21,758.50'),
  ('2024-05-01',    -49.72, 0.00, 'cierre · saldo negativo por comisiones; interés deudor S/0.37')
) as d(periodo, saldo, intereses, nota)
on conflict (postulacion_id, periodo)
do update set saldo = excluded.saldo, intereses = excluded.intereses, nota = excluded.nota;

-- ── 2) El desembolso (revísalo): el dinero llegó el 20/10/2023 ──
update postulaciones set fecha_desembolso = '2023-10-20'
 where codigo = 'PO-005' and fecha_desembolso is null;

-- ── 3) Comprobación: lo que quedó cargado ───────────────────
select ec.periodo, ec.saldo, ec.intereses, ec.nota
  from estado_cuenta ec
  join postulaciones p on p.id = ec.postulacion_id
 where p.codigo = 'PO-005'
 order by ec.periodo;
