-- ============================================================
--  CAJAS DORMIDAS — saber cuándo fue la última vez que alguien apuntó
--
--  Una caja no se descuadra de golpe. Se descuadra porque durante dos semanas
--  nadie apuntó nada, y cuando alguien se sienta a ponerla al día ya no se
--  acuerda de qué fue ese retiro de S/ 80. El descuadre no se ve mirando el
--  saldo —el saldo se ve perfecto, solo que es mentira—: se ve mirando el
--  silencio.
--
--  Esto es lo único que hace falta en la base para vigilarlo: una fila por
--  caja con el instante del último apunte. La regla de cuántos días son
--  ámbar y cuántos rojo vive en lib/cajaDormida.ts, no aquí — si estuviera en
--  los dos sitios, el día que se cambie el umbral cambiaría en uno solo.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/caja.sql.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'movimiento_caja') then
    raise exception 'Falta movimiento_caja: corre antes db/caja.sql';
  end if;
end $$;


-- ── POR QUÉ UNA VISTA Y NO UNA CONSULTA ──
--
-- El menú necesita este dato en CADA carga de página, en las diecinueve
-- pantallas. Sin agrupar habría que traerse los movimientos enteros para
-- quedarse con una fecha por caja.
--
-- Se mide `creado_en` —cuándo se ESCRIBIÓ— y no `fecha` —cuándo pasó—, porque
-- lo que se vigila es la atención, no el dinero: si hoy alguien apunta seis
-- gastos de la semana pasada, la caja está atendida. Por `fecha` el aviso
-- saltaría justo el día en que alguien hizo el trabajo.
--
-- La regla de cuántos días son ámbar y cuántos rojo NO está aquí: vive en
-- lib/cajaDormida.ts. Escrita en los dos sitios, el día que se cambie el
-- umbral cambiaría en uno solo.

-- `security_invoker` exige Postgres 15. Se comprueba antes porque el error
-- que da si no —una opción de vista desconocida— no dice eso, y sin la opción
-- la vista correría con los permisos de quien la creó: una puerta lateral a
-- `movimiento_caja` para cualquiera que sepa su nombre, que es la forma más
-- silenciosa de abrir una tabla cerrada.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Se necesita PostgreSQL 15 o superior (security_invoker). Versión: %',
      current_setting('server_version');
  end if;
end $$;

-- ── EL NULO SE ARREGLA EN ORIGEN, NO EN CADA LECTURA ──
-- `creado_en` tenía `default now()` pero no `not null`, así que una fila metida
-- por SQL sin él no daba señal ninguna y `max()` la ignoraba en silencio: la
-- caja saldría «sin estrenar» teniendo movimientos a la vista.
--
-- La primera versión lo esquivaba con un `coalesce(creado_en, fecha)` DENTRO
-- del `max()`, y eso salía caro sin que se notara: Postgres solo reescribe un
-- `max(X)` como «lee la primera entrada del índice» cuando X es la columna
-- desnuda. Con una expresión encima no hay índice que case, y la vista pasaba
-- a leer TODAS las filas de cada caja en cada carga de página, en las
-- diecinueve pantallas. Un índice sobre la expresión tampoco vale: convertir a
-- una zona horaria por nombre es STABLE, no IMMUTABLE, y Postgres no lo acepta
-- en un índice; hacerlo con «-05:00» a pelo sería clavar el offset a mano, que
-- es justo la bomba de relojería contra la que avisa lib/fechas.ts.
--
-- Así que se rellena una vez, aquí, y la columna pasa a ser obligatoria. El
-- razonamiento del mediodía de Lima se ejecuta en la migración en vez de en
-- cada fila de cada lectura, y la vista queda con un `max(creado_en)` limpio.
--
-- ⚠ El mediodía NO es decorativo: `fecha::timestamptz` a secas usa la zona de
-- la sesión —UTC—, o sea medianoche UTC, que en Perú son las siete de la tarde
-- del DÍA ANTERIOR. El aviso habría contado un día de más.
update movimiento_caja
   set creado_en = (fecha + time '12:00') at time zone 'America/Lima'
 where creado_en is null;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'movimiento_caja'
                and column_name = 'creado_en' and is_nullable = 'YES') then
    alter table movimiento_caja alter column creado_en set not null;
  end if;
end $$;


-- `drop` y no `create or replace`: reemplazar una vista exige que las columnas
-- sean las mismas y del mismo tipo, así que el día que se le añada una el
-- `replace` fallaría con un error que no dice eso.
drop view if exists caja_ultimo_apunte;

-- ── UN TRASPASO TOCA DOS CAJAS, PERO ES UNA SOLA FILA ──
-- `caja_id` es de dónde sale y `caja_destino` a dónde entra (constraint
-- `mov_caja_clase` en db/caja.sql). Mirando solo `caja_id`, la caja que RECIBE
-- no se entera de esos apuntes: una cuenta de banco cuyo movimiento normal son
-- los depósitos del efectivo saldría «sin estrenar» debajo de un saldo de
-- cinco mil soles, o roja con gente apuntando ahí cada semana. `saldoDeCaja`
-- (lib/caja.ts) ya cuenta el traspaso por los dos lados; esto tenía que hacer
-- lo mismo.
--
-- Van como DOS subconsultas y un `greatest`, y no como un join con `or`: cada
-- una entra por su índice y se resuelve leyendo una sola entrada —el máximo
-- está en un extremo—, mientras que el `or` dentro del join obliga a recorrer
-- `movimiento_caja` entera, con RLS por fila, en cada navegación. `greatest`
-- ignora los nulos y solo devuelve null si los dos lo son, que es justo lo que
-- hace falta: null aquí significa «esta caja no tiene ni un movimiento».
--
-- Trae `activa` para que el menú lo resuelva en UNA consulta: una caja
-- archivada no se vigila, y sin este campo habría que pedir `caja` aparte.
create view caja_ultimo_apunte
  with (security_invoker = on) as
select c.id     as caja_id,
       c.activa as activa,
       greatest(
         (select max(m.creado_en) from movimiento_caja m where m.caja_id = c.id),
         (select max(m.creado_en) from movimiento_caja m where m.caja_destino = c.id)
       ) as ultimo_apunte
  from caja c;

comment on view caja_ultimo_apunte is
  'Última vez que alguien APUNTÓ algo en cada caja (creado_en, no fecha; cuenta los dos lados de un traspaso). Para detectar cajas dormidas.';

grant select on caja_ultimo_apunte to authenticated;

-- Y a nadie más: `anon` es quien no ha iniciado sesión.
revoke all on caja_ultimo_apunte from anon;


-- ── LOS ÍNDICES QUE HACEN QUE ESTO NO CUESTE ──
-- Uno por cada lado del traspaso. Los que ya había son `(caja_id, fecha)` y
-- `(caja_destino)`, y ninguno sirve para un `max(creado_en)`. Hoy no se
-- notaría la diferencia, pero la propia pantalla de caja ya está preparada
-- para paginar hasta 60.000 movimientos.
create index if not exists idx_movcaja_pulso
  on movimiento_caja(caja_id, creado_en desc);
create index if not exists idx_movcaja_pulso_dest
  on movimiento_caja(caja_destino, creado_en desc)
  where caja_destino is not null;


-- ── QUE POSTGREST SE ENTERE ──
-- Sin esto, la primera llamada puede responder «no existe» sobre algo que
-- acaba de crearse: PostgREST cachea el esquema y no se entera solo. Aquí
-- además el fallo sería mudo —el aviso se quedaría apagado, y eso no se
-- distingue de «todas las cajas al día»—, así que va por partida doble.
notify pgrst, 'reload schema';
