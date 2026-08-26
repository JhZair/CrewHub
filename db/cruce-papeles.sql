-- ============================================================
--  db/cruce-papeles.sql — QUÉ COMPROBANTES YA ESTÁN Y CUÁLES FALTAN
--
--  CONSULTA DE SOLO LECTURA. No escribe nada. Ningún insert, ningún update.
--
--  ── DE DÓNDE SALE ──
--  En la laptop de Katy aparecieron 1.103 archivos. De esos, 384 son recibos
--  por honorarios y 374 traen RUC + serie + número EN EL PROPIO NOMBRE del
--  archivo, porque SUNAT nombra así lo que emite ({RUC}-R01-{serie}-{numero})
--  y las descargas del portal conservan ese nombre. O sea: la identidad de
--  cada papel ya la tenemos sin abrir un solo PDF.
--
--  Lo que falta es el otro lado —qué tiene el sistema— en la MISMA forma, para
--  que el cruce sea una comparación y no la lectura a ojo de setecientas filas.
--
--  ── POR QUÉ SE NORMALIZA EL NÚMERO ──
--  `rhe.numero` es texto tecleado a mano: el mismo recibo aparece como
--  «E001-123», «E001-0123», «E00123» o con un espacio de más. Cruzar sin
--  normalizar hace que un recibo YA CARGADO salga como faltante — y ese error
--  no da ningún aviso: termina en alguien cargando por segunda vez lo que ya
--  estaba, que es exactamente lo que infla el ejecutado de un fondo.
--
--  Se corre en Supabase → SQL Editor. La consulta 2 se descarga con
--  «Download CSV»; las otras tres caben en pantalla.
-- ============================================================


-- ────────────────────────────────────────────────────────────
--  1 · EL TAMAÑO DEL PROBLEMA (correr primero, cabe en pantalla)
--
--  `con_fondo` es la columna que importa: un recibo sin `postulacion_id` está
--  en el sistema pero no está imputado a ningún fondo, así que no aparece en
--  ninguna rendición. Cuenta como cargado y no sirve para rendir.
-- ────────────────────────────────────────────────────────────
select 'rhe'          as tabla,
       count(*)                      as filas,
       count(postulacion_id)         as con_fondo,
       count(nullif(url, ''))        as con_papel_adjunto,
       min(fecha)                    as desde,
       max(fecha)                    as hasta
  from rhe
union all
select 'comprobante',
       count(*), count(postulacion_id), count(nullif(url, '')),
       min(fecha), max(fecha)
  from comprobante
union all
select 'gasto_dj',
       count(*), count(postulacion_id), 0,
       min(fecha), max(fecha)
  from gasto_dj;


-- ────────────────────────────────────────────────────────────
--  2 · EL INVENTARIO — este es el que se descarga como CSV
--
--  Un solo CSV con dos orígenes (`rhe` y `comprobante`) puestos en la misma
--  forma: una clave «E001-123», un RUC, una fecha y un importe. Es lo que se
--  cruza contra `analisis/papeles.csv`.
-- ────────────────────────────────────────────────────────────
select * from (

  -- ── Recibos por honorarios ──
  --  El RUC no está en `rhe`: está en la persona que lo emitió. Por eso el
  --  join a `personas` es interno y no izquierdo — un RHE sin persona no
  --  podría cruzarse con nada, y si existiera querríamos que saltara aquí.
  select
    'rhe'::text                              as origen,
    'recibo_honorarios'::text                as tipo,
    pe.ruc_dni                               as ruc,
    case when k.serie is null then nullif(trim(r.numero), '')
         else k.serie || '-' || coalesce(k.num::bigint::text, '?') end
                                             as clave,
    r.fecha,
    r.monto                                  as importe,
    pe.nombre                                as quien,
    coalesce(em.codigo, '—')                 as empresa,
    coalesce(p.codigo,  '—')                 as fondo,
    (nullif(r.url, '') is not null)          as tiene_papel,
    r.numero                                 as numero_crudo
  from rhe r
  join personas pe          on pe.id = r.persona_id
  left join postulaciones p on p.id  = r.postulacion_id
  left join empresas em     on em.id = p.empresa_id
  /* La normalización, en un solo sitio. `substring(x from patrón)` devuelve el
     grupo capturado, así que esto parte «E001-0123» en serie y número sin
     tocar el dato original —que se conserva en `numero_crudo` para poder ver
     cómo estaba escrito si algo no calza. */
  cross join lateral (
    select upper(substring(r.numero from '[EFBefb][0-9]{3}'))         as serie,
           substring(r.numero from '[EFBefb][0-9]{3}[^0-9]*([0-9]+)') as num
  ) k

  union all

  -- ── Facturas y boletas ──
  --  Aquí serie y número ya vienen en columnas separadas, así que solo hay que
  --  quitarle los ceros a la izquierda al número para que «00031902» y
  --  «31902» sean el mismo comprobante.
  select
    'comprobante'::text,
    c.tipo,
    c.ruc,
    case when nullif(trim(c.serie), '') is null then nullif(trim(c.numero), '')
         else upper(trim(c.serie)) || '-' ||
              coalesce(
                nullif(regexp_replace(coalesce(c.numero, ''), '[^0-9]', '', 'g'), '')::bigint::text,
                coalesce(trim(c.numero), '?')) end,
    c.fecha,
    c.importe,
    coalesce(c.proveedor, '—'),
    coalesce(em.codigo, '—'),
    coalesce(p.codigo,  '—'),
    (nullif(c.url, '') is not null),
    c.serie || '-' || coalesce(c.numero, '')
  from comprobante c
  left join postulaciones p on p.id  = c.postulacion_id
  left join empresas em     on em.id = coalesce(c.empresa_id, p.empresa_id)

) t
order by origen, ruc nulls last, fecha;


-- ────────────────────────────────────────────────────────────
--  3 · LAS PERSONAS QUE YA EXISTEN, POR RUC
--
--  En los nombres de archivo hay 41 RUC emisores distintos. Los que NO estén
--  en esta lista son gente que habrá que crear ANTES de poder cargar su
--  recibo — `rhe.persona_id` es NOT NULL, así que sin persona no hay carga.
-- ────────────────────────────────────────────────────────────
select pe.ruc_dni,
       pe.nombre,
       count(r.id) as rhe_cargados
  from personas pe
  left join rhe r on r.persona_id = pe.id
 where nullif(trim(pe.ruc_dni), '') is not null
 group by pe.ruc_dni, pe.nombre
 order by pe.ruc_dni;


-- ────────────────────────────────────────────────────────────
--  4 · LAS EMPRESAS Y SUS RUC
--
--  Para atribuir cada papel a su empresa: en los nombres de archivo y en el
--  `clasificacion.csv` los RUC vienen en pares emisor+receptor, y el receptor
--  es una de estas. Con esto la carpeta se ordena «por empresa» sola, sin
--  mover un archivo a mano.
-- ────────────────────────────────────────────────────────────
select codigo, nombre, ruc
  from empresas
 order by codigo;
