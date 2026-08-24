-- ============================================================
--  db/obligacion-vence-backfill.sql — DARLE FECHA A LO QUE NACIÓ SIN ELLA
--
--  ⚠ CORRER DESPUÉS de db/sunat-2020-2023.sql. Sin el calendario cargado no
--  hay nada que copiar y esto no hace nada (que es lo correcto, pero inútil).
--
--  ── EL HUECO QUE FALTABA CERRAR ──
--  Cargar `vencimiento_oficial` NO arregla los periodos que ya existen.
--  `obligacion_generar` resuelve la fecha en el momento de INSERTAR y termina
--  con `on conflict (obligacion_id, anio, mes) do nothing`: un periodo que ya
--  está no se toca nunca más. Así que los 31 meses que se crearon cuando el
--  calendario de su año no existía siguen con `vence` en nulo aunque ahora la
--  fecha esté a una consulta de distancia.
--
--  Es el clásico paso que se olvida: se carga el dato que faltaba, la
--  consulta de verificación dice «31 periodos ganan fecha», y nadie repara en
--  que «ganan» era condicional.
--
--  ── SOLO RELLENA, NUNCA PISA ──
--  `where vence is null`. Si alguien corrigió una fecha a mano —porque SUNAT
--  la prorrogó, que pasa— esto no se la lleva por delante. Rellenar un hueco y
--  sobrescribir un dato son operaciones distintas y esta es solo la primera.
--
--  ── EL DÍGITO SE RESUELVE IGUAL QUE EN EL GENERADOR ──
--  Último dígito del RUC de la empresa, con `-1` de respaldo para los
--  calendarios que no dependen del RUC. Es la MISMA regla que
--  `obligacion_generar`, copiada a propósito con su `order by digito desc`:
--  si aquí se resolviera distinto, los periodos viejos y los nuevos tendrían
--  fechas de dos criterios y nadie sabría cuál mirar.
--  El `-2` de Buenos Contribuyentes queda fuera, como en el generador: el
--  sistema no sabe quién es BC, y adivinarlo daría una fecha más tardía de la
--  que corresponde — justo el error que hace parecer puntual algo que no lo fue.
--
--  Idempotente: correrlo dos veces no cambia nada la segunda.
--  Correr en Supabase → SQL Editor.
-- ============================================================

with dig as (
  select o.id as obligacion_id, o.clase,
         case when o.entidad_tipo = 'empresa'
              then coalesce(nullif(right(regexp_replace(e.ruc, '\D', '', 'g'), 1), '')::int, -1)
              else -1 end as d
    from obligacion o
    left join empresas e on e.id = o.entidad_id and o.entidad_tipo = 'empresa'
),
elegido as (
  select p.id as periodo_id,
         (select v.fecha from vencimiento_oficial v
           where v.clase = dg.clase and v.anio = p.anio and v.mes = p.mes
             and v.digito in (dg.d, -1)
           order by v.digito desc limit 1) as fecha
    from obligacion_periodo p
    join dig dg on dg.obligacion_id = p.obligacion_id
   where p.vence is null
)
update obligacion_periodo p
   set vence = e.fecha
  from elegido e
 where p.id = e.periodo_id and e.fecha is not null;


-- ============================================================
--  VERIFICAR — y aquí sale el hallazgo
-- ============================================================
-- 1. Cuántos siguen sin fecha. Lo que quede es calendario que de verdad falta
--    (un año sin cargar, o una empresa sin RUC), no este paso a medias.
-- 2. LOS QUE SE PRESENTARON TARDE, por empresa. Esto es lo que la pantalla no
--    podía decir: un periodo declarado sin `vence` no es «puntual», es «no lo
--    sé», y ahora se sabe. Si alguna empresa sale con veinte, no es un fallo
--    del sistema — es lo que pasó.
select 'siguen sin fecha' as prueba,
       coalesce(e.nombre, '(sin empresa)') as empresa,
       count(*)::text as n, '' as detalle
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  left join empresas e on e.id = o.entidad_id and o.entidad_tipo = 'empresa'
 where p.vence is null
 group by 1, 2
union all
select 'declarados fuera de plazo', coalesce(e.nombre, '(sin empresa)'),
       count(*)::text,
       'el más viejo: ' || min(p.anio || '-' || lpad(p.mes::text, 2, '0'))
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  left join empresas e on e.id = o.entidad_id and o.entidad_tipo = 'empresa'
 where p.declarado_en is not null and p.vence is not null
   and p.declarado_en::date > p.vence
 group by 1, 2
 order by 1, 3 desc, 2;
