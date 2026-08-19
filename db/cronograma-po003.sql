-- ============================================================
--  db/cronograma-po003.sql — EL CRONOGRAMA FINAL DE LA PLATAFORMA DAFO
--
--  De `CronogramaFinalchaccuPlatafroma.pdf`: el Gantt que se presentó y que
--  rige la ejecución. Va al cronograma VIVO de la postulación
--  (`cronograma_actividades.postulacion_id`), que es de donde /fondo lo lee.
--
--  ── CÓMO SE LEYERON LAS FECHAS ──
--  El PDF no trae fechas en texto: son BARRAS dibujadas sobre una rejilla de
--  diez meses. Así que se leyó la geometría —el rectángulo de cada barra y las
--  celdas de cabecera de cada mes— y se interpoló la posición a día del mes.
--  Cada columna vale un mes completo, así que una barra que empieza a un tercio
--  de la columna de octubre empieza alrededor del 10 de octubre.
--
--  ⚠ SON FECHAS APROXIMADAS AL DÍA, y conviene saberlo antes de usarlas para
--  algo que dependa de un día exacto. El Gantt tiene resolución de semana como
--  mucho: no dice «del 7 al 24 de noviembre», dice «tres semanas de noviembre».
--  El mes y el orden son fieles; el día es la mejor lectura posible del dibujo.
--
--  ── SOLO LOS 18 GRUPOS, NO LAS 44 SUBTAREAS ──
--  El Gantt tiene dos niveles: dieciocho grupos con su barra oscura y, debajo,
--  subtareas con barras claras en escalera. Los grupos se leen sin ambigüedad
--  —una barra, un grupo, mismo orden— y se cargan.
--  Las subtareas NO. Sus barras van escalonadas dentro de la misma banda de
--  fila del PDF y no se pueden atribuir una a una sin adivinar cuál es de cuál.
--  Cargarlas repartiendo el rango del grupo entre todas habría llenado el
--  cronograma de 44 fechas inventadas con aspecto de dato. Están en el PDF,
--  que sigue siendo la fuente; si hacen falta, se teclean mirándolo.
--
--  ── EL MAPEO DE ETAPAS ──
--  El Gantt agrupa en Pre Producción / Producción / Post Producción /
--  Socialización. El catálogo de la categoría «Documental» usa
--  preproduccion / produccion / postproduccion / entrega, y así se traducen.
--  «Investigación» se queda en `preproduccion` —no en la etapa `investigacion`
--  que el catálogo también ofrece— porque el Gantt la bandea explícitamente
--  bajo Pre Producción. Manda el documento, no lo que encajaría mejor.
--
--    · Pre Producción    5 actividades  2024-08-01 → 2024-12-31
--    · Producción        4 actividades  2024-12-24 → 2025-01-31
--    · Post Producción   6 actividades  2025-02-01 → 2025-04-30
--    · Socialización     3 actividades  2025-05-01 → 2025-05-31
--
--  ⚠ El cronograma llega hasta MAYO 2025 y el plazo del acta vencía el
--  11/09/2025. Es decir: el plan terminaba casi cuatro meses antes del límite.
--  Lo que pasó después —los 20 recibos girados entre agosto y octubre de 2025—
--  no está en este cronograma, y esa distancia entre lo planeado y lo ocurrido
--  es justo lo que la pantalla podrá enseñar una vez cargado.
--
--  Idempotente: el `not exists` impide duplicar si se corre dos veces.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='cronograma_actividades'
                    and column_name='postulacion_id') then
    raise exception 'Falta cronograma_actividades.postulacion_id: corre antes db/crono-postulacion.sql';
  end if;
end $$;

drop table if exists crono_po003;
create table crono_po003(nombre text, etapa text, ini date, fin date, orden int);

insert into crono_po003(nombre, etapa, ini, fin, orden) values
('Investigación','preproduccion','2024-08-01','2024-12-08',10),
('Desarrollo del Concepto','preproduccion','2024-10-01','2024-12-01',20),
('Planeación y Logística','preproduccion','2024-11-07','2024-11-24',30),
('Taller de Formación Audiovisual','preproduccion','2024-10-01','2024-12-31',40),
('Preparación Técnica','preproduccion','2024-12-01','2024-12-31',50),
('Seguridad y Ética','produccion','2024-12-24','2024-12-31',60),
('Gestión en el Sitio','produccion','2025-01-01','2025-01-06',70),
('Filmación / Rodaje','produccion','2025-01-01','2025-01-31',80),
('Captura de Audio','produccion','2025-01-01','2025-01-31',90),
('Edición','postproduccion','2025-02-01','2025-04-12',100),
('PostProducción de Audio','postproduccion','2025-03-01','2025-03-31',110),
('Corrección de Color','postproduccion','2025-04-01','2025-04-12',120),
('Títulos, Gráficos y Efectos Visuales','postproduccion','2025-04-07','2025-04-12',130),
('Revisión y Ajuste Finales','postproduccion','2025-04-13','2025-04-30',140),
('Exportación Final','postproduccion','2025-04-25','2025-04-30',150),
('Presentación del Documental','entrega','2025-05-01','2025-05-16',160),
('Seguimiento y Evaluación','entrega','2025-05-16','2025-05-23',170),
('Entrega Final a Dafo','entrega','2025-05-24','2025-05-31',180)
;


-- ------------------------------------------------------------
-- 1 · MIRAR — no escribe nada
--     Debe dar 18 actividades, de 2024-08-01 a 2025-05-31, y `ya_estaba` en
--     «nueva» para todas. Si alguna dice «YA CARGADA», el cronograma ya tiene
--     esa actividad y este archivo la respetará.
-- ------------------------------------------------------------
select c.orden, c.nombre, c.etapa, c.ini, c.fin,
       (c.fin - c.ini + 1) as dias,
       case when x.id is null then 'nueva' else 'YA CARGADA' end as ya_estaba
  from crono_po003 c
  left join cronograma_actividades x
    on x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and x.nombre = c.nombre
 order by c.orden;

-- Y lo que ya hubiera en el cronograma de este fondo, para no cargar encima
-- de otro sin verlo. Lo esperado es cero filas.
select count(*) as actividades_ya_existentes
  from cronograma_actividades
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';


-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     `fuente = 'seatable'` no: esto viene de la plataforma de DAFO, así que
--     va como `bases_concurso` — es un plan presentado al Ministerio, no una
--     ventana de trabajo que nos inventamos. `clase` sí es 'trabajo': son
--     tramos de ejecución, no hitos con fecha fija del Ministerio.
-- ------------------------------------------------------------
insert into cronograma_actividades
  (postulacion_id, nombre, etapa, fecha_inicio, fecha_fin, orden, estado, clase, fuente)
select 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad', c.nombre, c.etapa, c.ini, c.fin, c.orden,
       /* `finalizada` sería mentir: nadie ha dicho que se hiciera. `planificada`
          es lo que el documento afirma —esto se planeó— y deja que la ejecución
          real la marque quien la vea. */
       'planificada', 'trabajo', 'bases_concurso'
  from crono_po003 c
 where not exists (
   select 1 from cronograma_actividades x
    where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
      and x.nombre = c.nombre);


-- ------------------------------------------------------------
-- 3 · VERIFICAR — 18 actividades, del 01/08/2024 al 31/05/2025
-- ------------------------------------------------------------
select count(*) as actividades,
       min(fecha_inicio) as arranca, max(fecha_fin) as termina,
       count(*) filter (where etapa = 'preproduccion')  as pre,
       count(*) filter (where etapa = 'produccion')     as prod,
       count(*) filter (where etapa = 'postproduccion') as post,
       count(*) filter (where etapa = 'entrega')        as entrega
  from cronograma_actividades
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';

-- Ninguna con fecha invertida ni sin etapa. CERO filas.
select nombre, etapa, fecha_inicio, fecha_fin
  from cronograma_actividades
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and (fecha_fin < fecha_inicio or etapa is null);


-- ------------------------------------------------------------
-- 4 · LO PLANEADO CONTRA LO GASTADO
--     Con el cronograma cargado, los RHE por fin pueden colgarse de una etapa.
--     Esta consulta enseña cuántos recibos caen FUERA de toda ventana del
--     cronograma: en PO-003 son los girados después de mayo de 2025, que es
--     donde el plan se acaba y la ejecución siguió.
-- ------------------------------------------------------------
select count(*) as recibos_fuera_del_cronograma,
       sum(monto) as total,
       min(fecha) as primero, max(fecha) as ultimo
  from rhe x
 where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and not exists (
     select 1 from cronograma_actividades a
      where a.postulacion_id = x.postulacion_id
        and x.fecha between a.fecha_inicio and a.fecha_fin);


-- ------------------------------------------------------------
-- 5 · LIMPIAR
-- ------------------------------------------------------------
-- drop table if exists crono_po003;
