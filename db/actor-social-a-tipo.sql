-- ============================================================
-- «ACTOR SOCIAL»: DE EQUIPO A TIPO
--
-- «actor social» estaba en el eje EQUIPO (creativo / técnico / artístico /
-- administrativo), donde no encaja: eso es el ÁREA del crew, y un actor social
-- (comunero, protagonista, sujeto del documental) no es del crew —es una CLASE
-- de relación—. Su lugar es el eje TIPO, junto a personal / colaborador /
-- contacto. Así:
--   · sale destacado (no apagado) en el buscador y los listados, como gente
--     principal (lib/personas → esProminente), y
--   · NO se le reclama papeles (DNI, RHE, SUNAT) ni entra en la carga, porque
--     eso sigue siendo solo personal + colaborador (esDelEquipo).
--
-- Mueve a quien ya estaba marcado equipo='actor social' → tipo='actor social',
-- y le vacía el equipo (un actor social no tiene área de crew).
-- Idempotente: re-correrlo no hace nada (ya no quedan filas con ese equipo).
-- ============================================================

update personas
   set tipo   = 'actor social',
       equipo = null
 where equipo = 'actor social';

-- Cuántas quedaron como actor social (debe coincidir con las que marcaste), y
-- verificación de que ya no queda nadie con el equipo viejo (debe ser 0).
select
  (select count(*) from personas where tipo = 'actor social')   as tipo_actor_social,
  (select count(*) from personas where equipo = 'actor social') as equipo_actor_social_resto;
