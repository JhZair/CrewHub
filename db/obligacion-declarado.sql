-- ============================================================
--  db/obligacion-declarado.sql — LO QUE SE DECLARÓ, JUNTO A LO QUE SE DEBÍA
--
--  El sistema ya sabía dos cosas de cada periodo: SI se presentó (del reporte
--  de constancias) y CUÁNTO IGV sale de las facturas cargadas. Le faltaba la
--  tercera, que es la que hace útil a las otras dos: QUÉ CIFRAS SE PUSIERON en
--  la declaración.
--
--  ── POR QUÉ NO ERA UN LUJO ──
--  En esta asociación, dieciocho periodos presentados y sin deuda parecían
--  «todo en orden». Al leer las casillas: noviembre de 2024 y abril de 2025
--  declarados ENTERAMENTE EN CERO, con S/ 1,189.53 y S/ 1,157.58 de crédito
--  fiscal en sus facturas. Ningún reporte de pagos lo dice, porque una
--  declaración en cero y una con saldo a favor pagan lo mismo: nada.
--
--  Guardar el declarado convierte esa comparación en una columna permanente en
--  vez de una auditoría que hay que acordarse de repetir.
--
--  ── LAS CUATRO CASILLAS, Y NO LAS DOSCIENTAS ──
--  El PDT 621 tiene más de doscientas. Se guardan las que se pueden
--  CONTRASTAR con lo que el sistema calcula:
--    101 → IGV de ventas (débito)
--    178 → crédito fiscal de compras
--    140 → impuesto resultante del periodo
--    184 → tributo a pagar o saldo a favor, tras el saldo arrastrado
--  Las demás serían datos que nadie mira y que nadie mantiene.
--
--  ── DE VARIAS DECLARACIONES DEL MISMO PERIODO, LA ÚLTIMA ──
--  Al revés que `declarado_en`, que guarda la PRIMERA. No es incoherencia: la
--  puntualidad la decide la original —rectificar tarde no salva a la que llegó
--  tarde— y las cifras vigentes son las de la última rectificatoria, porque es
--  la que sustituye a todas ante SUNAT.
--
--  Idempotente. Al final verifica.
-- ============================================================

alter table obligacion_periodo add column if not exists igv_debito    numeric(12,2);
alter table obligacion_periodo add column if not exists igv_credito   numeric(12,2);
alter table obligacion_periodo add column if not exists igv_resultado numeric(12,2);
alter table obligacion_periodo add column if not exists igv_a_pagar   numeric(12,2);
/* De qué declaración salieron. Sin esto, al ver una diferencia no habría forma
   de saber si se está comparando contra la original o contra su rectificatoria
   —y son cifras distintas del mismo mes—. */
alter table obligacion_periodo add column if not exists declarado_orden text;

comment on column obligacion_periodo.igv_debito is
  'Casilla 101 del PDT 621: IGV de ventas declarado.';
comment on column obligacion_periodo.igv_credito is
  'Casilla 178: crédito fiscal de compras declarado. Contrastar con la suma del IGV de los comprobantes del mes.';
comment on column obligacion_periodo.igv_resultado is
  'Casilla 140: impuesto resultante del periodo. Negativo = saldo a favor.';
comment on column obligacion_periodo.declarado_orden is
  'Número de orden de la declaración de la que salieron estas cifras: la última vigente, no necesariamente la primera.';

-- ── VERIFICAR ──
select column_name, data_type
  from information_schema.columns
 where table_name = 'obligacion_periodo'
   and column_name in ('igv_debito','igv_credito','igv_resultado','igv_a_pagar','declarado_orden')
 order by column_name;

/* Y, una vez importadas las casillas, la lista de lo que NO cuadra. Es la
   consulta que contesta «¿dónde se dejó crédito fiscal sin usar?». */
select e.nombre, p.anio, p.mes,
       p.igv_credito as declarado,
       round(coalesce(sum(c.igv) filter (where c.sentido = 'compra'), 0), 2) as segun_facturas,
       round(coalesce(sum(c.igv) filter (where c.sentido = 'compra'), 0) - coalesce(p.igv_credito, 0), 2) as sin_usar
  from obligacion_periodo p
  join obligacion o  on o.id = p.obligacion_id
  join empresas e    on e.id = o.entidad_id
  left join comprobante c on c.empresa_id = e.id
       and extract(year  from c.fecha)::int = p.anio
       and extract(month from c.fecha)::int = p.mes
 where p.igv_credito is not null
 group by e.nombre, p.anio, p.mes, p.igv_credito
having round(coalesce(sum(c.igv) filter (where c.sentido = 'compra'), 0) - coalesce(p.igv_credito, 0), 2) > 1
 order by 5 desc;
