-- ============================================================
--  ESTADOS DE CUENTA — PO-003 · Chaccu: Entre Lana y Tradición en Pomacanchi
--
--  Fuente: EE.CC.WILKAKALLE.pdf — 30 páginas, 15 estados mensuales del BCP,
--  cuenta 285-7032820-0-71 (soles) de la Asoc. Cultural Apu Wilkakalle.
--  Del 19/08/2024 (apertura) al 31/10/2025.
--
--  ── DE DÓNDE SALEN LOS NÚMEROS ──
--  No se transcribieron a mano: se leyeron del PDF y se generó este archivo.
--  Una tabla de quince meses copiada a ojo tiene un dedazo, y un dedazo en el
--  saldo de un fondo del Estado se descubre en la auditoría.
--
--  ── LAS DOS COMPROBACIONES QUE YA PASARON ──
--  1. La fórmula del propio banco (A+B+C-D-E+F-G=H) cuadra en los quince meses.
--  2. El saldo de cierre de cada mes es el de apertura del siguiente, sin
--     saltos. Eso es lo que prueba que no falta ningún estado: quince saldos
--     correctos con un mes ausente en medio se ven bien y mienten.
--  El paso 3 vuelve a comprobar la cadena YA DENTRO de la base, porque lo que
--  importa no es que el PDF cuadre: es que cuadre lo que quedó guardado.
--
--  ── QUÉ SE GUARDA EN `intereses` ──
--  Los intereses ACREEDORES (los que gana el fondo), que aquí son 0.00 en los
--  quince meses. Los DEUDORES —0.63 y 0.01, cargos del banco— no van en esa
--  columna: son un gasto, no un rendimiento, y sumarlos ahí inflaría lo que
--  hay que reportar como interés generado. Se dicen en la nota, que es donde
--  no engañan a ningún total.
--
--  ── LO QUE NO HACE ESTE ARCHIVO ──
--  No sube los PDF (`url` queda en null): el archivo hay que subirlo a Drive y
--  enlazarlo desde la pantalla. Y no toca `fecha_desembolso` — ver el paso 4,
--  que lo propone aparte porque cambia el plazo de rendición y eso merece un
--  clic consciente.
--
--  Correr en: Supabase → SQL Editor. Idempotente (upsert por mes).
-- ============================================================

-- ------------------------------------------------------------
--  El fondo. Se busca por su ID y se COMPRUEBA el código: si el id no fuera
--  el de PO-003, el insert se iría a otro fondo sin una sola queja, y quince
--  saldos ajenos en una rendición son un problema que nadie encontraría
--  buscando. Con el `and`, no encuentra nada y no escribe nada.
-- ------------------------------------------------------------
drop table if exists ee_cc_po003;
create table ee_cc_po003(periodo date, saldo numeric(12,2), intereses numeric(12,2), nota text);

/* El «;» va en su PROPIA línea, y no es un capricho de formato: cada fila
   termina en un comentario `--`, así que un punto y coma pegado al final de la
   última línea queda DENTRO del comentario. El insert no se cierra, y el error
   que se ve es «syntax error at or near select» treinta líneas más abajo —
   apuntando a una consulta que está perfecta. */
insert into ee_cc_po003(periodo, saldo, intereses, nota) values
  ('2024-08-01', -35.50, 0.00, 'Apertura de la cuenta 285-7032820-0-71 (soles, BCP) el 19/08/2024: el periodo arranca el 19, no el 1. El saldo cierra en negativo porque los S/ 5.00 de apertura no cubren los portes — el estímulo todavía no había llegado.'),   -- 19/08/2024–31/08/2024: abonos         5.00 · cargos       40.50
  ('2024-09-01', 177338.27, 0.00, 'Desembolso del estímulo: S/ 200,000.00 el 11/09/2024 por ventanilla (SUC LIMA, origen Banco de la Nación). Esta es la fecha desde la que corre el plazo de 2 años. Intereses deudores del mes: S/ 0.63.'),   -- 01/09/2024–30/09/2024: abonos   200,000.00 · cargos   22,625.60
  ('2024-10-01', 136978.27, 0.00, null),   -- 01/10/2024–31/10/2024: abonos         0.00 · cargos   40,360.00
  ('2024-11-01', 110936.47, 0.00, null),   -- 01/11/2024–30/11/2024: abonos         0.00 · cargos   26,041.80
  ('2024-12-01', 52872.52, 0.00, null),   -- 01/12/2024–31/12/2024: abonos         0.00 · cargos   58,063.95
  ('2025-01-01', 23832.02, 0.00, null),   -- 01/01/2025–31/01/2025: abonos         0.00 · cargos   29,040.50
  ('2025-02-01', 23791.52, 0.00, null),   -- 01/02/2025–28/02/2025: abonos         0.00 · cargos       40.50
  ('2025-03-01', 23751.02, 0.00, null),   -- 01/03/2025–31/03/2025: abonos         0.00 · cargos       40.50
  ('2025-04-01', 23710.52, 0.00, null),   -- 01/04/2025–30/04/2025: abonos         0.00 · cargos       40.50
  ('2025-05-01', 23670.02, 0.00, null),   -- 01/05/2025–31/05/2025: abonos         0.00 · cargos       40.50
  ('2025-06-01', 23629.52, 0.00, null),   -- 01/06/2025–30/06/2025: abonos         0.00 · cargos       40.50
  ('2025-07-01', 23589.02, 0.00, null),   -- 01/07/2025–31/07/2025: abonos         0.00 · cargos       40.50
  ('2025-08-01', 0.52, 0.00, 'El 20/08/2025 se transfirió S/ 23,548.00 a cuenta propia («TRANSFER CTAS PROPIAS», SUC CUZCO). La cuenta del fondo queda casi en cero.'),   -- 01/08/2025–31/08/2025: abonos         0.00 · cargos   23,588.50
  ('2025-09-01', -39.99, 0.00, 'Intereses deudores del mes: S/ 0.01. Cierra en negativo: la cuenta sigue cobrando portes con el fondo ya agotado.'),   -- 01/09/2025–30/09/2025: abonos         0.00 · cargos       40.50
  ('2025-10-01', -48.99, 0.00, 'Cierra en negativo: la cuenta sigue cobrando portes con el fondo ya agotado.')   -- 01/10/2025–31/10/2025: abonos         0.00 · cargos        9.00
;

-- ------------------------------------------------------------
-- 0 · ¿EXISTE EL FONDO Y ES EL QUE CREEMOS?
--     Si esto devuelve 0 filas, PARA: el resto no tiene a dónde escribir.
-- ------------------------------------------------------------
select p.id, p.codigo, p.estado, pr.nombre as proyecto, e.nombre as empresa
  from postulaciones p
  left join proyectos pr on pr.id = p.proyecto_id
  left join empresas  e  on e.id = p.empresa_id
 where p.id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and p.codigo = 'PO-003';

-- ------------------------------------------------------------
-- 1 · MIRAR — qué se va a escribir y qué había antes
--     Corre SOLO esto primero. «antes» en null = fila nueva; con valor y
--     distinto = se va a corregir, y conviene saber por qué.
-- ------------------------------------------------------------
select n.periodo,
       ec.saldo      as saldo_antes,
       n.saldo       as saldo_nuevo,
       ec.intereses  as int_antes,
       n.intereses   as int_nuevo,
       case when ec.id is null then 'nueva'
            when ec.saldo is distinct from n.saldo then '⚠ CAMBIA'
            else 'igual' end as que_pasa
  from ee_cc_po003 n
  left join estado_cuenta ec
    on ec.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and ec.periodo = n.periodo
 order by n.periodo;

-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     Descomenta y corre cuando el paso 1 te parezca bien.
--
--     `on conflict do update` y no `do nothing`: el estado de cuenta del banco
--     es la fuente de verdad de un saldo, así que si lo guardado difiere hay
--     que corregirlo. Pero la `url` NO se pisa —el enlace al PDF lo pone una
--     persona y este archivo no lo tiene— y la nota solo se rellena si estaba
--     vacía, para no borrar una anotación que alguien escribió a mano.
-- ------------------------------------------------------------
-- insert into estado_cuenta (postulacion_id, periodo, saldo, intereses, nota)
-- select 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad', n.periodo, n.saldo, n.intereses, n.nota
--   from ee_cc_po003 n
-- on conflict (postulacion_id, periodo) do update
--   set saldo     = excluded.saldo,
--       intereses = excluded.intereses,
--       nota      = coalesce(nullif(btrim(estado_cuenta.nota), ''), excluded.nota);

-- ------------------------------------------------------------
-- 3 · COMPROBAR LA CADENA, YA EN LA BASE
--     Cada mes debería empezar donde acabó el anterior. Esta consulta compara
--     el saldo de un mes con el del mes previo y enseña la diferencia: es el
--     movimiento neto del mes según lo guardado.
--     Y avisa de los HUECOS: si entre dos filas pasa más de un mes, falta un
--     estado de cuenta — y eso no se nota mirando los saldos, que siguen
--     pareciendo correctos.
-- ------------------------------------------------------------
select periodo,
       saldo,
       saldo - lag(saldo) over (order by periodo)            as movimiento_neto,
       case when lag(periodo) over (order by periodo) is null then 'primero'
            when periodo = (lag(periodo) over (order by periodo)) + interval '1 month' then 'ok'
            else '⚠ FALTA UN MES ANTES' end                   as continuidad
  from estado_cuenta
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
 order by periodo;

-- ------------------------------------------------------------
-- 4 · LA FECHA DE DESEMBOLSO (opcional, y a propósito aparte)
--     La ficha del fondo avisa de que falta, y el estado de cuenta la tiene:
--     el 11/09/2024 entraron los S/ 200,000 por ventanilla desde el Banco de
--     la Nación.
--
--     Va suelto y comentado porque NO es un dato más: de esa fecha cuelga el
--     plazo de 2 años de la rendición. Escribirla dentro del mismo lote la
--     habría cambiado de paso, sin que nadie decidiera cambiarla.
--
--     Comprobado: la columna es `postulaciones.fecha_desembolso`, la misma que
--     lee la ficha del fondo para calcular el plazo («Plazo (2 años)») y para
--     encender ese ⚠ que hoy está en la cabecera.
--     Con esta fecha, el plazo pasa a vencer el 11/09/2026 — y el aviso actual
--     dice «venció el 11/09/2025», que sale de `fecha_limite_rendicion`. Si las
--     dos no concuerdan, la que manda ante DAFO es la del acta: revisa cuál de
--     las dos hay que corregir ANTES de darlo por bueno.
-- ------------------------------------------------------------
-- update postulaciones
--    set fecha_desembolso = '2024-09-11'
--  where id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--    and codigo = 'PO-003'
--    and fecha_desembolso is null;   -- no pisa una fecha ya puesta a mano

-- ------------------------------------------------------------
-- 5 · LIMPIAR
--     Cuando los pasos 1 y 3 no tengan nada que objetar.
-- ------------------------------------------------------------
-- drop table if exists ee_cc_po003;
