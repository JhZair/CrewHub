-- ============================================================
--  LOS RODAJES QUE VIENEN — los casos de una etiqueta, en una ventana
--
--  La portada abre con dos listas: lo de hoy y los rodajes de los próximos
--  treinta días. Lo de hoy sale de dos consultas normales; esto es para lo
--  otro, que sin ayuda de la base serían TRES viajes encadenados: resolver el
--  id de la etiqueta por su nombre, buscar sus vínculos, y traer los casos.
--
--  Tres viajes en cadena en la portada es exactamente lo que se fue a quitar
--  el día que se aplanó esta pantalla (ver el comentario de app/page.tsx sobre
--  los siete segundos). Con esto es uno, y entra en la tanda que ya se hace.
--
--  Y de paso resuelve el problema del `.in()` con muchos uuid: pedir los casos
--  con una lista de cuatrocientos identificadores en la URL da un HTTP 414 que
--  PostgREST no explica —la lista sale vacía sin error—, y el tablero ya tuvo
--  que esquivarlo cruzando en memoria.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- Se comprueba TODO lo que el cuerpo toca, no solo la tabla principal: sin
-- estas columnas el `create` falla con un error de Postgres sobre una columna
-- suelta, que no dice qué archivo falta correr.
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'publicacion_vinculos') then
    raise exception 'Falta publicacion_vinculos: corre antes db/schema.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'publicaciones'
                    and column_name = 'archivado_en') then
    raise exception 'Falta publicaciones.archivado_en: corre antes db/archivo-dos-ejes.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'publicaciones'
                    and column_name = 'fecha_inicio') then
    raise exception 'Falta publicaciones.fecha_inicio: corre antes db/publicacion-fecha-inicio.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'publicaciones'
                    and column_name = 'hora') then
    raise exception 'Falta publicaciones.hora: corre antes db/publicacion-hora.sql';
  end if;
end $$;


-- ── LA ETIQUETA SE BUSCA POR NOMBRE ──
--
-- `etiquetas` no tiene slug ni constante en el código: solo `id` (uuid) y
-- `nombre` (único). Guardar el uuid de «Rodaje» en el código sería clavar un
-- dato de la base en un archivo de TypeScript —y el día que alguien borre y
-- vuelva a crear la etiqueta, el bloque se quedaría vacío sin explicar por
-- qué—. Se busca por nombre, sin distinguir mayúsculas.
--
-- Si la etiqueta no existe, esto devuelve CERO FILAS, que es indistinguible de
-- «no hay rodajes». Por eso la función devuelve también `hay_etiqueta`: la
-- pantalla necesita poder decir «no existe la etiqueta Rodaje» en vez de
-- enseñar un bloque vacío que parece que nadie rueda nada.
-- `drop` antes de crear: una función SQL no se puede reemplazar si cambia su
-- tabla de retorno («cannot change return type of existing function»), y este
-- archivo dice ser idempotente. Y va junto al `revoke` dentro de una
-- transacción porque `create function` concede EXECUTE a PUBLIC: entre el
-- create y el revoke hay una ventana, corta pero real.
begin;

drop function if exists public.casos_de_etiqueta(text, date, date, int);
create function public.casos_de_etiqueta(
  p_nombre text,
  p_desde  date,
  p_hasta  date,
  p_tope   int default 40
)
returns table (
  id            uuid,
  titulo        text,
  tipo          text,
  estado        text,
  fecha_inicio  date,
  fecha_limite  date,
  -- `time`, no `text`: `publicaciones.hora` es `time without time zone`, y una
  -- función SQL exige que el tipo devuelto coincida EXACTAMENTE —no acepta ni
  -- los casts de asignación—. Declarado como text, el `create` fallaba con un
  -- «return type mismatch» y la función no llegaba a existir nunca; la portada
  -- habría pedido correr este archivo para siempre, incluso recién corrido.
  hora          time,
  responsable   uuid,
  grupo         text,      -- de qué proyecto es, para no leer títulos sueltos
  hay_etiqueta  boolean
)
language sql
stable
-- `security invoker` para que respete las políticas de quien pregunta: una
-- función que corre como su dueño es una puerta lateral a `publicaciones`.
security invoker
set search_path = public
as $$
  with etq as (
    select e.id from etiquetas e where lower(e.nombre) = lower(p_nombre) limit 1
  )
  select p.id, p.titulo, p.tipo, p.estado,
         p.fecha_inicio, p.fecha_limite, p.hora, p.responsable,
         g.nombre as grupo,
         true as hay_etiqueta
    from publicaciones p
    join publicacion_vinculos v
      on v.publicacion_id = p.id and v.entidad_tipo = 'etiqueta'
    join etq on etq.id = v.entidad_id
    -- De qué proyecto es. `left join lateral` y no una segunda consulta: un
    -- caso puede tener varios vínculos y aquí solo interesa el primero, el
    -- mismo criterio de «vínculo principal» que usa la agenda (por antigüedad).
    left join lateral (
      select pr.nombre
        from publicacion_vinculos v2
        join proyectos pr on pr.id = v2.entidad_id
       where v2.publicacion_id = p.id and v2.entidad_tipo in ('proyecto', 'proyectos')
       order by v2.creado_en
       limit 1
    ) g on true
   where p.archivado_en is null
     -- Una nota de muro etiquetada «Rodaje» no es un rodaje. Mismo filtro que
     -- el resto de las listas de casos.
     and p.tipo is distinct from 'bitacora'
     -- Descartada fuera: no se va a hacer. Resuelta SE QUEDA —un rodaje ya
     -- hecho dentro de la ventana es información, y borrarlo haría parecer que
     -- se cayó—; la pantalla lo pinta distinto.
     -- `is distinct from` y no `<>`: la columna es nullable, y con `<>` una
     -- fila de estado nulo desaparecería sin que nadie la hubiera descartado.
     and p.estado is distinct from 'descartada'
     -- Se solapa con la ventana. NO se compara solo el primer día: un rodaje
     -- de dos semanas que arrancó ayer tiene que seguir saliendo, que es justo
     -- cuando más falta hace verlo.
     and coalesce(p.fecha_inicio, p.fecha_limite) is not null
     and coalesce(p.fecha_inicio, p.fecha_limite) <= p_hasta
     and coalesce(p.fecha_limite, p.fecha_inicio) >= p_desde
   order by coalesce(p.fecha_inicio, p.fecha_limite), p.titulo
   -- `coalesce` ANTES del tope: con `greatest(p_tope, 1)` a secas, un `p_tope`
   -- nulo daba `limit 1` —un solo rodaje, en silencio—, porque `greatest`
   -- ignora los nulos. Es la misma trampa que documenta db/etiquetas-uso.sql.
   limit least(greatest(coalesce(p_tope, 40), 1), 200);
$$;

comment on function public.casos_de_etiqueta(text, date, date, int) is
  'Casos de una etiqueta (por nombre) que se solapan con una ventana de fechas. Para el bloque de rodajes de la portada.';

revoke execute on function public.casos_de_etiqueta(text, date, date, int) from public;
revoke execute on function public.casos_de_etiqueta(text, date, date, int) from anon;
grant  execute on function public.casos_de_etiqueta(text, date, date, int) to authenticated;

commit;


-- ── ¿EXISTE LA ETIQUETA? ──
-- Aparte, porque la de arriba no puede contestarlo cuando no devuelve filas.
-- Dos preguntas distintas —«¿hay rodajes?» y «¿existe la etiqueta?»— que la
-- pantalla necesita separar para no enseñar un vacío que miente.
begin;

drop function if exists public.existe_etiqueta(text);
create function public.existe_etiqueta(p_nombre text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from etiquetas where lower(nombre) = lower(p_nombre));
$$;

revoke execute on function public.existe_etiqueta(text) from public;
revoke execute on function public.existe_etiqueta(text) from anon;
grant  execute on function public.existe_etiqueta(text) to authenticated;

commit;


-- Sin índices nuevos: `idx_vinc_entidad(entidad_tipo, entidad_id)` sostiene la
-- búsqueda de los vínculos de la etiqueta, y el `unique (publicacion_id,
-- entidad_tipo, entidad_id)` de db/schema.sql ya sirve como índice para el
-- lateral del proyecto —comparte prefijo—. Crear otro sería pagar escritura en
-- cada vínculo a cambio de nada.

notify pgrst, 'reload schema';
