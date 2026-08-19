-- ============================================================
--  db/revisar-e001-432.sql — ¿ES UNA FACTURA O UN RECIBO?
--
--  En las facturas de PO-003 hay una fila que no encaja:
--
--    HUAYOTUMA HERMOZA CESAR JOZUE · RUC 10462735842 · serie E001-432
--
--  El RUC empieza en 10 —persona natural— y la serie E### es la serie
--  electrónica de los recibos por honorarios. Las dos cosas juntas casi siempre
--  significan un RHE archivado como factura.
--
--  ── POR QUÉ IMPORTA, SI EL MONTO ES EL MISMO ──
--  Porque el monto es lo único que coincide. Registrado como comprobante:
--    · NO cuenta para el tope de 4ta de esa persona, así que el semáforo del
--      tope va bajo y nadie sabrá cuándo hay que empezar a retenerle el 8 %;
--    · NO pide constancia de suspensión, así que la retención cero pasa sin
--      que nadie la mire;
--    · NO aparece en la pestaña Equipo del fondo, que se arma desde `rhe`:
--      alguien que trabajó y cobró queda fuera de la nómina;
--    · va al lado equivocado del informe económico, que separa honorarios de
--      bienes y servicios.
--  Ninguna de las cuatro falla ruidosamente. El descuadre sale al rendir.
--
--  ── LO QUE NO PUEDO COMPROBAR DESDE AQUÍ ──
--  El PDF se subió al Storage, no a Drive, así que no lo he leído. Lo que sigue
--  es un DIAGNÓSTICO: enseña los hechos para que decidas. La conversión va al
--  final y comentada — mover una fila de plata de una tabla a otra no es algo
--  que deba pasar por leer un archivo hasta el fondo sin querer.
--
--  ⚠ Antes de nada: abre el PDF. Si en la cabecera dice «RECIBO POR HONORARIOS
--  ELECTRÓNICO», es un RHE y esto aplica. Si dice «FACTURA ELECTRÓNICA», es una
--  persona natural con negocio y no hay nada que corregir salvo que la serie
--  esté mal tecleada.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · LA FILA, COMO ESTÁ
-- ------------------------------------------------------------
select id, tipo, proveedor, ruc, serie, numero, fecha, importe, igv,
       concepto, etapa, rubro_item,
       case when url is null or url = '' then '⚠ sin PDF' else 'con PDF' end as pdf
  from comprobante
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and ruc = '10462735842';

-- ── EL IGV ES LA PISTA MÁS BARATA ──
-- Un recibo por honorarios NO lleva IGV. Si esta fila tiene un IGV distinto de
-- cero, o lo puso el cálculo automático del formulario (18 % incluido) o se
-- tecleó — en ambos casos, sobre un documento que no lo tiene. Un importe con
-- IGV inventado descuadra el informe económico por ese monto exacto.
select serie || '-' || numero as documento, importe, igv,
       case when coalesce(igv, 0) = 0 then 'ok — sin IGV, como un RHE'
            else '⚠ tiene IGV: un recibo por honorarios no lo lleva' end as diagnostico
  from comprobante
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and ruc = '10462735842';

-- ------------------------------------------------------------
-- 2 · ¿EXISTE LA PERSONA?
--     Para moverlo a `rhe` hace falta un `persona_id`. Si esto devuelve cero
--     filas, hay que darla de alta primero: el RUC 10462735842 corresponde al
--     DNI 46273584.
-- ------------------------------------------------------------
select id, nombre, alias, tipo, ruc_dni, suspension_4ta_anio
  from personas
 where regexp_replace(coalesce(ruc_dni,''), '\D', '', 'g') in ('46273584', '10462735842');

-- ------------------------------------------------------------
-- 3 · ¿YA ESTÁ COMO RHE?
--     Si alguien lo registró en los dos sitios, el fondo lo está contando dos
--     veces. CERO filas es lo esperado.
-- ------------------------------------------------------------
select x.id, x.numero, x.fecha, x.monto, coalesce(p.alias, p.nombre) as persona
  from rhe x left join personas p on p.id = x.persona_id
 where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and x.numero ilike '%432%';

-- ── Y EL BARRIDO GENERAL, QUE ES LO QUE DE VERDAD SIRVE ──
-- La misma señal aplicada a TODOS los comprobantes de TODOS los fondos: RUC de
-- persona natural con serie de recibo. Buscar solo el caso que ya conocemos
-- habría dejado a los demás donde están.
select p.codigo as fondo, c.proveedor, c.ruc, c.serie || '-' || c.numero as documento,
       c.fecha, c.importe, c.igv
  from comprobante c join postulaciones p on p.id = c.postulacion_id
 where c.ruc ~ '^10[0-9]{9}$'
   and c.serie ~* '^E[0-9]{3}$'
 order by c.fecha;


-- ============================================================
--  4 · LA CONVERSIÓN — solo si el PDF dice «RECIBO POR HONORARIOS»
--
--  Descomenta las tres sentencias JUNTAS y córrelas de una vez: crean el RHE,
--  comprueban que se creó y solo entonces borran el comprobante. Partirlo deja
--  la posibilidad de borrar la factura sin haber insertado el recibo.
--
--  El `monto` va con el importe TOTAL y la retención en cero, que es lo que
--  dice el papel. El IGV se descarta: un recibo por honorarios no lo tiene, y
--  arrastrarlo sería mudar el error de tabla.
-- ============================================================

-- with nuevo as (
--   insert into rhe (persona_id, postulacion_id, numero, fecha, monto, retencion, concepto, url)
--   select p.id, c.postulacion_id, c.serie || '-' || c.numero, c.fecha,
--          c.importe, 0, c.concepto, c.url
--     from comprobante c
--     join personas p
--       on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in ('46273584', '10462735842')
--    where c.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--      and c.ruc = '10462735842'
--      /* No duplicar si ya se convirtió antes. */
--      and not exists (
--        select 1 from rhe x
--         where x.postulacion_id = c.postulacion_id
--           and x.persona_id = p.id
--           and x.numero = c.serie || '-' || c.numero)
--   returning id
-- )
-- delete from comprobante c
--  where c.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--    and c.ruc = '10462735842'
--    /* La condición que hace esto seguro: solo borra si el insert de arriba
--       produjo una fila. Sin ella, un `returning` vacío —persona inexistente,
--       RLS, lo que sea— borraría la factura y no dejaría nada en su lugar. */
--    and exists (select 1 from nuevo);

-- ── VERIFICAR DESPUÉS DE CONVERTIR ──
-- El comprobante debe haber desaparecido y el recibo existir.
-- select 'comprobante' as donde, count(*) from comprobante
--  where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad' and ruc = '10462735842'
-- union all
-- select 'rhe', count(*) from rhe x join personas p on p.id = x.persona_id
--  where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--    and regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in ('46273584','10462735842');

-- Y los totales del fondo, que tienen que MOVERSE de una columna a otra sin
-- que cambie la suma: 27 RHE y 7 comprobantes.
-- select (select count(*) from rhe where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as recibos,
--        (select sum(monto) from rhe where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as total_rhe,
--        (select count(*) from comprobante where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as comprobantes,
--        (select sum(importe) from comprobante where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad') as total_cmp;
