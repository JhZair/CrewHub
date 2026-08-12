-- ════════════════════════════════════════════════════════════════════════
--  LAS FRANJAS SE CUENTAN EN LA BASE, NO EN LA PÁGINA
-- ════════════════════════════════════════════════════════════════════════
--  Las dos siluetas bajo el nombre de cada persona (🕗 por hora, 📅 por día
--  del mes) se dibujaban trayendo las filas del mes al servidor de Next y
--  contándolas ahí. Con `.limit(20000)` y sin `order by`.
--
--  Eso es una lotería. Un `LIMIT` sin orden no devuelve «las primeras»: en
--  Postgres no hay primeras. Devuelve las que el plan de esa consulta vaya
--  encontrando — y el plan cambia cuando cambia un filtro. Al añadir un
--  `neq`, la semana del 10 de julio, que era el pico del mes, desapareció de
--  la franja entera: seiscientas cuarenta y tres cosas que la ventana del
--  día sí lista y la barra decía que no existieron. No falló nada. Pintó un
--  mes que nadie trabajó.
--
--  Contar es trabajo de la base. Aquí se agrupa por persona, día y hora de
--  una sola pasada y vuelven unos cientos de filas de conteos en vez de
--  decenas de miles de filas de datos. Ya no hay límite que sortear ni orden
--  del que depender, y el número es exacto por definición.
--
--  Las TRES fuentes son las mismas que lista la ventana del día, con el
--  mismo criterio: la barra tiene que medir lo que uno va a encontrar al
--  abrirla, o un pico no se puede comprobar.
--
--  `is distinct from` y no `<>`: comentar en un caso escribe fila en
--  `comentarios` Y fila en `actividad` de tipo «comentario», así que ese tipo
--  se descarta para no contar el mismo hecho dos veces — pero
--  `tipo <> 'comentario'` es NULO cuando el tipo es nulo, y en SQL un NULO no
--  pasa el filtro. Las filas sin tipo se habrían borrado de la silueta
--  calladas.
--
--  SECURITY INVOKER (el de por defecto, no se toca): la función lee con los
--  permisos de quien llama, así que las políticas de RLS siguen mandando.
-- ════════════════════════════════════════════════════════════════════════

create or replace function franjas_actividad(p_desde timestamptz, p_hasta timestamptz)
returns table (usuario_id uuid, dia int, hora int, n bigint)
language sql
stable
as $$
  with todo as (
    select actor_id as uid, creado_en
      from actividad
     where creado_en >= p_desde and creado_en < p_hasta
       and tipo is distinct from 'comentario'
    union all
    select autor_id, creado_en
      from comentarios
     where creado_en >= p_desde and creado_en < p_hasta
    union all
    select autor_id, creado_en
      from publicaciones
     where creado_en >= p_desde and creado_en < p_hasta
  )
  -- El día y la hora, EN LIMA. `at time zone` sobre un timestamptz devuelve
  -- la hora local de esa zona; sin él saldría en UTC y la silueta entera
  -- correría cinco puestos, que es justo lo que se está midiendo.
  select uid,
         extract(day  from creado_en at time zone 'America/Lima')::int,
         extract(hour from creado_en at time zone 'America/Lima')::int,
         count(*)
    from todo
   where uid is not null
   group by 1, 2, 3;
$$;

grant execute on function franjas_actividad(timestamptz, timestamptz) to authenticated;
