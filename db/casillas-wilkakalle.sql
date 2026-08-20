-- ============================================================
--  db/casillas-wilkakalle.sql — LAS TRES DECLARACIONES QUE SE PUDIERON LEER
--
--  Cifras leídas de las constancias del PDT 621 de Apu Wilkakalle
--  (RUC 20612545058), descargadas de SOL el 20/08/2026.
--
--  ── POR QUÉ VAN POR SQL Y NO POR EL IMPORTADOR ──
--  El visor de PDF con el que se abrieron copia POR COLUMNAS: los códigos de
--  casilla y sus importes salen en líneas distintas y desordenados
--  («185 342» en una línea y «0.00» en la siguiente, cuando el original decía
--  «185 0.00 342 317 0.00»). De ese texto no hay forma de saber qué importe
--  pertenece a qué casilla.
--
--  Se podría inventar una regla de emparejamiento. No se hizo, y esa es la
--  decisión que este archivo documenta: una regla así acertaría muchas veces y
--  fallaría algunas, SIN AVISAR, y el resultado sería una cifra de IGV
--  equivocada con aspecto de dato bueno. En un módulo cuyo único propósito es
--  detectar diferencias de IGV, eso no es un fallo: es lo contrario de la
--  función.
--
--  ── DE AGOSTO 2025 VA LA RECTIFICATORIA ──
--  Tiene dos declaraciones: la original del 05/09 (todo en cero) y la
--  rectificatoria del 19/11 (crédito 162.00). Se guarda la segunda, porque es
--  la que sustituye a la anterior ante SUNAT. La FECHA de presentación, en
--  cambio, sigue siendo la de la original — esa decide la puntualidad y vive
--  en `declarado_en`, que este archivo no toca.
--
--  Idempotente. Al final verifica.
-- ============================================================

with datos(anio, mes, debito, credito, resultado, a_pagar, orden) as (values
  (2024, 11, 0.00, 0.00, 0.00, 0.00, '1133609320'),
  (2025,  4, 0.00, 0.00, 0.00, 0.00, '1133359148'),
  (2025,  8, 0.00, 162.00, -162.00, -162.00, '1160346475')
)
update obligacion_periodo p
   set igv_debito      = d.debito,
       igv_credito     = d.credito,
       igv_resultado   = d.resultado,
       igv_a_pagar     = d.a_pagar,
       declarado_orden = d.orden
  from datos d, obligacion o, empresas e
 where p.obligacion_id = o.id
   and o.entidad_id = e.id
   and regexp_replace(e.ruc, '\D', '', 'g') = '20612545058'
   and o.clase = 'igv_renta'
   and p.anio = d.anio and p.mes = d.mes;

-- ── VERIFICAR ──
-- Lo declarado contra lo que dicen las facturas. Noviembre 2024 y abril 2025
-- deben salir con más de mil soles «sin usar»; agosto, cuadrado al céntimo.
select p.anio, p.mes,
       p.igv_credito as declarado,
       round(coalesce(sum(c.igv) filter (where c.sentido = 'compra'), 0), 2) as segun_facturas,
       round(coalesce(sum(c.igv) filter (where c.sentido = 'compra'), 0)
             - coalesce(p.igv_credito, 0), 2) as sin_usar,
       p.declarado_orden
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  join empresas e   on e.id = o.entidad_id
  left join comprobante c on c.empresa_id = e.id
       and extract(year  from c.fecha)::int = p.anio
       and extract(month from c.fecha)::int = p.mes
 where regexp_replace(e.ruc, '\D', '', 'g') = '20612545058'
   and p.igv_credito is not null
 group by p.anio, p.mes, p.igv_credito, p.declarado_orden
 order by p.anio, p.mes;
