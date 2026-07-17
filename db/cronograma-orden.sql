-- ============================================================
--  Orden dentro del mismo día
--
--  El cronograma se ordena por `fecha_inicio`, y eso alcanza… hasta que dos
--  actividades caen el mismo día. En el proyecto P-086 hay cuatro el 18 de
--  julio:
--
--      Revisar y alistar equipos de filmación   18 jul
--      Rodaje cámara secundaria                 18 jul
--      Rodaje Cámara Principal                  18 jul
--      Foto fija y el detrás de cámaras (BTS)   18 jul
--
--  Entre ellas el orden lo decide Postgres, que no promete ninguno. Por eso
--  la cámara secundaria salía antes que la principal — nadie lo eligió.
--
--  Y un día de rodaje SÍ tiene orden: primero se alistan los equipos, después
--  rueda cámara A, después B. La fecha dice cuándo; el orden dice en qué
--  secuencia dentro de ese cuándo. Son dos cosas y faltaba una.
--
--  `orden` es un desempate, no un reemplazo: la fecha sigue mandando. Se
--  ordena por (fecha_inicio, orden, creado_en) — y ese último es el que
--  garantiza que dos con el mismo orden no bailen entre recargas.
-- ============================================================

alter table cronograma_actividades add column if not exists orden int default 0;

comment on column cronograma_actividades.orden is
  'Desempate dentro del mismo día. La fecha manda; esto ordena lo que cae junto. Menor primero.';

-- Semilla: respeta el orden que hay hoy para no barajar nada al publicar.
-- `row_number` por día, siguiendo el orden actual (fecha, creado_en).
with num as (
  select id,
         row_number() over (
           partition by coalesce(proyecto_id, convocatoria_id), fecha_inicio
           order by creado_en
         ) as n
    from cronograma_actividades
)
update cronograma_actividades c
   set orden = num.n * 10          -- ×10: deja hueco para intercalar sin renumerar
  from num
 where num.id = c.id
   and coalesce(c.orden, 0) = 0;

-- 👀 Cómo quedó el día que tenía cuatro
select nombre, etapa, fecha_inicio, orden
  from cronograma_actividades
 where proyecto_id = (select id from proyectos where folio = 'P-086')
 order by fecha_inicio, orden, creado_en;
