-- ============================================================
--  db/facturas-po003.sql — LAS FACTURAS DE PO-003 · CHACCU
--
--  La tercera pata de la rendición, junto a los RHE y las declaraciones
--  juradas. Hasta ahora el fondo mostraba S/ 98,270 de recibos contra
--  S/ 200,000 de estímulo; estas facturas suman S/ 10,238.81 de gasto que
--  estaba sustentado y no aparecía en ningún sitio.
--
--  ── DE DÓNDE SALEN LOS NÚMEROS ──
--  De los PDF de EntregablesDAFO/Facturas, leídos con pdfplumber. Nada se
--  tecleó a mano. Cada fila pasó dos comprobaciones independientes antes de
--  llegar aquí:
--    1. valor venta + IGV = importe total, con la aritmética del propio papel;
--    2. el importe total aparece literalmente impreso en el texto del PDF.
--  La primera pilló un error real: en la factura de Smart Business el patrón
--  «TOTAL:S/» casaba antes con «SUB TOTAL:S/ 6431.03», y sin esa comprobación
--  se habría cargado S/ 6,431.03 donde el papel dice S/ 7,588.61. Una regla
--  que no se verifica es una regla que miente en silencio.
--
--  Suma de control: 6 comprobantes · valor S/ 8,676.95 · IGV S/ 1,561.86
--                   · TOTAL S/ 10,238.81
--
--  ── LA SÉPTIMA FACTURA, Y POR QUÉ NO ESTÁ ──
--  En la carpeta hay siete PDF. Aquí van seis.
--  FF53-0002098 (14/06/2025, S/ 999.00, un HONOR X8C) está emitida a
--  ASOCIACION WATUKUY MALLMAYA, RUC 20612546534. Las seis que sí se cargan van
--  a ASOCIACION CULTURAL APU WILKAKALLE, RUC 20612545058, titular del fondo y
--  de la cuenta 285-7032820-0-71 del BCP. Un comprobante emitido a otro RUC no
--  sustenta el gasto de este fondo: para DAFO es el gasto de otra entidad.
--  Se deja fuera por decisión de quien rinde, no porque el sistema no pudiera
--  guardarla. Queda escrito aquí para que dentro de un año, cuando alguien
--  cuente siete PDF y seis filas, la diferencia tenga una razón y no parezca
--  una carga a medias. Si se consigue la nota de crédito y la refacturación al
--  RUC correcto, entra con el número nuevo — no con este.
--
--  ⚠ ── EL RUBRO ES UNA APROXIMACIÓN, Y SE DICE ──
--  Las seis van a `recursos_tecnicos` porque las seis son equipo técnico. Pero
--  dos cosas no cuadran con el presupuesto aprobado y conviene saberlas antes
--  de rendir:
--    · El presupuesto contempla 4 cámaras «Móvil S24 Ultra» a S/ 6,200 c/u
--      (S/ 24,800). Lo comprado y cargado aquí son 2 HONOR X8C y 1 Honor Pad
--      X8a: S/ 2,546.99 de aparatos, S/ 2,650.20 contando las dos fundas y el
--      protector de pantalla. Es una sustitución del 90 % del monto de esa
--      línea, no un ajuste de precio.
--      (Un tercer HONOR X8C existe, pero su factura es la que se dejó fuera.)
--    · La PC de edición de S/ 7,588.61 NO tiene línea en el presupuesto. El
--      rubro `equipo_proyecto` es solo honorarios de personas, y
--      `recursos_tecnicos` no incluye ninguna computadora. Es gasto no
--      presupuestado.
--  Ninguna de las dos se resuelve con SQL. Se resuelven pidiendo la
--  modificación presupuestal a DAFO, o justificándolas en el informe.
--
--  Idempotente. Correr por pasos: primero mirar, después escribir.
-- ============================================================

-- ── DEPENDENCIA ──
-- Sin la tabla, este archivo no tiene dónde escribir.
do $$
begin
  if to_regclass('public.comprobante') is null then
    raise exception 'Falta la tabla comprobante: corre antes db/facturas.sql';
  end if;
end $$;


-- ── EL LOTE, TAL COMO LO DICEN LOS PDF ──
-- Tabla real, no `temporary ... on commit drop`: entre el paso 1 y el paso 2
-- hay una persona leyendo, y una tabla que se desvanece al cerrar la
-- transacción obliga a empezar de nuevo. Se borra en el paso 5.
drop table if exists fact_po003;
create table fact_po003(
  proveedor text, ruc text, serie text, numero text, fecha date,
  importe numeric(12,2), igv numeric(12,2), concepto text,
  archivo text        -- el PDF del que salió, para poder volver
);

insert into fact_po003
  (proveedor, ruc, serie, numero, fecha, importe, igv, concepto, archivo)
values
('SSNTI E.I.R.L. (Smart Business)','20605369775','F001','00000485','2025-04-12',7588.61,1157.58,'PC de edición: Intel Core Ultra 7 265KF + SSD Kingston 2TB NV3 + placa ASUS ROG STRIX Z890-E + GPU Gigabyte RTX 4060 8GB + refrigeración líquida Cougar Poseidon Elite + fuente Gigabyte 1000W 80+ Gold + case Antec Performance 1 + licencia Windows 11 Pro OEM','F-00339-20605369775_F001-00000485-1003-PDF.pdf'),
('QUE TAL COMPRA DEL PERU S.A.C.','20601844916','FF53','0002112','2025-06-18',599.00,91.37,'Honor Pad X8a 4GB+128GB Gray','F-00288-20601844916-01-FF53-00002112.pdf'),
('QUE TAL COMPRA DEL PERU S.A.C.','20601844916','FF53','0002145','2025-07-07',978.00,149.19,'SEGURO PANTALLA 901/1200 + HONOR X8C 8GB+256GB Midnight Black','F-00289-20601844916-01-FF53-00002145.pdf'),
('QUE TAL COMPRA DEL PERU S.A.C.','20601844916','FF53','0002146','2025-07-07',14.20,2.17,'SUPERAZ CASE 360 TRANSPARENTE HONOR X8C - U31','F-00290-20601844916-01-FF53-00002146.pdf'),
('QUE TAL COMPRA DEL PERU S.A.C.','20601844916','FF53','0002259','2025-08-16',1049.00,160.02,'HONOR X8C 8GB+256GB Cloud Purple','F-00291-20601844916-01-FF53-00002259.pdf'),
('QUE TAL COMPRA DEL PERU S.A.C.','20601844916','FF53','0002260','2025-08-16',10.00,1.53,'Mobile phone protective case for HON X8C-back','F-00296-20601844916-01-FF53-00002260.pdf')
;


-- ------------------------------------------------------------
-- 1 · MIRAR — no escribe nada
--     Dos cosas de un vistazo: si la factura ya estaba cargada, y si el lote
--     cuadra con la suma de control de la cabecera. Nada se inserta hasta el
--     paso 2.
-- ------------------------------------------------------------
select f.serie || '-' || f.numero as documento,
       f.fecha,
       f.proveedor,
       f.importe,
       f.igv,
       case when c.id is null then 'nueva' else 'YA CARGADA' end as en_sistema,
       left(f.concepto, 60) as concepto
  from fact_po003 f
  left join comprobante c
    on c.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and c.serie = f.serie and c.numero = f.numero
 order by f.fecha, f.numero;

-- El total del lote. Debe dar 6 · 10238.81 · 1561.86.
select count(*) as comprobantes, sum(importe) as total, sum(igv) as igv
  from fact_po003;

-- Y que ninguna esté emitida a un RUC que no sea el de la empresa titular del
-- fondo — leído de la base, no asumido. Debe devolver CERO filas.
-- Es una guarda barata contra el error de la séptima factura, que aquí ya está
-- resuelto: sirve para el día en que alguien añada una línea a mano.
select f.serie || '-' || f.numero as documento, e.ruc as ruc_titular
  from fact_po003 f
  cross join (select e.ruc
                from postulaciones p join empresas e on e.id = p.empresa_id
               where p.id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') e
 where e.ruc is distinct from '20612545058';


-- ------------------------------------------------------------
-- 2 · ESCRIBIR — descomenta y corre
--     El `where not exists` no es cinturón de más: el unique de la tabla es
--     (postulacion_id, serie, numero), así que un segundo intento reventaría
--     el insert entero y no cargaría ninguna. Así carga las que faltan y
--     calla sobre las que ya estaban.
-- ------------------------------------------------------------
-- insert into comprobante
--   (postulacion_id, tipo, proveedor, ruc, serie, numero, fecha, importe, igv,
--    concepto, rubro_item)
-- select 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad', 'factura',
--        f.proveedor, f.ruc, f.serie, f.numero, f.fecha, f.importe, f.igv,
--        f.concepto, 'recursos_tecnicos'
--   from fact_po003 f
--  where not exists (
--    select 1 from comprobante c
--     where c.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--       and c.serie = f.serie and c.numero = f.numero)
-- ;


-- ------------------------------------------------------------
-- 3 · VERIFICAR — debe dar 6 comprobantes y S/ 10,238.81
-- ------------------------------------------------------------
select count(*) as comprobantes,
       sum(importe) as total,
       sum(igv) as igv,
       min(fecha) as primera,
       max(fecha) as ultima
  from comprobante
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';

-- Y que ninguna se haya cargado dos veces. CERO filas.
select serie, numero, count(*)
  from comprobante
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
 group by 1, 2 having count(*) > 1;


-- ------------------------------------------------------------
-- 4 · LA FOTO COMPLETA DEL FONDO
--     Estímulo, y las formas de sustentarlo que ya están en el sistema. Esta
--     es la cifra que importa: cuánto queda sin sustento a día de hoy.
-- ------------------------------------------------------------
select 200000.00 as estimulo,
       (select coalesce(sum(monto), 0) from rhe
         where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as rhe,
       (select coalesce(sum(importe), 0) from comprobante
         where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as facturas,
       200000.00
         - (select coalesce(sum(monto), 0) from rhe
             where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad')
         - (select coalesce(sum(importe), 0) from comprobante
             where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad')
         as sin_sustento;


-- ------------------------------------------------------------
-- 5 · LIMPIAR — cuando el paso 3 haya dado 6 · 10238.81
-- ------------------------------------------------------------
-- drop table if exists fact_po003;
-- drop table if exists rhe_po003;
-- drop table if exists comp_042_2024;
