-- ============================================================
--  ¿Está todo corrido?  — chequeo del estado de la base
--
--  Solo LEE. Compara lo que el código espera contra lo que existe.
--  Correr después de cada ronda de SQL, o cuando haya dudas.
--  Si algo sale ❌, el archivo que lo crea está en esta misma carpeta.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · ESTRUCTURA — columnas, tablas y funciones que el código usa
-- ------------------------------------------------------------
with esperado(clase, obj, para, archivo) as (values
  -- Personas
  ('col', 'personas.firma_url',                 'Firma escaneada',            'persona-firma.sql'),
  ('col', 'personas.foto_url',                  'Foto del perfil',            'persona-foto.sql'),
  ('col', 'personas.dni_url',                   'DNI escaneado',              'persona-firma.sql'),
  ('col', 'personas.dni_vencimiento',           'Vencimiento del DNI',        'persona-sunat.sql'),
  ('col', 'personas.estado_sunat',              'SUNAT de personas',          'persona-sunat.sql'),
  ('col', 'personas.condicion_sunat',           'SUNAT de personas',          'persona-sunat.sql'),
  ('col', 'personas.fecha_verificacion_sunat',  'SUNAT de personas',          'persona-sunat.sql'),
  ('col', 'personas.fecha_verificacion_reniec', 'RENIEC: cuándo se verificó', 'persona-reniec.sql'),
  ('col', 'personas.nombre_reniec',             'RENIEC: nombre oficial',     'persona-reniec.sql'),
  ('col', 'personas.suspension_4ta_anio',       'Suspensión 4ta por año',     'suspension-4ta-anio.sql'),
  ('col', 'personas.suspension_4ta_url',        'Constancia de la 4ta',       'suspension-4ta-url.sql'),
  ('col', 'personas.suspension_4ta_acumulado',  'Acumulado declarado',        'rhe.sql'),
  ('col', 'personas.suspension_4ta_proyectado', 'Proyectado declarado',       'rhe.sql'),
  ('col', 'personas.carpeta_drive_url',         'Carpeta en Drive',           'persona-cv.sql'),
  -- Empresas
  ('col', 'empresas.relacion',                  'propia | aliada | externa',  'empresa-relacion.sql'),
  -- Feed
  ('col', 'publicaciones.destacado_hasta',      'Destacados que caducan',     'destacados.sql'),
  -- Tablas
  ('tab', 'persona_cv',        'CV por enfoque (legacy: migrado a objetos)', 'persona-cv.sql'),
  ('tab', 'objetos',           'Repositorio: la cola infinita de cada entidad', 'repositorio.sql'),
  ('col', 'comentarios.objeto_id',   'Comentar un objeto sin abrir un caso', 'objeto-comentarios.sql'),
  ('col', 'notificaciones.objeto_id','Que el aviso de ese comentario lleve a algún sitio', 'objeto-comentarios.sql'),
  ('tab', 'rhe',               'Recibos por honorarios',            'rhe.sql'),
  ('tab', 'credencial_datos',  'Datos sueltos de cada credencial',  'credencial-datos.sql'),
  ('tab', 'jornadas',          'Jornadas del equipo',               'jornadas.sql'),
  ('tab', 'liquidaciones',     'Cierre mensual',                    'liquidaciones.sql'),
  -- Expediente de pago: sin estas columnas, /admin pinta como «abierto» un mes
  -- ya liquidado y ofrece volver a liquidarlo. Por eso están aquí.
  ('col', 'rhe.liquidacion_id',          'Qué mes paga el recibo',    'pagos-expediente.sql'),
  ('col', 'rhe.pagado_en',               'Cuándo se pagó',            'pagos-expediente.sql'),
  ('col', 'rhe.pagado_url',              'El voucher del pago',       'pagos-expediente.sql'),
  ('col', 'rhe.pagado_medio',            'Transferencia/efectivo/…',  'pagos-expediente.sql'),
  ('col', 'rhe.girado_por',              'Oficina/delegado/propio',   'pagos-expediente.sql'),
  ('col', 'perfiles.es_finanzas',        'Registra RHE de terceros',  'rhe-permisos.sql'),
  ('fun', 'rhe_es_mio',                  '¿El RHE es de quien entra?','rhe-permisos.sql'),
  ('fun', 'es_finanzas',                 'Rol de administración',     'rhe-permisos.sql'),
  ('col', 'liquidaciones.cerrado_en',    'Expediente cerrado',        'pagos-expediente.sql'),
  -- Declaraciones juradas: el tope que evita devolver plata (acta, cl. 6.9).
  ('tab', 'gasto_dj',                    'Gastos declarados sin comprobante', 'declaraciones-juradas.sql'),
  ('col', 'convocatorias.tope_dj_pct',   'Tope de DJ del concurso',   'declaraciones-juradas.sql'),
  ('col', 'postulaciones.tope_dj_pct',   'Tope de DJ del acta',       'declaraciones-juradas.sql'),
  -- La tercera forma de rendir. Sin ella, una factura acaba cargada como DJ y
  -- consume un tope que no le toca.
  ('tab', 'comprobante',                 'Facturas y boletas de proveedor', 'facturas.sql'),
  -- Funciones
  ('fun', 'nrm_nombre',        'Comparar nombres sin tildes',       'personas-duplicadas.sql'),
  ('fun', 'persona_refs',      'Qué cuelga de una persona',         'personas-duplicadas.sql'),
  ('fun', 'qhaway_matutino',   'La ronda de las 7:30',              'qhaway-matutino.sql')
)
select case when ok then '✅' else '❌ FALTA' end as estado,
       obj, para, archivo
  from (
    select e.*,
      case e.clase
        when 'col' then exists (
          select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = split_part(e.obj, '.', 1)
             and column_name = split_part(e.obj, '.', 2))
        when 'tab' then exists (
          select 1 from information_schema.tables
           where table_schema = 'public' and table_name = e.obj)
        when 'fun' then exists (
          select 1 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = e.obj)
      end as ok
    from esperado e
  ) z
 order by ok, obj;


-- ------------------------------------------------------------
-- 2 · ¿Qué versión de la ronda matutina está viva?
--     Busca marcas que solo tiene la versión nueva.
-- ------------------------------------------------------------
select
  case when prosrc ilike '%DNI DEL EQUIPO%' then '✅ secciones nuevas'
       else '❌ falta correr db/qhaway-matutino.sql' end as formato,
  case when prosrc ilike '%coalesce(relacion%' then '✅ ignora aliadas y externas'
       else '❌ alerta de empresas que no son nuestras' end as regla_sunat,
  case when prosrc ilike '%tipo in (''personal'',''colaborador'')%' then '✅ solo DNI del equipo'
       else '❌ pide DNI a contactos y vetados' end as regla_dni,
  case when prosrc ilike '%then ''abierta'' else ''en_progreso''%' then '✅ avisos nacen vigentes'
       else '❌ los avisos nacen en_progreso' end as regla_avisos
  from pg_proc where proname = 'qhaway_matutino';


-- ------------------------------------------------------------
-- 3 · DATOS — lo que se corrigió una vez y debería quedar en cero
-- ------------------------------------------------------------
select 'Hitos que aún avisan a 7 días' as pendiente,
       count(*) as cuantos, 'db/hitos-anticipacion.sql' as archivo
  from cronograma_actividades
 where clase = 'hito_externo' and dias_anticipacion = 7
union all
select 'Avisos en estado imposible (en_progreso)',
       count(*), 'db/hitos-anticipacion.sql · paso 2'
  from publicaciones where tipo = 'aviso' and estado = 'en_progreso'
union all
select 'Personas duplicadas por nombre',
       (select count(*) from (
          select 1 from personas group by nrm_nombre(nombre) having count(*) > 1) x),
       'db/personas-duplicadas.sql'
union all
select 'Roles sin normalizar',
       (select count(*) from personas, unnest(string_to_array(rol, ',')) r
         where btrim(r) in ('Sonido', 'Operador/a de Sonido', 'Actor', 'Fotógrafo(a)',
                            'Programador', 'Traducción / Intérprete', 'Traductor/a Quechua',
                            'Ilustrador', 'Contador', 'Investigación')),
       'db/roles-normalizar.sql'
 order by 2 desc;


-- ------------------------------------------------------------
-- 4 · LOS DOS RELOJES — SUNAT tiene que correr ANTES que el bot
--     El de Vercel no vive aquí: se mira en vercel.json.
--     Hoy debe decir "0 11 * * *" (11:00 UTC = 6:00 Lima).
-- ------------------------------------------------------------
select jobname, schedule,
       case when jobname = 'qhaway-matutino' and schedule = '30 12 * * *'
            then '✅ 7:30 Lima — con SUNAT a las 6:00 hay margen'
            else '⚠ revisar que SUNAT (vercel.json) corra antes' end as nota
  from cron.job;
