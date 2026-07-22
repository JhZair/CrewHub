-- ============================================================
--  Personas duplicadas (herencia de la migración de Seatable)
--  Se corre por PASOS. El 1 y el 2 solo MIRAN. El 3 y el 4 tocan.
--  Lee el resultado del paso 2 antes de correr el 3.
-- ============================================================

-- ------------------------------------------------------------
-- PASO 0 · Herramientas
-- ------------------------------------------------------------

-- Nombre normalizado: sin tildes, sin dobles espacios, en minúsculas.
-- "José  Pérez " y "Jose Perez" tienen que caer en el mismo grupo, que es
-- justo por donde se colaron los duplicados al migrar.
create or replace function nrm_nombre(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(t, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
    '\s+', ' ', 'g'))
$$;

-- Todo lo que cuelga de una persona.
--
-- Las claves foráneas las descubre del catálogo, no de una lista escrita a
-- mano: así cubre las tablas que aún no existen (mañana agregamos otra y
-- esto la cuenta sola).
--
-- Pero hay dos tablas que apuntan a personas SIN clave foránea —
-- publicacion_vinculos y actividad usan (entidad_tipo,'persona' + entidad_id).
-- Postgres no las protege ni las cascadea: un DELETE normal las deja
-- huérfanas y en silencio. Por eso van aparte, a mano.
create or replace function persona_refs(p_id uuid)
returns table (tabla text, n bigint)
language plpgsql stable as $$
declare r record; c bigint; t text;
begin
  for r in
    select con.conrelid::regclass::text as tab, a.attname as col
      from pg_constraint con
      join pg_attribute a
        on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'personas'::regclass
       and array_length(con.conkey, 1) = 1
  loop
    execute format('select count(*) from %s where %I = $1', r.tab, r.col)
      into c using p_id;
    if c > 0 then tabla := r.tab; n := c; return next; end if;
  end loop;

  /* `objetos` (el repositorio) va aquí y no por FK: su dueño es polimórfico
     (entidad_tipo/entidad_id), así que no puede tener FK a personas. Sin esta
     línea, una persona cuyo único dato era su CV contaba refs = 0 y el PASO 3
     la borraba — el repositorio la volvía invisible justo para lo que existe
     esta función. */
  foreach t in array array['publicacion_vinculos', 'actividad', 'objetos'] loop
    execute format(
      'select count(*) from %I where entidad_tipo = ''persona'' and entidad_id = $1',
      t) into c using p_id;
    if c > 0 then tabla := t || ' (vínculo suelto)'; n := c; return next; end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- PASO 1 · ¿Cuántos grupos duplicados hay?  (solo mira)
-- ------------------------------------------------------------
select nrm_nombre(nombre) as nombre_normalizado, count(*) as veces
  from personas
 group by 1 having count(*) > 1
 order by 2 desc, 1;

-- Duplicados por DNI/RUC: más confiable que el nombre, y pesca los que
-- se escribieron distinto ("Yajaida" / "Yahaida") pero son la misma persona.
select ruc_dni, count(*) as veces, string_agg(nombre, ' | ') as nombres
  from personas
 where ruc_dni is not null and btrim(ruc_dni) <> ''
 group by 1 having count(*) > 1
 order by 2 desc;


-- ------------------------------------------------------------
-- PASO 2 · El informe: quién se queda y quién se va  (solo mira)
--   pos = 1  → el que se queda (tiene cuenta, o data, o es el más antiguo)
--   pos > 1  → candidato a borrar
--   veredicto dice qué pasaría con cada uno
-- ------------------------------------------------------------
with d as (
  select p.id, p.nombre, p.alias, p.tipo, p.estado, p.ruc_dni, p.origen,
         p.creado_en, (p.usuario_id is not null)::int as cuenta,
         -- DATOS: jornadas, RHE, CVs, credenciales, equipos de postulación,
         -- chips en casos. Esto sí duele perderlo.
         coalesce((select sum(n) from persona_refs(p.id)
                    where tabla not like 'actividad%'), 0) as datos,
         -- RASTRO: la bitácora que escribió el trigger al crear la ficha.
         -- Es ruido de la migración, no es trabajo. La primera versión de
         -- esta consulta lo pesaba como si fuera data y por eso eligió al
         -- gemelo vacío de Pavel: tenía una línea más de bitácora.
         coalesce((select sum(n) from persona_refs(p.id)
                    where tabla like 'actividad%'), 0) as rastro,
         coalesce((select string_agg(tabla || ':' || n, ', ')
                     from persona_refs(p.id)
                    where tabla not like 'actividad%'), '—') as donde,
         (case when p.alias    is not null then 1 else 0 end
        + case when p.ruc_dni  is not null then 1 else 0 end
        + case when p.telefono is not null then 1 else 0 end
        + case when p.email    is not null then 1 else 0 end
        + case when p.rol      is not null then 1 else 0 end
        + case when p.region   is not null then 1 else 0 end) as campos_llenos,
         nrm_nombre(p.nombre) as k
    from personas p
),
g as (select k from d group by k having count(*) > 1),
r as (
  select d.*, row_number() over (
           partition by d.k
           -- Gana el que tiene cuenta; luego el que tiene datos de verdad;
           -- luego el que tiene más campos llenos; y a igualdad, el más
           -- antiguo. La bitácora NO vota.
           order by d.cuenta desc, d.datos desc, d.campos_llenos desc, d.creado_en
         ) as pos
    from d join g on g.k = d.k
)
select pos, id, nombre, alias, tipo, estado, ruc_dni,
       creado_en::date as creado,
       case when cuenta = 1 then 'sí' else '' end as tiene_cuenta,
       datos, campos_llenos, rastro, donde,
       case
         when pos = 1 then '🟢 SE QUEDA'
         when cuenta = 1 then '🔴 REVISAR A MANO — tiene cuenta de acceso'
         when datos > 0 then '🟡 tiene datos reales — fusionar (PASO 4)'
         when campos_llenos > 0 then '🟡 tiene campos que el otro no — fusionar (PASO 4)'
         else '⚪ vacío — lo borra el PASO 3'
       end as veredicto
  from r
 order by k, pos;


-- ------------------------------------------------------------
-- PASO 3 · Borrar SOLO los duplicados vacíos de verdad
--   No toca: los que tienen cuenta, historial, o cualquier campo lleno.
--   Si el informe del paso 2 marcó a alguien 🟡 o 🔴, este paso lo ignora.
--   Corre primero el SELECT; si la lista te cuadra, cambia a DELETE.
-- ------------------------------------------------------------
with d as (
  select p.id, p.nombre, p.usuario_id, p.creado_en, nrm_nombre(p.nombre) as k,
         -- Aquí sí cuenta TODO, incluida la bitácora: para BORRAR la vara
         -- es alta. Si tiene una sola línea de rastro, no se toca.
         coalesce((select sum(n) from persona_refs(p.id)), 0) as refs,
         (case when p.alias    is not null then 1 else 0 end
        + case when p.ruc_dni  is not null then 1 else 0 end
        + case when p.telefono is not null then 1 else 0 end
        + case when p.email    is not null then 1 else 0 end
        + case when p.rol      is not null then 1 else 0 end
        + case when p.region   is not null then 1 else 0 end) as campos_llenos
    from personas p
),
g as (select k from d group by k having count(*) > 1),
r as (
  select d.*, row_number() over (
           partition by d.k
           order by (d.usuario_id is not null) desc, d.refs desc,
                    d.campos_llenos desc, d.creado_en
         ) as pos
    from d join g on g.k = d.k
),
victimas as (
  select id, nombre from r
   where pos > 1              -- nunca el superviviente del grupo
     and usuario_id is null   -- nunca alguien con login
     and refs = 0             -- nunca alguien con historial
     and campos_llenos = 0    -- nunca alguien con un dato cargado
)
-- 👀 Mira la lista:
select * from victimas;
-- ✅ Y cuando te cuadre, corre esto en su lugar:
-- delete from personas where id in (select id from victimas);


-- ------------------------------------------------------------
-- PASO 4 · Fusionar (para los 🟡 que sí tienen algo)
--   Reapunta TODO lo del absorbido al que se queda y lo borra.
--   select persona_fusionar('<id-que-se-queda>', '<id-que-desaparece>');
-- ------------------------------------------------------------
create or replace function persona_fusionar(mantener uuid, absorber uuid)
returns text
language plpgsql as $$
declare r record; movidos int := 0; chocados int := 0; c int; sets text;
begin
  if mantener = absorber then return 'Son la misma persona.'; end if;
  if not exists (select 1 from personas where id = mantener) then
    return 'El id que se queda no existe.'; end if;
  if not exists (select 1 from personas where id = absorber) then
    return 'El id a absorber no existe.'; end if;

  for r in
    select con.conrelid::regclass::text as tab, a.attname as col
      from pg_constraint con
      join pg_attribute a
        on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid = 'personas'::regclass
       and array_length(con.conkey, 1) = 1
  loop
    -- Puede chocar contra un índice único (p.ej. la misma persona ya está
    -- en esa postulación por las dos fichas). En ese caso el del absorbido
    -- sobra: el que se queda ya lo tiene.
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tab, r.col, r.col)
        using mantener, absorber;
      get diagnostics c = row_count; movidos := movidos + c;
    exception when unique_violation then
      execute format('delete from %s where %I = $1', r.tab, r.col) using absorber;
      get diagnostics c = row_count; chocados := chocados + c;
    end;
  end loop;

  -- Los vínculos sueltos: sin clave foránea, hay que moverlos a mano
  begin
    update publicacion_vinculos set entidad_id = mantener
     where entidad_tipo = 'persona' and entidad_id = absorber;
    get diagnostics c = row_count; movidos := movidos + c;
  exception when unique_violation then
    delete from publicacion_vinculos
     where entidad_tipo = 'persona' and entidad_id = absorber;
    get diagnostics c = row_count; chocados := chocados + c;
  end;

  update actividad set entidad_id = mantener
   where entidad_tipo = 'persona' and entidad_id = absorber;
  get diagnostics c = row_count; movidos := movidos + c;

  /* El repositorio (obras, CVs, prensa…). También sin FK, por dueño
     polimórfico. Puede chocar contra `idx_objetos_cv_unico` si los dos
     gemelos tienen CV del mismo enfoque: ahí el del absorbido sobra.

     FILA POR FILA, no en bloque. La versión anterior movía todos los objetos
     en una sentencia y, si UNO chocaba, la excepción anulaba el update entero
     y el `delete` de rescate borraba TODOS los objetos del absorbido —no solo
     el que colisionó—. Con `comentarios.objeto_id ... on delete cascade` eso
     ya no perdería un vínculo barato: se llevaría por delante conversaciones
     enteras y sus notificaciones. Aquí solo se descarta el duplicado real. */
  for r in
    select id, titulo, tipo from objetos
     where entidad_tipo = 'persona' and entidad_id = absorber
  loop
    begin
      update objetos set entidad_id = mantener where id = r.id;
      movidos := movidos + 1;
    exception when unique_violation then
      -- El que se queda ya tiene un CV de ese enfoque: este es el sobrante.
      delete from objetos where id = r.id;
      chocados := chocados + 1;
    end;
  end loop;

  -- Rellena los huecos del que se queda con lo que traía el otro.
  -- Solo rellena: nunca pisa un dato que ya estaba.
  --
  -- La lista de columnas se arma sola con las que existen HOY. La primera
  -- versión las listaba a mano y se rompió con `notas`, que ya habíamos
  -- borrado: db/schema.sql estaba desfasado. Esto no se vuelve a desfasar.
  --
  -- Lo excluido es a propósito: la identidad y la clasificación no son
  -- huecos que rellenar. Si los gemelos se contradicen en tipo o estado,
  -- eso lo decide una persona, no un coalesce.
  -- Ojo con la forma de escribir esto: va como asignación (:=) y NO como
  -- `select ... into sets`. En SQL plano `SELECT ... INTO x` crea una tabla,
  -- y el editor de Supabase, que escanea buscando tablas nuevas para
  -- activarles RLS, parte la función a la mitad para colarte un
  -- `ALTER TABLE sets ENABLE ROW LEVEL SECURITY`. Aquí dentro INTO solo
  -- asigna una variable, pero su parser no lo sabe.
  -- El alias se llama `col`, no `c`: `c` es la variable contadora de esta
  -- misma función y PL/pgSQL no adivina cuál de las dos quieres —«column
  -- reference "c" is ambiguous» y la fusión no llega a ejecutarse nunca.
  sets := (
    select string_agg(format('%I = coalesce(p.%I, a.%I)', z.col, z.col, z.col), ', ')
      from (select column_name as col
              from information_schema.columns
             where table_schema = 'public' and table_name = 'personas'
               and column_name not in ('id', 'nombre', 'tipo', 'estado',
                                       'origen', 'creado_en', 'usuario_id',
                                       'relaciones')) z
  );
  if sets is not null then
    execute format('update personas p set %s from personas a
                     where p.id = $1 and a.id = $2', sets)
      using mantener, absorber;
  end if;

  delete from personas where id = absorber;

  return format('Fusionada. %s filas reapuntadas, %s descartadas por duplicado.',
                movidos, chocados);
end $$;
