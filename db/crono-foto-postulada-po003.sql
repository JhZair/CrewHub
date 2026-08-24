-- ============================================================
--  db/crono-foto-postulada-po003.sql — LA FOTO, DONDE LA LEE EL EXPEDIENTE
--  PO-003 · Chaccu: Entre Lana y Tradicion en Pomacanchi
--
--  La pantalla del expediente (/entidad/postulacion/...) lee la foto de
--  `postulaciones.cronograma_postulado`, que en PO-003 esta VACIA. La foto si
--  existe, pero en `version_fondo` con etiqueta 'Postulado' — ahi la dejo
--  db/crono-arreglar-po003.sql al deshacer la duplicacion.
--  Este archivo la copia a la columna, que es de donde la lee el expediente.
--
--  ── POR QUE HAY DOS SITIOS PARA LA MISMA FOTO ──
--  Historia, no diseno: primero fue la columna (db/crono-postulacion.sql) y
--  despues llego el historial de versiones (db/version-fondo.sql), que trajo su
--  propio backfill EN SENTIDO CONTRARIO — de la columna a la tabla. PO-003 no
--  entro en ese backfill porque su columna estaba vacia. Aqui se hace el viaje
--  de vuelta, solo para este fondo.
--  Lo correcto a futuro es que el expediente lea `version_fondo` y la columna
--  se jubile. Mientras tanto, las dos tienen que decir lo mismo.
--
--  Idempotente: solo escribe si la columna esta vacia.
--  Correr en: Supabase -> SQL Editor.
-- ============================================================

update postulaciones p
   set cronograma_postulado    = v.datos,
       cronograma_postulado_en = v.creado_en
  from version_fondo v
 where v.postulacion_id = p.id
   and v.tipo = 'cronograma'
   and v.etiqueta = 'Postulado'
   and p.codigo = 'PO-003'
   and p.cronograma_postulado is null;

-- Verificar: 18 actividades y una fecha de fijado.
select p.codigo,
       p.cronograma_postulado_en,
       jsonb_array_length(coalesce(p.cronograma_postulado, '[]'::jsonb)) as en_la_foto,
       (select min((e->>'fecha_inicio')::date)
          from jsonb_array_elements(p.cronograma_postulado) e) as desde,
       (select max((e->>'fecha_fin')::date)
          from jsonb_array_elements(p.cronograma_postulado) e) as hasta
  from postulaciones p
 where p.codigo = 'PO-003';
