-- ============================================================
--  qhaway_matutino() — la ronda de las 7:30
--
--  ESTE ARCHIVO ES LA FUENTE DE VERDAD DE LA FUNCIÓN.
--  Vivía solo dentro de Postgres: materializa casos, notifica y manda
--  el webhook a Chat —o sea, es la pieza más activa del sistema— y no
--  se podía leer desde el repo ni tenía historial en git. Los bichos
--  que arrastraba (avisos en un estado imposible, alertas de empresas
--  externas, DNI de gente que no es nuestra) sobrevivieron justamente
--  porque nadie los veía al leer el proyecto.
--  Si se edita en Supabase, hay que traer el cambio aquí.
--
--  ⏰ EL ORDEN IMPORTA — y los dos horarios viven en sitios distintos:
--
--    11:00 UTC · 06:00 Lima  →  /api/cron/sunat        (vercel.json)
--    12:30 UTC · 07:30 Lima  →  qhaway_matutino()      (pg_cron, abajo)
--
--  Esta función solo LEE el estado SUNAT; quien lo actualiza es el cron
--  de Vercel. Si el bot habla antes de esa ronda, reporta el estado de
--  ayer TODOS los días. Y eso pasaba: SUNAT estaba a las 13:00 UTC,
--  media hora DESPUÉS del mensaje. Nadie lo vio nunca porque un horario
--  estaba en el repo y el otro dentro de Postgres.
--  Si se cambia cualquiera de los dos, SUNAT va primero.
--
--  El job (así está hoy, para no perderlo de vista):
--    select cron.schedule('qhaway-matutino', '30 12 * * *',
--                         $$select public.qhaway_matutino()$$);
-- ============================================================

create or replace function public.qhaway_matutino()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  sinres int; enprog int; dormidos int := 0; dni_alerta text := ''; dni_n int := 0;
  dni_raros text := ''; dni_raros_n int := 0;
  porvencer int := 0; vencidos int := 0; materializadas int := 0;
  emp_alerta text := ''; emp_sinverif int := 0;
  lista_venc text := ''; msg text; hook text; r record; d int; dest uuid;
  nueva_pub uuid; autor_defecto uuid; contexto text; es_hito boolean;
  sep text := E'\n' || '━━━━━━━━━━━━━━━━━━━━';
begin
  /* El bot firma sus obras.
     Buscaba 'Qhaway' a secas, pero la cuenta se renombró a 'Bot Qhaway'
     (db/rename-bot-qhaway.sql) y esta función no se enteró: desde ese día
     caía al respaldo —«el humano activo más antiguo»— y TODOS los casos
     del cronograma quedaron firmados por esa persona. La bitácora decía
     "Bot Qhaway creó la publicación" y la ficha decía otra cosa.
     Ahora acepta los dos nombres. */
  select id into autor_defecto from perfiles
   where nombre in ('Bot Qhaway', 'Qhaway') order by nombre limit 1;
  /* Sin respaldo humano: si el bot no tiene cuenta, que se note. Firmar
     con el primer humano que aparezca es peor que fallar — le atribuye a
     alguien un trabajo que no hizo, y nadie lo revisa nunca. */
  if autor_defecto is null then
    raise exception 'No existe el perfil del bot (Bot Qhaway). Corre db/rename-bot-qhaway.sql o crea la cuenta.';
  end if;

  -- 📅 MATERIALIZACIÓN (hitos de concurso solo si tenemos postulaciones en juego)
  for r in
    select ca.*, p.nombre as proy_nombre,
           cv.codigo as conv_codigo, cv.nombre as conv_nombre, cv.anio as conv_anio
    from cronograma_actividades ca
    left join proyectos p on p.id = ca.proyecto_id
    left join convocatorias cv on cv.id = ca.convocatoria_id
    where ca.estado = 'planificada' and ca.publicacion_id is null
      and ca.fecha_inicio - coalesce(ca.dias_anticipacion, 7) <= current_date
      and (
        ca.convocatoria_id is null
        or ca.clase <> 'hito_externo'
        or exists (select 1 from postulaciones po
                   where po.convocatoria_id = ca.convocatoria_id
                     and po.estado in ('en_preparacion','enviada','finalista'))
      )
  loop
    es_hito := (r.clase = 'hito_externo');
    contexto := coalesce(
      r.proy_nombre,
      nullif(trim(coalesce(r.conv_nombre, r.conv_codigo, '')
        || case when r.conv_anio is not null then ' ' || r.conv_anio else '' end), ''),
      'el cronograma');
    insert into publicaciones (autor_id, responsable, tipo, titulo, cuerpo, estado, fecha_limite)
    values (coalesce(r.responsable, autor_defecto), r.responsable,
      case when es_hito then 'aviso' else 'tarea' end,
      case when es_hito then '🏛 ' || r.nombre || ' — ' || contexto else r.nombre end,
      case when es_hito
        then 'Hito del concurso «' || contexto || '» (' || coalesce(r.conv_codigo, '—') || '): '
             || fecha_legible(r.fecha_inicio) || '. Fecha fijada por la institución — dar seguimiento.'
        else 'Generada por Qhaway desde el cronograma de ' || contexto ||
             '. Ventana: ' || fecha_legible(r.fecha_inicio) || ' → ' || coalesce(fecha_legible(r.fecha_fin), '—') || '.'
      end,
      -- Un aviso no se trabaja: está vigente o archivado. Salían en
      -- 'en_progreso', que no es una opción suya en la interfaz: el combo
      -- mostraba "Vigente" y la base decía otra cosa, y además engordaban
      -- el contador de "En progreso" con trabajo que nadie trabajaba.
      case when es_hito then 'abierta' else 'en_progreso' end,
      coalesce(r.fecha_fin, r.fecha_inicio))
    returning id into nueva_pub;
    insert into publicacion_vinculos (publicacion_id, entidad_tipo, entidad_id)
    values (nueva_pub,
      case when r.proyecto_id is not null then 'proyecto' else 'convocatoria' end,
      coalesce(r.proyecto_id, r.convocatoria_id));
    insert into actividad (entidad_tipo, entidad_id, tipo, detalle)
    values ('publicacion', nueva_pub, 'bot', jsonb_build_object(
      'mensaje', case when es_hito then 'Hito del concurso acercándose — lo puse en el radar'
                      else 'Creé este caso desde el cronograma (' || coalesce(r.dias_anticipacion,7) || ' días antes)' end,
      'regla', 'cronograma'));
    update cronograma_actividades set estado = 'materializada', publicacion_id = nueva_pub
    where id = r.id;
    if r.responsable is not null then
      insert into notificaciones (usuario_id, publicacion_id, tipo, mensaje)
      values (r.responsable, nueva_pub, 'asignacion',
        case when es_hito then '🏛 Hito: «' || r.nombre || '»' else '📅 Del cronograma: «' || r.nombre || '»' end);
    end if;
    materializadas := materializadas + 1;
  end loop;

  select count(*) into sinres from publicaciones where estado = 'abierta';
  select count(*) into enprog from publicaciones where estado = 'en_progreso';

  -- ⏰ VENCIMIENTOS
  for r in
    select p.id, p.titulo, p.responsable, p.autor_id, (p.fecha_limite - current_date) as dias
    from publicaciones p
    where p.estado in ('abierta','en_progreso') and p.fecha_limite is not null
      and (p.fecha_limite - current_date) <= 7
    order by p.fecha_limite
  loop
    d := r.dias;
    if d in (7, 2, 0) or d < 0 then
      insert into actividad (entidad_tipo, entidad_id, tipo, detalle)
      values ('publicacion', r.id, 'bot', jsonb_build_object(
        'mensaje', case when d < 0 then '⚠ VENCIDO hace ' || abs(d) || ' día(s)'
                        when d = 0 then '⏰ VENCE HOY'
                        when d = 2 then '⏰ Vence en 2 días'
                        else '📅 Vence en 7 días' end, 'regla', 'vencimiento'));
      dest := coalesce(r.responsable, r.autor_id);
      if dest is not null then
        insert into notificaciones (usuario_id, publicacion_id, tipo, mensaje)
        values (dest, r.id, 'vencimiento',
          case when d < 0 then '⚠ «' || r.titulo || '» está VENCIDO'
               when d = 0 then '⏰ «' || r.titulo || '» vence HOY'
               else '⏰ «' || r.titulo || '» vence en ' || d || ' días' end);
      end if;
    end if;
    if d < 0 then vencidos := vencidos + 1; else porvencer := porvencer + 1; end if;
    if vencidos + porvencer <= 4 then
      lista_venc := lista_venc || E'\n' || '   • ' || r.titulo || ' ('
        || case when d < 0 then 'vencido' when d = 0 then 'HOY' else 'en ' || d || ' días' end || ')';
    end if;
  end loop;

  -- 💤 DORMIDOS
  for r in
    select p.id, p.titulo, p.responsable, p.autor_id from publicaciones p
    where p.estado in ('abierta','en_progreso')
      and not exists (select 1 from actividad a
        where a.entidad_tipo = 'publicacion' and a.entidad_id = p.id
          and a.creado_en > now() - interval '3 days')
  loop
    insert into actividad (entidad_tipo, entidad_id, tipo, detalle)
    values ('publicacion', r.id, 'bot',
      jsonb_build_object('mensaje','Este caso lleva 3 días sin actividad — ¿sigue vivo?','regla','estancado'));
    dest := coalesce(r.responsable, r.autor_id);
    if dest is not null then
      insert into notificaciones (usuario_id, publicacion_id, tipo, mensaje)
      values (dest, r.id, 'bot', '💤 «' || r.titulo || '» lleva 3 días dormido');
    end if;
    dormidos := dormidos + 1;
  end loop;

  -- 🪪 DNI — solo de gente nuestra: personal y colaboradores activos.
  -- Antes miraba a TODAS las personas: contactos, vetados, gente con la que
  -- no trabajamos. Pedirle el DNI a alguien que vetamos no es una alerta,
  -- es ruido — y el ruido enseña a no leer la lista.
  for r in
    select nombre, dni_vencimiento, (dni_vencimiento - current_date) as dias
    from personas
    where dni_vencimiento is not null
      and dni_vencimiento <= current_date + 60
      and estado = 'activo'
      and tipo in ('personal','colaborador')
    order by dni_vencimiento
  loop
    -- Un DNI "vencido hace 44 años" no está vencido: la fecha está mal
    -- cargada (suele ser la de nacimiento). Va aparte, como error de dato,
    -- para no contaminar la lista de los que sí hay que renovar.
    if r.dias < -3650 then
      dni_raros_n := dni_raros_n + 1;
      if dni_raros_n <= 4 then
        dni_raros := dni_raros || E'\n' || '   🔧 ' || r.nombre || ': dice ' || fecha_legible(r.dni_vencimiento);
      end if;
    else
      dni_n := dni_n + 1;
      if dni_n <= 6 then
        dni_alerta := dni_alerta || E'\n' || '   🪪 ' || r.nombre || ': ' ||
          case when r.dias < 0 then 'VENCIDO hace ' || abs(r.dias) || ' días'
               when r.dias = 0 then 'vence HOY'
               else 'vence en ' || r.dias || ' días' end;
      end if;
    end if;
  end loop;

  -- 🏢 SUNAT — solo las propias y activas: de una aliada o externa
  -- mantenemos el dato al día, pero su SUNAT no lo arreglamos nosotros.
  -- Incluye "no habido": una empresa activa pero no habida tampoco puede
  -- postular, y esa consulta jamás la veía.
  for r in
    select nombre, estado_sunat, condicion_sunat from empresas
    where estado = 'activa'
      and coalesce(relacion, 'propia') = 'propia'
      and ((estado_sunat is not null and estado_sunat <> 'activo')
           or condicion_sunat = 'no_habido')
  loop
    emp_alerta := emp_alerta || E'\n' || '   ⚠ ' || r.nombre || ': '
      || trim(both ' · ' from
           coalesce(nullif(replace(r.estado_sunat, '_', ' '), 'activo'), '')
           || case when r.condicion_sunat = 'no_habido' then ' · no habido' else '' end);
  end loop;
  select count(*) into emp_sinverif from empresas
  where estado = 'activa' and coalesce(relacion, 'propia') = 'propia'
    and (fecha_verificacion_sunat is null or fecha_verificacion_sunat < current_date - 60);

  -- ── El mensaje: por secciones, y las vacías no se imprimen ──
  -- Una sección con "0" no informa nada y empuja hacia abajo lo que sí.
  msg := '🤖 *Ronda matutina de Qhaway* · ' || fecha_legible(current_date);

  msg := msg || sep || E'\n' || '📌 *EL TABLERO*' || E'\n'
      || '🔴 Sin resolver: ' || sinres || '     🟡 En progreso: ' || enprog
      || case when materializadas > 0
              then E'\n' || '📅 Del cronograma creé ' || materializadas || ' caso(s)' else '' end
      || case when dormidos > 0
              then E'\n' || '💤 Despertados: ' || dormidos else '' end;

  if porvencer + vencidos > 0 then
    msg := msg || sep || E'\n' || '⏰ *PLAZOS* — '
        || porvencer || ' por vencer'
        || case when vencidos > 0 then '  ·  ⚠ ' || vencidos || ' vencidos' else '' end
        || lista_venc
        || case when porvencer + vencidos > 4
                then E'\n' || '   … y ' || (porvencer + vencidos - 4) || ' más' else '' end;
  end if;

  if emp_alerta <> '' or emp_sinverif > 0 then
    msg := msg || sep || E'\n' || '🏢 *EMPRESAS*'
        || emp_alerta
        || case when emp_sinverif > 0
                then E'\n' || '   🔍 ' || emp_sinverif || ' sin verificar en SUNAT (60+ días)' else '' end;
  end if;

  if dni_n > 0 or dni_raros_n > 0 then
    msg := msg || sep
        || case when dni_n > 0 then E'\n' || '🪪 *DNI DEL EQUIPO* (' || dni_n || ')' || dni_alerta
                     || case when dni_n > 6 then E'\n' || '   … y ' || (dni_n - 6) || ' más' else '' end
                else '' end
        || case when dni_raros_n > 0
                then E'\n' || '🔧 *Fechas de DNI mal cargadas* (' || dni_raros_n || ')' || dni_raros
                else '' end;
  end if;

  msg := msg || sep || E'\n' || '→ https://crew-hub-sigma.vercel.app';

  select valor into hook from qhaway_config where clave = 'chat_webhook';
  if hook is not null then
    perform net.http_post(url := hook,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('text', msg));
  end if;
  return msg;
end
$function$;
