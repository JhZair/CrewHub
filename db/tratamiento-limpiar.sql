-- ============================================================
--  db/tratamiento-limpiar.sql — QUITAR LA COLUMNA VIEJA
--
--  db/tratamiento.sql dejó `proyecto_id` en las cuatro tablas del guion como
--  red: si la mudanza hubiera salido mal, ahí estaba de dónde venía cada fila.
--  La verificación salió limpia —0 huérfanos, 0 caracteres perdidos, y el
--  módulo no se había usado— así que la red sobra.
--
--  ── POR QUÉ NO SE PUEDE DEJAR «POR SI ACASO» ──
--  Porque son DOS FUENTES DE VERDAD sobre lo mismo. Con una película que tenga
--  dos tratamientos, cualquier consulta que siga filtrando por `proyecto_id`
--  devuelve las secuencias de LOS DOS mezcladas: no da error, no avisa, y el
--  tratamiento presentado a DAFO aparece con párrafos de la versión nueva
--  intercalados. Es el fallo más caro de los que este proyecto colecciona,
--  porque parece que funciona.
--  Quitándola, cualquier consulta vieja que quede falla RUIDOSAMENTE —«column
--  does not exist»— en vez de mentir en silencio.
--
--  ⚠ ES EL TERCER PASO, Y EL ORDEN IMPORTA:
--      1. db/tratamiento-soltar.sql   (quita el `not null` de `proyecto_id`)
--      2. git push  →  esperar el despliegue
--      3. ESTE archivo
--  Saltarse el 1 deja la escritura rota en cuanto se publique: el código nuevo
--  inserta sin `proyecto_id` y la columna sigue siendo obligatoria.
--  Correr ESTE antes del 2 deja a la aplicación sin la columna que pide.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ============================================================

-- ── 1. RED DE SEGURIDAD, QUE DE VERDAD PARA ──
--  ⚠ Un `select` aquí NO servía de red. El editor SQL de Supabase solo enseña
--  el resultado de la ÚLTIMA sentencia, así que el recuento de huérfanos no se
--  vería nunca y el `drop column` de abajo se ejecutaría igual — llevándose la
--  única columna que permitía recuperar esas filas.
--  Con `raise exception` el script ABORTA y no llega a borrar nada.
do $$
begin
  if exists (select 1 from guion_secuencias where tratamiento_id is null)
  or exists (select 1 from guion_actos      where tratamiento_id is null)
  or exists (select 1 from guion_hilos      where tratamiento_id is null)
  or exists (select 1 from guion_beats      where tratamiento_id is null)
  then
    raise exception 'Hay filas del guion sin tratamiento. Reasígnalas antes de continuar: %',
      'select count(*) from guion_secuencias where tratamiento_id is null';
  end if;
end $$;

-- ── 2. EL TRATAMIENTO PASA A SER OBLIGATORIO ──
--  Una secuencia sin tratamiento no es de ninguna película: no se puede abrir,
--  no se puede listar y nadie sabría que existe. Que la base lo impida es más
--  barato que descubrirla dentro de un año.
alter table guion_actos      alter column tratamiento_id set not null;
alter table guion_secuencias alter column tratamiento_id set not null;
alter table guion_hilos      alter column tratamiento_id set not null;
alter table guion_beats      alter column tratamiento_id set not null;

-- ── 3. FUERA LA COLUMNA VIEJA ──
alter table guion_actos      drop column if exists proyecto_id;
alter table guion_secuencias drop column if exists proyecto_id;
alter table guion_hilos      drop column if exists proyecto_id;
alter table guion_beats      drop column if exists proyecto_id;

/* Y la plantilla, que subió a `tratamiento.plantilla`. Dejarla en `proyectos`
   sería la misma trampa: dos tratamientos de la misma película pueden usar
   modelos estructurales distintos —es justo lo que se hace al reestructurar— y
   con la columna en el proyecto, cambiarla en uno la cambiaría en todos. */
alter table proyectos drop column if exists guion_plantilla;

-- ── VERIFICACIÓN ──
select
  (select count(*) from information_schema.columns
     where table_schema = 'public'
       and table_name in ('guion_actos','guion_secuencias','guion_hilos','guion_beats')
       and column_name = 'proyecto_id')                                  as quedan_proyecto_id,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'proyectos'
       and column_name = 'guion_plantilla')                              as queda_plantilla_vieja,
  (select count(*) from information_schema.columns
     where table_schema = 'public'
       and table_name in ('guion_actos','guion_secuencias','guion_hilos','guion_beats')
       and column_name = 'tratamiento_id' and is_nullable = 'NO')        as trat_obligatorio,
  (select count(*) from tratamiento)                                     as tratamientos;
-- quedan_proyecto_id = 0 · queda_plantilla_vieja = 0 · trat_obligatorio = 4
