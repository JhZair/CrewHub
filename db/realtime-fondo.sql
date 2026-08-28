-- ============================================================
--  LAS TABLAS DEL FONDO, EN TIEMPO REAL
--
--  Hallazgo al partir la ficha del fondo en rutas: la pantalla llevaba desde
--  el 21/07/2026 escuchando NUEVE tablas —rhe, estado_cuenta, movimiento_banco,
--  gasto_dj, comprobante, version_fondo, auditoria_financiera…— y ninguna de
--  ellas estaba en la publicación `supabase_realtime`. O sea: la suscripción se
--  abría, no daba error, y no llegaba un solo evento.
--
--  Nunca falló nada visible, y por eso nadie lo notó. Lo que sí producía era
--  una conclusión equivocada al leer el código: se creía que un comprobante
--  cargado en otro fondo refrescaba tu pantalla —el `Realtime` iba sin filtro—
--  cuando en realidad no refrescaba nada de nada. Se llegó a escribir eso en un
--  mensaje de commit antes de comprobarlo.
--
--  Esto añade a la publicación las tablas que las seis rutas escuchan. A partir
--  de aquí los filtros por `postulacion_id` que llevan esas rutas SÍ sirven para
--  algo: sin ellos, cada movimiento de cualquier fondo refrescaría la ficha de
--  todos los demás — que es el fallo que se creía tener y que empieza a ser
--  posible justo hoy.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    -- Las cinco formas de rendir y su bitácora
    'estado_cuenta', 'rhe', 'movimiento_banco', 'gasto_dj', 'comprobante',
    -- Las versiones del presupuesto y del cronograma
    'version_fondo',
    -- La vida del fondo y el acta
    'hito_fondo', 'compromiso_acta',
    -- El equipo previsto y el declarado
    'equipo_fondo', 'postulacion_equipo',
    -- La franja roja
    'alarmas'
  ]
  loop
    /* Solo si la tabla existe: este archivo se corre sobre bases que pueden no
       tener todas las migraciones, y un `alter publication` sobre una tabla
       ausente aborta el bloque entero y deja las demás fuera. */
    if exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = t)
       and not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

/* ── LO QUE ESTO NO ARREGLA ──
   `auditoria_financiera` se queda fuera a propósito: su `postulacion_id` vive
   dentro del JSON (`antes`/`despues`), y Realtime solo sabe filtrar por
   columnas. Publicarla obligaría a escucharla sin filtro, o sea a refrescar la
   ficha de un fondo con cada cambio de plata de cualquier otro. La bitácora se
   ve al recargar, que para lo que es —un registro que se consulta cuando algo
   no cuadra— es suficiente. */

select tablename as "ya publicadas"
  from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'public'
 order by tablename;
