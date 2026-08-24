-- ============================================================
--  db/crono-mover-po001.sql — EL CRONOGRAMA, DE VUELTA A SU DUENIO
--  PO-001 · Mujeres del Ande: Voces que Transforman
--
--  Mueve las actividades de `proyecto_id` a `postulacion_id`. NO copia: mueve.
--  Al terminar hay las mismas filas que antes, con otro dueno.
--
--  ── POR QUE ──
--  El cronograma de un fondo nace en la POSTULACION y sigue ahi cuando el
--  fondo se gana: esa es la regla del sistema y esta escrita en
--  db/crono-postulacion.sql — «cada postulacion arma SU propio cronograma; al
--  enviarlo a DAFO se congela una foto; si el fondo se gana, el vivo se sigue
--  editando». La pagina del fondo lee `postulacion_id`, y por eso hoy
--  /fondo/PO-001 no ve las 26 actividades que si se ven en /proyecto.
--
--  El camino corto habria sido cargar una segunda lista bajo el otro dueno.
--  Es lo que le paso a PO-003, que hoy tiene 36 filas: las mismas 18
--  actividades dos veces, con nombres distintos y fechas corridas entre uno y
--  cuatro meses. Nadie lo hizo mal a proposito — se ve bien en las dos
--  pantallas. Pero son dos verdades sobre cuando se rueda, y la proxima vez
--  que alguien mueva una fecha la mueve en una sola. Aqui se mueve, no se
--  copia, justo para no heredar eso.
--
--  ── POR QUE SE MUEVEN LAS 26 Y NO UNA SELECCION ──
--  `proyecto_id` NO es un dueno equivocado: es el correcto para el trabajo
--  propio del proyecto —una cobertura contratada, un encargo, el plan
--  general—. Un proyecto puede tener su cobertura de marzo Y, aparte, la
--  ejecucion de un DAFO. Por eso este `update` no puede ser un barrido ciego:
--  llevarse una cobertura contratada al fondo la pondria a rendirse contra un
--  estimulo que no la pago.
--
--  Se revisaron las 26 filas (24/08/2026) y TODAS son ejecucion del fondo.
--  No es una impresion: casi todas citan una clausula del acta 139-2025-DAFO
--    · Capacitacion en hostigamiento sexual (antes del rodaje)   -> 6.4
--    · Elaboracion de informe economico y narrativo              -> 5.2
--    · Entrega de material final al Ministerio de Cultura        -> 5.3
--    · Accion de devolucion a la ciudadania (sin prorroga)       -> 5.6
--    · Creacion de subtitulos (dialogos y SDH)                   -> 5.3.4.2
--    · Elaboracion de trailer                                    -> 5.3.5
--  Reparto: 7 preproduccion, 4 produccion, 9 postproduccion, 3 entrega,
--  3 administracion. 9 finalizadas, 1 materializada, el resto planificadas.
--
--  SI VUELVES A USAR ESTE ARCHIVO PARA OTRO FONDO: repite esa revision. El
--  paso 1 te dice cuantas se van a mover, pero no cuales son — eso hay que
--  leerlo. Un barrido por `proyecto_id` es seguro solo cuando alguien miro la
--  lista.
--
--  ── UNA FILA QUE VIENE CON LA FECHA MAL ──
--  «🧱 Plazo maximo de ejecucion DAFO» esta fechada el 31/12/2027. El plazo
--  real es el 05/01/2028 (desembolso 05/01/2026 + dos anios, clausula 7.2).
--  Esta en `cancelada`, asi que no molesta, pero es un resto de cuando se
--  asumia otro plazo. Se mueve igual que las demas —no se corrige aqui, que
--  este archivo mueve y no edita— y esa regla ya vive en la pestania
--  Entregables con su clausula al lado, asi que probablemente sobre.
--
--  ── DOS COSAS QUE ESTE CAMBIO ROMPE, Y HAY QUE ATENDER DESPUES ──
--
--  1) LA PESTANIA «CRONO» DEL PROYECTO SE VACIA.
--     app/entidad/[tipo]/[id]/page.tsx lee `.eq("proyecto_id", ...)`, asi que
--     al mover las filas deja de encontrarlas. Es lo buscado —el cronograma
--     de un fondo no vive en el proyecto— pero la pantalla no lo explica: se
--     vera como si se hubiera borrado. Hace falta que esa pestania lea el
--     cronograma de las postulaciones del proyecto, o que diga donde esta.
--
--  2) QHAWAY DEJA DE VIGILARLAS, Y NO AVISA DE QUE DEJO.
--     `qhaway_matutino()` excluye `postulacion_id` explicitamente: cuando se
--     escribio esa regla, un cronograma de postulacion era una PROPUESTA —lo
--     que prometes si ganas— y no habia trabajo que abrir. Ganado el fondo ya
--     no es una promesa: es la ejecucion. Con estas 26 filas movidas, el bot
--     deja de materializar casos y de avisar de desfases para PO-001.
--     El arreglo es que vigile las postulaciones GANADORAS en vez de excluir
--     `postulacion_id` entero. Mientras no se haga, ESTE FONDO NO TIENE
--     VIGILANCIA AUTOMATICA. Queda escrito aqui para que no se pierda: la
--     averia de los ocho dias mudos (23-30/07/2026) nacio de una version de
--     este mismo despiste.
--
--  Idempotente: al correrlo dos veces la segunda no encuentra nada que mover.
--  Correr en: Supabase -> SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · MIRAR ANTES DE MOVER
--     `postulaciones_del_proyecto` TIENE QUE SER 1. Si es mas, PARA: las
--     filas colgadas del proyecto no dicen a que postulacion pertenecen, y
--     mandarlas todas a PO-001 seria adivinar. Con dos postulaciones hay que
--     repartirlas a mano.
--     `ya_materializadas` son las que tienen un caso abierto o cerrado: el
--     caso NO se pierde al mover (la fila conserva su publicacion_id), pero
--     conviene saber cuantas son.
-- ------------------------------------------------------------
select p.codigo,
       pr.nombre as proyecto,
       (select count(*) from postulaciones p2 where p2.proyecto_id = p.proyecto_id)
         as postulaciones_del_proyecto,
       count(ca.id)                                              as se_van_a_mover,
       count(ca.id) filter (where ca.publicacion_id is not null) as ya_materializadas,
       count(ca.id) filter (where ca.estado = 'finalizada')       as finalizadas,
       min(ca.fecha_inicio) as desde,
       max(ca.fecha_fin)    as hasta,
       (select count(*) from cronograma_actividades c2 where c2.postulacion_id = p.id)
         as ya_en_la_postulacion
  from postulaciones p
  join proyectos pr on pr.id = p.proyecto_id
  left join cronograma_actividades ca on ca.proyecto_id = p.proyecto_id
 where p.codigo = 'PO-001'
 group by p.codigo, pr.nombre, p.proyecto_id, p.id;

-- Si `ya_en_la_postulacion` no es 0, PARA: habria dos listas y este archivo
-- las juntaria en una sin comparar nada.

-- ------------------------------------------------------------
-- 2 · MOVER
--     Una sola sentencia. El proyecto se resuelve DESDE la postulacion, asi
--     que si 'PO-001' no existiera no encuentra nada y no toca ninguna fila,
--     en vez de mover el cronograma de otro proyecto.
--     `proyecto_id = null` no es opcional: la regla de la tabla es un dueno
--     por fila, y dejar los dos llenos hace que la actividad salga en las dos
--     pantallas — que es la duplicacion que este archivo viene a evitar.
-- ------------------------------------------------------------
update cronograma_actividades ca
   set postulacion_id = po.id,
       proyecto_id    = null
  from (select id, proyecto_id from postulaciones where codigo = 'PO-001') po
 where ca.proyecto_id = po.proyecto_id;

-- ------------------------------------------------------------
-- 3 · VERIFICAR
--     `en_la_postulacion` tiene que ser 26 y `en_el_proyecto` 0.
--     `con_dos_duenios` tiene que ser 0 SIEMPRE: una fila con dos dueños se
--     pinta dos veces y no da ningun error.
-- ------------------------------------------------------------
select count(*) filter (where ca.postulacion_id = p.id)      as en_la_postulacion,
       count(*) filter (where ca.proyecto_id = p.proyecto_id) as en_el_proyecto,
       count(*) filter (where ca.postulacion_id is not null
                         and ca.proyecto_id is not null)      as con_dos_duenios,
       count(*) filter (where ca.publicacion_id is not null)  as conservan_su_caso
  from postulaciones p
  join cronograma_actividades ca
    on ca.postulacion_id = p.id or ca.proyecto_id = p.proyecto_id
 where p.codigo = 'PO-001';

-- ------------------------------------------------------------
-- 4 · LAS ACTIVIDADES, COMO LAS VERA LA FICHA DEL FONDO
-- ------------------------------------------------------------
select ca.etapa, ca.orden, ca.fecha_inicio, ca.fecha_fin, ca.estado, ca.nombre
  from cronograma_actividades ca
  join postulaciones p on p.id = ca.postulacion_id
 where p.codigo = 'PO-001'
 order by ca.etapa, ca.orden, ca.fecha_inicio;
