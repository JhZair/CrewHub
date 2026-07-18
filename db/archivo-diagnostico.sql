-- ============================================================
-- DIAGNÓSTICO DEL ARCHIVO — no escribe nada. Solo pregunta.
--
-- Por qué existe:
--   `estado = 'archivada'` hace tres trabajos a la vez y por eso no dice
--   ninguno bien. Palabras de John (17/07): «las tres, según el caso»:
--     · ya no aplica        → el trabajo NO se hizo y no se hará
--     · sacarlo de en medio → sigue vivo, pero estorba (eso es ⏸ En Pausa)
--     · guardar por si acaso → terminó y no queremos verlo, pero sí tenerlo
--   Y encima el bot archiva avisos solos cuando la mayoría se entera: un
--   cuarto significado, y ése sí está bien —es la muerte natural de un aviso.
--
--   Consecuencia hoy: `lib/familia.ts` mete `resuelta` y `archivada` en la
--   misma bolsa (CERRADOS). O sea que el «✅ 2/20» de los sub-casos, las
--   «cerradas» de cada ficha y /pulso SUMAN LO HECHO CON LO ABANDONADO. Un
--   proyecto donde todo se canceló se ve igual que uno donde todo se terminó.
--
--   Vamos a separar los dos ejes:
--     estado       · CÓMO terminó  → resuelta (se hizo) | descartada (ya no)
--     archivado_en · SI ESTORBA    → nulo = a la vista | fecha = guardado
--
-- Por qué este archivo va PRIMERO:
--   La bitácora guarda el `de → a` de cada archivada, así que el pasado NO
--   hay que adivinarlo: se puede leer. Pero antes de escribir un `update`
--   hay que ver qué dice — y si hay casos sin rastro, decidir a propósito
--   qué hacer con ellos en vez de que los pise una suposición.
--   Palabras de John: «los casos archivados son nuestra memoria».
--
-- Corre las cinco y pásame el resultado.
-- ============================================================


-- 1 ▸ ¿CUÁNTO HAY? ------------------------------------------
-- Tamaño del problema. Si son cuatro casos, esto se clasifica a mano.
select
  count(*) filter (where estado = 'archivada')            as archivadas,
  count(*) filter (where estado = 'resuelta')             as resueltas,
  count(*)                                                as total_publicaciones
from publicaciones;


-- 2 ▸ ¿QUÉ ERA ANTES DE ARCHIVARSE? -------------------------
-- LA PREGUNTA. La bitácora sabe de dónde venía cada una:
--   venía de 'resuelta'  → se hizo, y luego se guardó   → resuelta + archivada
--   venía de abierta / en_progreso / seguimiento / en_pausa
--                        → nunca se hizo: ya no aplicaba → descartada
--   '(sin rastro)'       → nadie sabe. Ésas son las que hay que decidir.
select
  coalesce(a.detalle->>'de', '(sin rastro)') as venia_de,
  count(*)                                   as casos
from publicaciones p
left join lateral (
  select act.detalle
  from actividad act
  where act.entidad_tipo = 'publicacion'
    and act.entidad_id   = p.id
    and act.tipo         = 'estado'
    and act.detalle->>'a' = 'archivada'
  order by act.creado_en desc
  limit 1
) a on true
where p.estado = 'archivada'
group by 1
order by 2 desc;


-- 3 ▸ ¿CUÁLES SON LAS QUE NO DEJARON RASTRO? ----------------
-- Si son pocas se clasifican a mano y no se pierde nada. `tipo` importa:
-- un AVISO archivado por el bot es normal —se enteró la mayoría— y esos no
-- son «descartados», son avisos que cumplieron su vida.
select p.id, p.tipo, p.estado, p.titulo, p.creado_en
from publicaciones p
where p.estado = 'archivada'
  and not exists (
    select 1 from actividad act
    where act.entidad_tipo = 'publicacion'
      and act.entidad_id   = p.id
      and act.tipo         = 'estado'
      and act.detalle->>'a' = 'archivada'
  )
order by p.creado_en desc;


-- 4 ▸ AVISOS vs CASOS entre lo archivado -------------------
-- El bot archiva avisos solo (actions.ts: «se enteró la mayoría del equipo»).
-- Ésos NO son «ya no aplica»: cumplieron. Van a `resuelta` + archivado.
select p.tipo, count(*) as archivadas
from publicaciones p
where p.estado = 'archivada'
group by 1
order by 2 desc;


-- 5 ▸ ¿CUÁNDO SE ARCHIVÓ CADA UNA? --------------------------
-- Para rellenar `archivado_en` con la fecha DE VERDAD y no con now().
-- Si esto trae fechas buenas, el archivo conserva su cronología — que es
-- justo lo que lo hace memoria y no un cajón.
select
  count(*)                                   as con_fecha_real,
  min(a.creado_en)::date                     as la_mas_vieja,
  max(a.creado_en)::date                     as la_mas_nueva
from publicaciones p
join lateral (
  select act.creado_en
  from actividad act
  where act.entidad_tipo = 'publicacion'
    and act.entidad_id   = p.id
    and act.tipo         = 'estado'
    and act.detalle->>'a' = 'archivada'
  order by act.creado_en desc
  limit 1
) a on true
where p.estado = 'archivada';
