-- ══════════════════════════════════════════════════════════════════════════
--  db/clearance-original.sql — DÓNDE ESTÁ EL PAPEL DE VERDAD
--
--  ⚠ EL SÉPTIMO DE LA SERIE. Correr después de los seis `clearance-*`.
--
-- ── EL PROBLEMA ──
-- Lo que se sube a `documento_firmado.archivo_url` es, casi siempre, UNA FOTO
-- del papel hecha con el móvil en la casa donde se firmó. Vale como prueba y
-- como respaldo, pero no es el documento: el original firmado a mano, con la
-- huella y el DNI escritos, está en un archivador físico.
--
-- Y esa diferencia importa justo cuando importa todo. Un fondo, una
-- aseguradora o un festival que pide ver el expediente acepta la foto para
-- revisar; el día que hay una disputa piden el original. Si nadie apuntó dónde
-- está, hay que buscarlo por la oficina meses o años después, y quien lo
-- archivó puede no estar.
--
-- Hasta hoy eso solo cabía en `nota`, que es texto libre: no se puede listar
-- «qué originales me faltan archivar» ni avisar de nada. Un dato dentro de una
-- frase es un dato que no existe.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ══════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1 · DÓNDE ESTÁ EL ORIGINAL
-- ------------------------------------------------------------
alter table documento_firmado add column if not exists ubicacion_original text;

comment on column documento_firmado.ubicacion_original is
  'Dónde está el papel firmado a mano: «archivador PACHA APUS, carpeta En '
  'busca del oro». Texto libre A PROPÓSITO — cada productora archiva a su '
  'manera y un vocabulario cerrado obligaría a inventar categorías que nadie '
  'usa. Lo que importa es que sea un CAMPO y no una frase dentro de la nota: '
  'así se puede listar qué originales faltan por archivar.';

-- ------------------------------------------------------------
-- 2 · Y SI LO SUBIDO ES EL ORIGINAL O UNA COPIA
--
--     ⚠ `not null default false`, y esto se pensó dos veces.
--
--     La primera versión lo dejó ANULABLE, con el argumento de siempre en este
--     módulo: «NULL = nadie lo dijo, que no es lo mismo que es una copia; un
--     booleano que nace en false convierte el silencio en una afirmación».
--     Buen argumento, y falso aquí: el único código que escribe esta columna
--     manda `!!d.esOriginalDigital`, o sea SIEMPRE un booleano. El tercer
--     estado no lo habría producido nadie, y habría desaparecido de las filas
--     viejas la primera vez que alguien editara ese papel por cualquier motivo.
--
--     Una promesa escrita en la base que el único escritor no cumple es peor
--     que no hacerla: el siguiente que lea el comentario contará con un matiz
--     que no existe. Así que se declara lo que de verdad pasa. El matiz —«esto
--     es una foto, el papel está en tal sitio»— vive donde puede vivir: en
--     `ubicacion_original`, que sí distingue el vacío de lo escrito.
-- ------------------------------------------------------------
alter table documento_firmado add column if not exists es_original_digital
  boolean not null default false;

comment on column documento_firmado.es_original_digital is
  'true = lo subido ES el documento: firmado digitalmente, o el escaneo que '
  'hace de ejemplar. false = es una foto o una copia, y dónde está el papel se '
  'dice en `ubicacion_original`. Nace en false porque una foto de móvil es lo '
  'normal y decir «esto es el original» tiene que costar un clic deliberado.';

-- ------------------------------------------------------------
-- 3 · UNA COPIA SIN DECIR DÓNDE ESTÁ EL ORIGINAL NO ES UN ERROR, ES UN AVISO
--
--     Deliberadamente SIN check. Se firma en campo, de noche, con el móvil: si
--     la base rechazara guardar la foto por no saber todavía en qué carpeta
--     acabará el papel, la foto no se guardaría — y una prueba que no se sube
--     por un campo que falta es peor que un campo vacío.
--     Se avisa en la pantalla, que es donde se puede resolver.
-- ------------------------------------------------------------

create index if not exists idx_docfirm_sin_original
  on documento_firmado(proyecto_id)
  where es_original_digital is not true
    and (ubicacion_original is null or ubicacion_original = '');

notify pgrst, 'reload schema';
/* ⚠ Sin esto PostgREST sigue con el esquema viejo en caché y el formulario
   responde PGRST204 sobre `ubicacion_original` DESPUÉS de haber corrido la
   migración, mandando a correr un archivo que ya está corrido. */

-- ------------------------------------------------------------
-- VERIFICAR — las dos columnas y el índice.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='documento_firmado'
      and column_name in ('ubicacion_original','es_original_digital'))
                                                          as columnas_debe_ser_2,
  (select count(*) from pg_indexes where schemaname='public'
     and indexname='idx_docfirm_sin_original')             as indice_debe_ser_1,
  (select count(*) from documento_firmado)                 as papeles_registrados,
  /* Los que ya están y todavía no dicen dónde vive su original. No es un
     fallo: es la lista de trabajo. */
  (select count(*) from documento_firmado
    where es_original_digital is not true
      and (ubicacion_original is null or ubicacion_original = ''))
                                                          as sin_decir_donde;
