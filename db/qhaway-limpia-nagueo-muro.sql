-- ============================================================
--  db/qhaway-limpia-nagueo-muro.sql
--
--  Borra lo que el Bot dijo de más ANTES de la corrección de
--  db/qhaway-matutino.sql (es_informativa): meses de «¿sigue vivo?»
--  a notas del muro y avisos, que ninguna de las dos podía callar
--  porque ninguna de las dos se cierra.
--
--  Corre PRIMERO qhaway-matutino.sql. Si no, esto limpia hoy y mañana
--  a las 7:30 vuelve a llenarse.
--
--  ⚠ Esto BORRA historial. Es historial que el propio sistema fabricó y
--    que no describe ningún hecho —«este caso lleva 3 días sin
--    actividad» sobre algo que no es un caso—, pero borrar es borrar:
--    el paso 1 solo cuenta. Míralo antes de correr el paso 2.
-- ============================================================

-- ── 1. QUÉ SE VA A BORRAR (no toca nada) ──
select 'actividad · ¿sigue vivo? sobre informativas' as que, count(*) as cuantos
from actividad a
join publicaciones p on p.id = a.entidad_id
where a.entidad_tipo = 'publicacion' and a.tipo = 'bot'
  and a.detalle->>'regla' = 'estancado'
  and public.es_informativa(p.tipo)
union all
select 'notificaciones · «lleva 3 días dormido» sobre informativas', count(*)
from notificaciones n
join publicaciones p on p.id = n.publicacion_id
where n.tipo = 'bot' and n.mensaje like '%dormido%'
  and public.es_informativa(p.tipo)
union all
select 'publicaciones informativas afectadas', count(distinct p.id)
from actividad a
join publicaciones p on p.id = a.entidad_id
where a.entidad_tipo = 'publicacion' and a.tipo = 'bot'
  and a.detalle->>'regla' = 'estancado'
  and public.es_informativa(p.tipo);

-- Las más nagueadas, por si quieres verlas en la aplicación antes:
select p.tipo, p.titulo, count(*) as veces,
       min(a.creado_en)::date as desde, max(a.creado_en)::date as hasta
from actividad a
join publicaciones p on p.id = a.entidad_id
where a.entidad_tipo = 'publicacion' and a.tipo = 'bot'
  and a.detalle->>'regla' = 'estancado'
  and public.es_informativa(p.tipo)
group by p.tipo, p.titulo
order by count(*) desc
limit 20;

-- ── 2. BORRAR (descomenta las dos sentencias) ──
-- delete from actividad a
--  using publicaciones p
--  where p.id = a.entidad_id
--    and a.entidad_tipo = 'publicacion' and a.tipo = 'bot'
--    and a.detalle->>'regla' = 'estancado'
--    and public.es_informativa(p.tipo);
--
-- delete from notificaciones n
--  using publicaciones p
--  where p.id = n.publicacion_id
--    and n.tipo = 'bot' and n.mensaje like '%dormido%'
--    and public.es_informativa(p.tipo);

-- ── 3. COMPROBAR (después de borrar, las tres cuentas dan 0) ──
-- Repite el select del paso 1.
