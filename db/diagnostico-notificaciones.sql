-- ============================================================
--  ¿POR QUÉ UN AVISO NO LLEVA A NINGUNA PARTE?
--
--  Síntoma: la campanita muestra el aviso, se lee bien, y al pulsarlo no
--  pasa nada. Sin error, sin nada en la consola.
--
--  Causa casi siempre la misma: la consulta de notificaciones pide unas
--  columnas OPCIONALES y, si a la base le falta alguna, PostgREST rechaza la
--  consulta entera. La aplicación reintenta sin ellas —para que la bandeja no
--  se caiga por una migración pendiente de otro módulo— y ahí está el
--  problema: sin `dafo_id`, el aviso llega sin saber a qué correo pertenece, y
--  un aviso sin destino no es clicable.
--
--  Solo LEE. Dice qué falta y qué archivo lo trae.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · LAS COLUMNAS QUE LA CONSULTA PIDE
--     Si alguna sale ❌, ese es el motivo: córrela y el clic vuelve.
-- ------------------------------------------------------------
with esperado(col, para, archivo) as (values
  ('publicacion_id',     'llevar al caso',                    'schema base'),
  ('objeto_id',          'llevar al objeto del repositorio',  'db/objeto-comentarios.sql'),
  ('prestamo_id',        'llevar al equipo prestado',         'db/prestamos.sql'),
  ('equipamiento_id',    'llevar a la bitácora del equipo',   'db/equipo-bitacora.sql'),
  ('dafo_id',            'llevar al correo de la casilla',    'db/casilla-dafo.sql'),
  ('comentario_id',      'llevar al comentario exacto',       'db/notif-comentario.sql'),
  ('postulacion_id',     'llevar a la postulación',           'db/postulacion-interaccion.sql'),
  ('movimiento_caja_id', 'llevar al apunte de caja',          'db/movcaja-comentarios.sql')
)
select case when c.column_name is null then '❌ FALTA' else '✅' end as estado,
       e.col, e.para, e.archivo
  from esperado e
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = 'notificaciones'
   and c.column_name = e.col
 order by (c.column_name is not null), e.col;


-- ------------------------------------------------------------
-- 2 · ¿LOS AVISOS DE DAFO GUARDAN SU CORREO?
--     Si `sin_dafo_id` no es cero, esos avisos nacieron sin destino y no hay
--     columna que los salve: se crearon antes de que existiera, o la ingesta
--     falló al escribirla. Los nuevos sí lo llevarán.
-- ------------------------------------------------------------
select count(*)                                   as avisos_dafo,
       count(*) filter (where dafo_id is null)     as sin_dafo_id,
       min(creado_en)                              as el_mas_viejo,
       max(creado_en)                              as el_mas_nuevo
  from notificaciones
 where tipo in ('dafo', 'dafo_accion');


-- ------------------------------------------------------------
-- 3 · Y SI LO LLEVAN, ¿EL CORREO SIGUE EXISTIENDO?
--     Un `dafo_id` que apunta a una fila borrada da una ruta válida hacia
--     algo que no está: la casilla abriría y no encontraría el ancla.
-- ------------------------------------------------------------
select count(*) as avisos_apuntando_a_un_correo_que_ya_no_esta
  from notificaciones n
 where n.dafo_id is not null
   and not exists (select 1 from dafo_comunicaciones d where d.id = n.dafo_id);
