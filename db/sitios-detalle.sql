-- ============================================================
--  db/sitios-detalle.sql
--
--  EL SITIO, CON SU TIPO, SU CLAVE Y SU POSICIÓN.
--
--  db/sitios.sql dejó la jerarquía —un cajón dentro de un mueble
--  dentro de una oficina— y un nombre. Con una sola oficina bastaba.
--  Con varias oficinas y almacenes no: hacen falta tres cosas más, y
--  las tres estaban en la tabla que se propuso a mano.
--
--  ── 1 · EL TIPO ──
--  Una oficina, un mueble y un cajón no son lo mismo aunque los tres
--  sean «sitios». El tipo decide el ícono, la clave que se sugiere y
--  qué se ofrece crear dentro. Texto y no un enum de Postgres: añadir
--  «vitrina» tiene que ser una línea de código, no una migración.
--
--  ── 2 · LA CLAVE, Y POR QUÉ NO EL CÓDIGO ENTERO ──
--  ⚠ ESTO ES LO IMPORTANTE. La propuesta traía una columna `código` con
--  «OF01-M01-C01» escrito en cada fila. Ese código YA lo dice la
--  cadena: Oficina 01 → Mueble 01 → Cajón 01. Guardado aparte son dos
--  verdades que hay que mantener de acuerdo, y la segunda se rompe sin
--  dar error: mueves el Mueble 01 a otra oficina y sus doce cajones
--  siguen diciendo OF01 para siempre.
--
--  Así que cada sitio guarda SOLO SU TRAMO —«OF01», «M01», «C01»— y el
--  código completo se arma subiendo la cadena, igual que ya se arma la
--  ruta «Depósito › Cajón 08». Se puede copiar, pegar en una etiqueta
--  y buscar por él; lo que no puede es contradecir a la jerarquía,
--  porque no es un dato aparte.
--
--  La clave se repite entre ramas a propósito: «C01» es el Cajón 01 del
--  Mueble 01 y también el Compartimiento 01 de la oficina. No hay
--  ambigüedad porque el nivel lo dice el sitio en la cadena — es
--  exactamente lo que hacía la propuesta con OF01-M01-C01 y
--  OF01-C01-E01. Por eso el único es POR PADRE.
--
--  ── 3 · FILA Y COLUMNA, NÚMEROS ──
--  «Fila 1 · Columna 1», «Nivel superior», «Superior izquierdo» son la
--  misma cosa dicha de tres maneras: una posición en una rejilla. Un
--  estante es fila 3 columna 1; «superior izquierdo» es fila 1 columna
--  1 de un 3×3. Como números ordenan solos y —lo que de verdad paga—
--  dejan DIBUJAR el mueble: abrir el Mueble 01 y ver sus doce cajones
--  en 3×4 con lo que hay en cada uno, en vez de leer doce renglones.
--  Como texto no se puede ordenar ni dibujar, y «Nivel 2» y «Nivel  2»
--  serían dos.
--
--  El NOMBRE se queda para lo que la gente llama a cada cosa —«Nivel
--  superior», «Estante 01»—: la posición es para la máquina, el nombre
--  para quien abre el cajón.
-- ============================================================

alter table sitios add column if not exists tipo    text;
alter table sitios add column if not exists clave   text;
alter table sitios add column if not exists fila    integer;
alter table sitios add column if not exists columna integer;

/* Fila y columna empiezan en 1, como se cuentan de verdad. Un cero se
   colaría en el orden y saldría dibujado antes de la primera fila. */
alter table sitios drop constraint if exists sitio_rejilla_positiva;
alter table sitios add constraint sitio_rejilla_positiva check (
  (fila is null or fila > 0) and (columna is null or columna > 0)
);

/* ── LA CLAVE, ÚNICA DENTRO DE SU PADRE ──
   Dos «C01» colgando del mismo mueble harían que OF01-M01-C01 señale a
   dos cajones, que es justo lo que el código viene a evitar. Entre
   padres distintos se repite y está bien.
   `where clave is not null`: un sitio sin clave es válido —los que ya
   existen no la tienen— y varios sin clave no chocan entre sí. */
create unique index if not exists idx_sitio_clave_en_padre
  on sitios(dentro_de, lower(clave)) where dentro_de is not null and clave is not null;
create unique index if not exists idx_sitio_clave_raiz
  on sitios(lower(clave)) where dentro_de is null and clave is not null;

/* Se busca por clave —«dónde está C07»— y se ordena por rejilla al
   dibujar un mueble. Los dos índices son de lectura. */
create index if not exists idx_sitio_clave on sitios(lower(clave));
create index if not exists idx_sitio_rejilla on sitios(dentro_de, fila, columna);

-- ------------------------------------------------------------
--  LO QUE YA HAY, LEÍDO DE SU NOMBRE
--
--  Los sitios que creó db/sitios.sql salieron de las notas de los kits
--  —«Cajón 07», «Estante 03»— y no tienen ni tipo ni clave. Se deducen
--  del nombre cuando el nombre lo dice, y se dejan en null cuando no:
--  inventar un tipo es peor que no tenerlo, porque un tipo equivocado
--  decide el ícono, la clave sugerida y qué se ofrece crear dentro.
--
--  ⚠ NO se toca el nombre. La clave se AÑADE al lado; «Cajón 07» sigue
--  llamándose «Cajón 07» y ahora además es «C07».
-- ------------------------------------------------------------

/* El número que lleve el nombre, con sus ceros: «Cajón 07» → «07». Sin
   número no hay clave que deducir —«Depósito» es un sitio con nombre
   propio— y se queda en null.

   ⚠ `\d+` y NO `\d{1,3}`. Un cuantificador con tope no rechaza el número
   largo: se queda con los TRES ÚLTIMOS dígitos y sigue como si nada.
   «Cajón 1024» daba «024» → clave C024, y «Almacén 2026» daba «026» →
   AL026. No es un error que se vea: es una clave equivocada escrita en
   la base, y encima puede chocar contra la de un «Cajón 024» de verdad
   y tumbar el traslado por una colisión que nadie provocó. Probado
   contra Postgres 16. */
create or replace function _num_del_nombre(txt text) returns text as $$
  select nullif((regexp_match(txt, '(\d+)\s*$'))[1], '');
$$ language sql immutable;

update sitios set
  tipo = case
    when nombre ~* '^\s*(caj[óo]n|gaveta)'        then 'cajon'
    when nombre ~* '^\s*(estante|nivel|repisa)'   then 'estante'
    when nombre ~* '^\s*(mueble|arm[áa]rio|armario|estanter[íi]a)' then 'mueble'
    when nombre ~* '^\s*(compartimiento|compartimento)' then 'compartimiento'
    when nombre ~* '^\s*(espacio|casillero)'      then 'espacio'
    when nombre ~* '^\s*(oficina|of\.)'           then 'oficina'
    when nombre ~* '^\s*(almac[ée]n|dep[óo]sito|bodega)' then 'almacen'
    else null
  end
where tipo is null;

/* La clave que le TOCARÍA a un sitio por su tipo y su nombre. En una
   función y no dentro del `update` porque la piden dos: el traslado, y
   el informe del final que dice quién se pelea con quién. Escrita dos
   veces, el informe acabaría acusando a un sitio de una colisión que el
   traslado no vio. */
create or replace function _clave_del_sitio(tipo text, nombre text) returns text as $$
  select case tipo
    /* El mismo prefijo para cajón y compartimiento, y para estante y
       espacio: es lo que hacía la propuesta y no confunde, porque el
       nivel de la cadena ya los separa. */
    when 'cajon'          then 'C'  || _num_del_nombre(nombre)
    when 'compartimiento' then 'C'  || _num_del_nombre(nombre)
    when 'estante'        then 'E'  || _num_del_nombre(nombre)
    when 'espacio'        then 'E'  || _num_del_nombre(nombre)
    when 'mueble'         then 'M'  || _num_del_nombre(nombre)
    when 'oficina'        then 'OF' || _num_del_nombre(nombre)
    when 'almacen'        then 'AL' || _num_del_nombre(nombre)
    else null
  end;
$$ language sql immutable;

/* ── EL TRASLADO, SALTÁNDOSE LO QUE CHOCA ──
   ⚠ ESTO NO ES DEFENSA DE MÁS. El `update` de una sola pasada reventaba
   contra `idx_sitio_clave_raiz` en cuanto DOS nombres deducían la misma
   clave —«Cajón 07» y «Compartimiento 07», que el comentario de arriba
   dice expresamente que comparten prefijo a propósito—, y al reventar
   se llevaba por delante a los que no chocaban con nadie: `tipo` escrito
   en todos, `clave` en null en todos, y un mensaje de Postgres que no
   nombra a ninguno de los dos culpables. Comprobado contra Postgres 16.

   Así que se escribe la clave SOLO donde es única dentro de su padre, y
   lo que se queda fuera sale con nombre y apellido en el informe del
   final. Un sitio sin clave es válido —se rellena desde la pantalla—;
   veinte sitios sin clave por culpa de uno, no. */
update sitios s
   set clave = c.propuesta
  from (
    select id, dentro_de, _clave_del_sitio(tipo, nombre) as propuesta
      from sitios
     where clave is null and tipo is not null
       and _clave_del_sitio(tipo, nombre) is not null
  ) c
 where s.id = c.id
   /* Ningún hermano se la pide también… */
   and not exists (
     select 1 from sitios o
      where o.id <> c.id
        and o.dentro_de is not distinct from c.dentro_de
        and lower(_clave_del_sitio(o.tipo, o.nombre)) = lower(c.propuesta)
        and o.clave is null and o.tipo is not null)
   /* …ni la tiene ya puesta (una segunda corrida, o una clave a mano). */
   and not exists (
     select 1 from sitios o
      where o.id <> c.id
        and o.dentro_de is not distinct from c.dentro_de
        and lower(o.clave) = lower(c.propuesta));

-- ── COMPROBAR ──
select 'columnas nuevas' as que,
       count(*) filter (where column_name = 'tipo')    as tipo,
       count(*) filter (where column_name = 'clave')   as clave,
       count(*) filter (where column_name = 'fila')    as fila,
       count(*) filter (where column_name = 'columna') as columna
from information_schema.columns where table_name = 'sitios';

/* ── LAS CLAVES EN DISPUTA ──
   Los que se quedaron sin clave porque otro hermano pedía la misma. Esta
   consulta es la que antes no existía: el traslado fallaba entero y
   Postgres decía «duplicate key (c07)» sin decir de quién. Si sale
   vacía, no hubo ninguna colisión y todo lo deducible se escribió.
   Lo que salga aquí se arregla a mano desde la pantalla: son dos sitios
   que de verdad quieren llamarse igual dentro del mismo padre. */
select c.propuesta as clave_en_disputa,
       coalesce(d.nombre, '— la raíz —') as dentro_de,
       string_agg(c.nombre, '  ·  ' order by c.nombre) as se_la_pelean
  from (
    select id, dentro_de, nombre, _clave_del_sitio(tipo, nombre) as propuesta
      from sitios where tipo is not null
  ) c
  left join sitios d on d.id = c.dentro_de
 where c.propuesta is not null
 group by c.propuesta, c.dentro_de, d.nombre
having count(*) > 1
 order by 1;

/* Qué quedó, y qué hay que completar a mano. Lo que salga con tipo o
   clave vacíos NO está mal: es un nombre del que no se podía deducir
   —«Depósito», «Cajón principal»— y se rellena desde la pantalla. */
select coalesce(clave, '— sin clave —') as clave,
       coalesce(tipo, '— sin tipo —')   as tipo,
       nombre,
       (select s2.nombre from sitios s2 where s2.id = s.dentro_de) as dentro_de
  from sitios s
 order by tipo nulls first, clave nulls first, nombre;

/* Las dos funciones eran del traslado, no del esquema: se van con él.
   Dejarlas sueltas es dejar un `_num_del_nombre` en la base que nadie
   llama y que el siguiente que lo mire tendrá que averiguar de dónde
   salió. En este orden: `_clave_del_sitio` llama a la otra. */
drop function if exists _clave_del_sitio(text, text);
drop function if exists _num_del_nombre(text);
