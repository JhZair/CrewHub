-- ============================================================
--  db/movimientos-po003.sql — EL LIBRO DEL BANCO, LÍNEA A LÍNEA
--
--  Ya teníamos `estado_cuenta`: quince filas, una por mes, con el saldo de
--  cierre. Es la foto mensual, y esconde justo lo que hace falta para rendir:
--  no distingue una comisión automática de un retiro para pagar a alguien.
--  Esto es la sección ACTIVIDADES de esos mismos quince estados —46
--  movimientos— del PDF EE.CC.WILKAKALLE.pdf, cuenta 285-7032820-0-71 del BCP.
--
--  ── LA VERIFICACIÓN QUE HACE CREÍBLE ESTA CARGA ──
--  Cada movimiento trae impreso el saldo contable posterior. Así que la carga
--  se comprueba sola: puestos los 46 en orden cronológico, se recalculó
--  «saldo anterior ± monto» y se comparó con el saldo del papel, uno por uno,
--  desde el primer depósito de S/ 5.00 del 23/08/2024 hasta el cierre de
--  octubre de 2025. Los 46 cuadran, con cero descuadres. Una cadena así no
--  se puede falsear por partes: si una sola cifra estuviera mal leída, todas
--  las siguientes dejarían de cuadrar.
--
--  ── LO QUE DICE EL LIBRO ──
--    · Desembolso 11/09/2024 ............. S/ 200,000.00
--    · Retiros a gastos (7) ............ S/ 199,439.10
--    · Comisiones y cargos del banco ..... S/ 614.25
--    · Intereses deudores ................ S/ 0.64
--    · SALDO al 31/10/2025 ............... S/ -48.99  (en descubierto)
--
--  La cuenta exclusiva del fondo está vacía y en negativo. Los S/ 200,000
--  salieron enteros, en siete operaciones. Contra eso hay S/ 98,270 de RHE y
--  S/ 10,238.81 de facturas.
--
--  ── DOS RESTAS QUE NO DAN LO MISMO, Y NINGUNA SOBRA ──
--    · Contra el estímulo:  200,000.00 − 108,508.81 = S/ 91,491.19
--    · Contra lo retirado:  199,439.10 − 108,508.81 = S/ 90,930.29
--  Los S/ 560.90 de diferencia no se perdieron: son las comisiones y el
--  interés que el banco cobró solo (S/ 614.89), menos el depósito inicial de
--  S/ 5.00 y el descubierto de S/ 48.99 que la cuenta arrastra hoy.
--  La primera cifra es la que DAFO reclama —entregó 200,000 y quiere ver
--  200,000 sustentados—. La segunda es la que el equipo puede llegar a
--  documentar, porque los 560.90 no los gastó nadie. La diferencia habrá que
--  explicarla en el informe; tenerla separada es lo que permite explicarla en
--  vez de discutirla.
--
--  Y el orden importa: el retiro del 20/08/2025 —«TRANSFER CTAS PROPIAS»,
--  S/ 23,548.00— ocurre CASI UN AÑO DESPUÉS del desembolso y a tres semanas de
--  que venciera el plazo (11/09/2025). La cláusula 6.1 del acta hace de todo
--  retiro un gasto del proyecto, así que ese traslado a cuenta propia necesita
--  sustento igual que cualquier otro.
--
--  ── POR QUÉ EL ITF ES «COMISIÓN» ──
--  El impuesto a las transacciones financieras no es una comisión del banco,
--  es un tributo. Va en `comision` porque la propia tabla lo define así
--  (db/movimiento-banco.sql lo nombra en la lista) y porque el uso es el
--  mismo: es plata que se va sola, que nadie decidió gastar y que no se
--  sustenta con comprobante. Inventarle una categoría propia habría partido
--  en dos una cifra que siempre se lee junta.
--
--  Idempotente. Correr por pasos: primero mirar, después escribir.
-- ============================================================

do $$
begin
  if to_regclass('public.movimiento_banco') is null then
    raise exception 'Falta la tabla movimiento_banco: corre antes db/movimiento-banco.sql';
  end if;
end $$;


-- ── EL LOTE, TAL COMO LO IMPRIME EL BANCO ──
-- El saldo va con signo: en descubierto el estado lo imprime «48.99-» y aquí
-- se guarda -48.99. Redondearlo a cero o dejarlo positivo sería convertir una
-- cuenta en rojo en una cuenta vacía, que no es lo mismo ante DAFO.
drop table if exists mov_po003;
create table mov_po003(
  fecha date, glosa text, medio text, tipo text,
  monto numeric(12,2), saldo numeric(12,2), categoria text
);

insert into mov_po003 (fecha, glosa, medio, tipo, monto, saldo, categoria)
values
('2024-08-23','ENTR.EFEC. 0051973','VEN','abono',5.00,5.00,'otro'),
('2024-08-31','ENVIO.EST.CTA','INT','cargo',5.50,-0.50,'comision'),
('2024-08-31','COM.MANTENIM','INT','cargo',35.00,-35.50,'comision'),
('2024-09-11','BCO.NACI0000','VEN','abono',200000.00,199964.50,'desembolso'),
('2024-09-11','IMPUESTO ITF','INT','cargo',10.00,199954.50,'comision'),
('2024-09-19','EMIS.CHEQ GEREN VENT','VEN','cargo',22575.10,177379.40,'retiro'),
('2024-09-30','ENVIO.EST.CTA','INT','cargo',5.50,177373.90,'comision'),
('2024-09-30','INTERESES DEUDORES','INT','cargo',0.63,177373.27,'interes'),
('2024-09-30','COM.MANTENIM','INT','cargo',35.00,177338.27,'comision'),
('2024-10-01','EMIS.CHEQ GEREN VENT','VEN','cargo',40316.00,137022.27,'retiro'),
('2024-10-01','PORTE EXTRACTO NUMER','INT','cargo',3.50,137018.77,'comision'),
('2024-10-31','ENVIO.EST.CTA','INT','cargo',5.50,137013.27,'comision'),
('2024-10-31','COM.MANTENIM','INT','cargo',35.00,136978.27,'comision'),
('2024-11-06','REG RET EFECTIVO','VEN','cargo',26000.00,110978.27,'retiro'),
('2024-11-06','IMPUESTO ITF','INT','cargo',1.30,110976.97,'comision'),
('2024-11-30','ENVIO.EST.CTA','INT','cargo',5.50,110971.47,'comision'),
('2024-11-30','COM.MANTENIM','INT','cargo',35.00,110936.47,'comision'),
('2024-12-03','REG RET EFECTIVO','VEN','cargo',29000.00,81936.47,'retiro'),
('2024-12-03','IMPUESTO ITF','INT','cargo',1.45,81935.02,'comision'),
('2024-12-04','COM CHEQUERA','INT','cargo',22.00,81913.02,'comision'),
('2024-12-18','EMIS.CHEQ GEREN VENT','VEN','cargo',29000.00,52913.02,'retiro'),
('2024-12-31','ENVIO.EST.CTA','INT','cargo',5.50,52907.52,'comision'),
('2024-12-31','COM.MANTENIM','INT','cargo',35.00,52872.52,'comision'),
('2025-01-25','EMIS.CHEQ GEREN VENT','VEN','cargo',29000.00,23872.52,'retiro'),
('2025-01-31','ENVIO.EST.CTA','INT','cargo',5.50,23867.02,'comision'),
('2025-01-31','COM.MANTENIM','INT','cargo',35.00,23832.02,'comision'),
('2025-02-28','ENVIO.EST.CTA','INT','cargo',5.50,23826.52,'comision'),
('2025-02-28','COM.MANTENIM','INT','cargo',35.00,23791.52,'comision'),
('2025-03-31','ENVIO.EST.CTA','INT','cargo',5.50,23786.02,'comision'),
('2025-03-31','COM.MANTENIM','INT','cargo',35.00,23751.02,'comision'),
('2025-04-30','ENVIO.EST.CTA','INT','cargo',5.50,23745.52,'comision'),
('2025-04-30','COM.MANTENIM','INT','cargo',35.00,23710.52,'comision'),
('2025-05-31','ENVIO.EST.CTA','INT','cargo',5.50,23705.02,'comision'),
('2025-05-31','COM.MANTENIM','INT','cargo',35.00,23670.02,'comision'),
('2025-06-30','ENVIO.EST.CTA','INT','cargo',5.50,23664.52,'comision'),
('2025-06-30','COM.MANTENIM','INT','cargo',35.00,23629.52,'comision'),
('2025-07-31','ENVIO.EST.CTA','INT','cargo',5.50,23624.02,'comision'),
('2025-07-31','COM.MANTENIM','INT','cargo',35.00,23589.02,'comision'),
('2025-08-20','TRANSFER CTAS PROPIAS','VEN','cargo',23548.00,41.02,'retiro'),
('2025-08-30','ENVIO.EST.CTA','INT','cargo',5.50,35.52,'comision'),
('2025-08-30','COM.MANTENIM','INT','cargo',35.00,0.52,'comision'),
('2025-09-30','ENVIO.EST.CTA','INT','cargo',5.50,-4.98,'comision'),
('2025-09-30','INTERESES DEUDORES','INT','cargo',0.01,-4.99,'interes'),
('2025-09-30','COM.MANTENIM','INT','cargo',35.00,-39.99,'comision'),
('2025-10-01','PORTE EXTRACTO NUMER','INT','cargo',3.50,-43.49,'comision'),
('2025-10-31','ENVIO.EST.CTA','INT','cargo',5.50,-48.99,'comision')
;


-- ------------------------------------------------------------
-- 1 · MIRAR — no escribe nada
-- ------------------------------------------------------------
select m.fecha, m.glosa, m.medio, m.categoria, m.tipo, m.monto, m.saldo,
       case when b.id is null then 'nuevo' else 'YA CARGADO' end as en_sistema
  from mov_po003 m
  left join movimiento_banco b
    on b.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and b.fecha = m.fecha and b.glosa = m.glosa
   and b.monto = m.monto and b.tipo = m.tipo
 order by m.fecha, m.saldo desc;

-- El resumen del lote. Debe dar:
--   desembolso 200000.00 · retiro 199439.1 · comision 614.25 · interes 0.64 · otro 5.00
select categoria, count(*) as n, sum(monto) as total
  from mov_po003 group by 1 order by 2 desc;

-- ── LA COMPROBACIÓN CONTRA LO QUE YA ESTÁ EN EL SISTEMA ──
-- El saldo del último movimiento de cada mes tiene que ser el mismo que el
-- `estado_cuenta.saldo` cargado en su día desde el resumen del PDF. Son dos
-- lecturas independientes del mismo documento —el detalle y el resumen—, así
-- que si coinciden en los quince meses, las dos son correctas.
-- Debe devolver CERO filas.
with cierre as (
  select date_trunc('month', fecha)::date as periodo,
         (array_agg(saldo order by fecha desc, abs(saldo) asc))[1] as saldo_libro
    from mov_po003 group by 1)
select c.periodo, c.saldo_libro, e.saldo as saldo_estado_cuenta
  from cierre c
  join estado_cuenta e
    on e.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and e.periodo = c.periodo
 where e.saldo is distinct from c.saldo_libro;


-- ------------------------------------------------------------
-- 2 · ESCRIBIR — descomenta y corre
-- ------------------------------------------------------------
-- insert into movimiento_banco
--   (postulacion_id, fecha, glosa, medio, tipo, monto, saldo, categoria)
-- select 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad',
--        m.fecha, m.glosa, m.medio, m.tipo, m.monto, m.saldo, m.categoria
--   from mov_po003 m
-- on conflict (postulacion_id, fecha, glosa, monto, tipo) do nothing
-- ;


-- ------------------------------------------------------------
-- 3 · VERIFICAR — debe dar 46 movimientos y saldo final -48.99
-- ------------------------------------------------------------
select count(*) as movimientos,
       sum(monto) filter (where categoria = 'desembolso') as desembolso,
       sum(monto) filter (where categoria = 'retiro')     as retiros,
       sum(monto) filter (where categoria = 'comision')   as comisiones,
       sum(monto) filter (where categoria = 'interes')    as intereses,
       min(fecha) as primero, max(fecha) as ultimo
  from movimiento_banco
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';


-- ------------------------------------------------------------
-- 4 · LO QUE SALIÓ DEL BANCO CONTRA LO QUE ESTÁ SUSTENTADO
--     La pregunta que importa, ahora respondida por el banco y no por una
--     resta a mano.
-- ------------------------------------------------------------
select (select coalesce(sum(monto), 0) from movimiento_banco
         where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
           and categoria = 'retiro') as salio_del_banco,
       (select coalesce(sum(monto), 0) from rhe
         where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as rhe,
       (select coalesce(sum(importe), 0) from comprobante
         where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as facturas,
       (select coalesce(sum(monto), 0) from movimiento_banco
         where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
           and categoria = 'retiro')
         - (select coalesce(sum(monto), 0) from rhe
             where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad')
         - (select coalesce(sum(importe), 0) from comprobante
             where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad')
         as sin_sustento;


-- ------------------------------------------------------------
-- 5 · LIMPIAR — cuando el paso 3 haya dado 46
-- ------------------------------------------------------------
-- drop table if exists mov_po003;
