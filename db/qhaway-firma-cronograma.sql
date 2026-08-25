-- ============================================================
--  db/qhaway-firma-cronograma.sql — DEVOLVERLE AL BOT LO QUE ESCRIBIÓ
--
--  ⚠ CORRER DESPUÉS de volver a aplicar db/qhaway-matutino.sql, que es donde
--  vive la función y donde se arregló el origen. Este fichero solo repara las
--  filas que ya se crearon mal; sin el arreglo de la función, mañana a las
--  7:30 vuelven a nacer torcidas.
--
--  ── QUÉ PASABA ──
--  La ronda insertaba el caso con `autor_id = coalesce(responsable, bot)`.
--  Como casi toda actividad del cronograma tiene responsable, el caso quedaba
--  firmado por esa persona: la ficha decía «CREADO: John Oros» encima de un
--  cuerpo que dice «Generada por Qhaway desde el cronograma».
--
--  No es cosmético. `autor_id` es lo que contesta «¿quién decidió esto?», y
--  es la columna que se mira cuando algo hay que explicar. Un caso que nadie
--  abrió atribuido a alguien que no lo abrió no lo corrige nadie, porque
--  leerlo no produce ninguna sorpresa.
--
--  ── A QUIÉN SE LE CAMBIA LA FIRMA ──
--  Solo a los casos cuya BITÁCORA lleva la firma del propio bot. La ronda
--  escribe en `actividad` un renglón con `tipo='bot'`, `regla='cronograma'` y
--  un mensaje suyo en primera persona («Creé este caso…», «lo puse en el
--  radar»). Materializar A MANO desde el cronograma escribe otro distinto
--  («Caso creado desde el cronograma») y ESE sí lo hizo una persona: se queda
--  como está.
--  Es a propósito no filtrar por el texto del cuerpo: el cuerpo lo puede
--  editar cualquiera desde la ficha, y una firma que se puede reescribir sin
--  querer no sirve para decidir de quién es la autoría.
--
--  Idempotente: correrlo dos veces no cambia nada la segunda.
--  Correr en Supabase → SQL Editor.
-- ============================================================

do $$
declare
  bot uuid;
  n int;
begin
  select id into bot from perfiles
   where nombre in ('Bot Qhaway', 'Qhaway') order by nombre limit 1;
  /* Sin cuenta del bot no se toca nada. Elegir «otro humano» como firma de
     respaldo es justo el error que este fichero viene a deshacer. */
  if bot is null then
    raise exception 'No existe el perfil del bot (Bot Qhaway). Corre db/rename-bot-qhaway.sql primero.';
  end if;

  update publicaciones p
     set autor_id = bot
   where p.autor_id is distinct from bot
     and exists (
       select 1 from actividad a
        where a.entidad_tipo = 'publicacion'
          and a.entidad_id = p.id
          and a.tipo = 'bot'
          and a.detalle->>'regla' = 'cronograma'
          and (a.detalle->>'mensaje' like 'Creé este caso%'
            or a.detalle->>'mensaje' like 'Hito del concurso acercándose%')
     );
  get diagnostics n = row_count;
  raise notice 'Casos del cronograma devueltos al bot: %', n;
end $$;


-- ============================================================
--  VERIFICAR
-- ============================================================
-- 1. Cuántos casos del cronograma firma cada quien. Después de correr esto,
--    la única fila con mensaje de bot debería ser la del bot; las de personas
--    son las materializadas A MANO, que están bien así.
-- 2. Que no quede ninguno firmado por un humano con la bitácora del bot.
select 'quién firma los casos del cronograma' as prueba,
       coalesce(pf.nombre, '(sin autor)') as quien,
       case when a.detalle->>'mensaje' like 'Caso creado desde%' then 'a mano' else 'ronda del bot' end as origen,
       count(*)::text as n
  from publicaciones p
  join actividad a on a.entidad_tipo = 'publicacion' and a.entidad_id = p.id
                  and a.tipo = 'bot' and a.detalle->>'regla' = 'cronograma'
  left join perfiles pf on pf.id = p.autor_id
 group by 1, 2, 3
 order by 3, 4 desc;
