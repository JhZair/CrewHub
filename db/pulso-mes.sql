-- ════════════════════════════════════════════════════════════════════════
--  db/pulso-mes.sql — EL PULSO SE CUENTA EN LA BASE
-- ════════════════════════════════════════════════════════════════════════
--  Dos problemas, y el segundo es peor que el primero.
--
--  ── 1. MIL FILAS ARBITRARIAS DE CUATRO MIL ──
--  /pulso pedía el mes entero de `actividad` con `.limit(6000)` y SIN
--  `order by`. Y el ajuste «Max rows» de este proyecto está en 1000
--  (Settings → Data API), así que ese 6000 nunca existió: volvían mil filas.
--
--  Mil de unas cuatro mil, y elegidas por el plan de la consulta, no por una
--  regla. Es el MISMO fallo que documenta db/franjas-actividad.sql, donde la
--  semana del 10 de julio desapareció entera de la silueta al cambiar un
--  filtro. Allí se arregló contando en la base; aquí quedó pendiente.
--
--  ── 2. LA MATRIZ NO CONTABA NI UN SOLO CIERRE ──
--  La consulta filtraba `entidad_tipo = 'publicacion'`, en singular. Pero el
--  trigger de garantía de db/schema.sql escribe `tg_table_name`, o sea
--  'publicaciones' EN PLURAL — y es el trigger quien escribe los eventos de
--  creación y de cambio de estado.
--
--  O sea que las tres columnas del pulso —creó, cerró, avanzó— se estaban
--  calculando sobre las filas equivocadas. El propio archivo ya tenía este
--  bicho identificado y arreglado en OTRO contador, dos bloques más abajo:
--  «este segundo contador estaba en CERO permanente y sin parecerlo». El de
--  la matriz, que es el que se mira, se quedó sin arreglar.
--
--  Aquí se preguntan las DOS grafías, que es lo que hace `grafiasDe` en la
--  aplicación. Un filtro por una sola no da error: da un cero.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ════════════════════════════════════════════════════════════════════════

/* Una fila por persona y DÍA, no por semana: quién agrupa los días en
   semanas es la página, que ya tiene esa regla escrita (`semanaDelMes`) y la
   usa también para rotular. Devolver semanas desde aquí sería una segunda
   definición de «semana» viviendo en otro idioma. */
/* `p_actor` es opcional: sin él sale el equipo entero (lo que pinta /pulso),
   con él sale una sola persona (lo que pinta su ficha). El `drop` de delante es
   necesario porque añadir un parámetro NO reemplaza la función: crea una
   sobrecarga, y quedarían dos versiones vivas de la misma verdad. */
drop function if exists pulso_mes(timestamptz, timestamptz);
drop function if exists pulso_mes(timestamptz, timestamptz, uuid);

create or replace function pulso_mes(
  p_desde timestamptz, p_hasta timestamptz, p_actor uuid default null)
returns table (actor_id uuid, dia int, creo bigint, cerr bigint, avanzo bigint, coment bigint)
language sql
stable
as $$
  with ev as (
    select a.actor_id as uid,
           /* El día EN LIMA. `at time zone` sobre un timestamptz da la hora
              local de esa zona; sin él, lo de la noche cae en el día siguiente
              y una semana entera se corre. */
           extract(day from a.creado_en at time zone 'America/Lima')::int as d,
           (a.tipo = 'creado')::int as c_creo,
           (a.tipo = 'estado' and a.detalle->>'campo' = 'estado'
              and a.detalle->>'a' = 'resuelta')::int as c_cerr,
           (a.tipo = 'estado' and a.detalle->>'campo' = 'estado'
              and a.detalle->>'a' = 'en_progreso')::int as c_avanzo,
           0 as c_com
      from actividad a
     where a.creado_en >= p_desde and a.creado_en < p_hasta
       and a.entidad_tipo in ('publicacion', 'publicaciones')
       and (p_actor is null or a.actor_id = p_actor)
    union all
    /* Los comentarios del mes por persona venían de otra consulta suelta, con
       el mismo `.limit(6000)` de mentira. Van aquí: es el mismo mes, la misma
       persona y la misma pantalla. */
    select c.autor_id,
           extract(day from c.creado_en at time zone 'America/Lima')::int,
           0, 0, 0, 1
      from comentarios c
     where c.creado_en >= p_desde and c.creado_en < p_hasta
       and (p_actor is null or c.autor_id = p_actor)
  )
  select uid, d,
         sum(c_creo)::bigint, sum(c_cerr)::bigint,
         sum(c_avanzo)::bigint, sum(c_com)::bigint
    from ev
   where uid is not null   -- lo del bot no es trabajo de una persona
   group by 1, 2;
$$;

/* El desglose por TIPO de lo que se cerró en el mes. Va aparte porque
   necesita cruzar con `publicaciones`, y meterlo en la función de arriba
   obligaría a arrastrar el tipo por todas las filas para usarlo en una sola
   barra.
   ⚠ Cuenta EVENTOS, no casos: un caso que se cierra, se reabre y se vuelve a
   cerrar suma dos. Es lo que hacía la página y es lo correcto para esta
   barra, que mide trabajo hecho en el mes y no inventario. */
create or replace function pulso_cerrados(p_desde timestamptz, p_hasta timestamptz)
returns table (tipo text, n bigint)
language sql
stable
as $$
  select coalesce(p.tipo, 'otro')::text, count(*)::bigint
    from actividad a
    /* `left join` y no `join`: un cierre cuya publicación se borró después
       seguía contándose como «otro» en el código viejo. Con un join interior
       desaparecería, y la barra diría que ese mes se cerró menos de lo que se
       cerró. Un dato incompleto no puede convertirse en un dato menor. */
    left join publicaciones p on p.id = a.entidad_id
   where a.creado_en >= p_desde and a.creado_en < p_hasta
     and a.entidad_tipo in ('publicacion', 'publicaciones')
     and a.tipo = 'estado'
     and a.detalle->>'campo' = 'estado'
     and a.detalle->>'a' = 'resuelta'
   group by 1;
$$;

-- SECURITY INVOKER (el de por defecto, no se toca): leen con los permisos de
-- quien llama, así que las políticas de RLS siguen mandando.
grant execute on function pulso_mes(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function pulso_cerrados(timestamptz, timestamptz) to authenticated;

-- PostgREST guarda en memoria la forma de cada función y no la revisa solo.
notify pgrst, 'reload schema';


-- ── VERIFICAR ──
-- Lo primero cuadra el bicho de las grafías: si 'publicaciones' tiene filas de
-- tipo 'estado' y 'publicacion' no, la matriz del pulso llevaba contando cero.
-- Lo segundo es el mes en curso ya agregado: son decenas de filas, no miles.
select 'grafías' as que, entidad_tipo as a, tipo as b,
       count(*)::text as c, '' as d
  from actividad
 where entidad_tipo in ('publicacion', 'publicaciones')
 group by 1, 2, 3
union all
select 'mes en curso', coalesce(p.nombre, '—'), 'creó ' || m.creo,
       'cerró ' || m.cerr, 'comentó ' || m.coment
  from (
    select actor_id, sum(creo) as creo, sum(cerr) as cerr, sum(coment) as coment
      from pulso_mes(date_trunc('month', now()), date_trunc('month', now()) + interval '1 month')
     group by 1
  ) m
  left join perfiles p on p.id = m.actor_id
 order by 1 desc, 2, 3;
