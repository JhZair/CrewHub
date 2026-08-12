-- ════════════════════════════════════════════════════════════════════════
--  EL AVISO SE ACUERDA DE QUÉ COMENTARIO ES
-- ════════════════════════════════════════════════════════════════════════
--  Una notificación de comentario sabía en QUÉ ficha ocurrió, y ahí acababa
--  su memoria. Al pulsarla te dejaba en la bitácora o en el caso, con lo que
--  te habían escrito en algún punto de un hilo de treinta. En una
--  conversación corta no se nota; en la que importa —la que ya lleva un mes—
--  el aviso te deja a buscar exactamente lo que venía a enseñarte.
--
--  Guardando el id del comentario, el enlace puede terminar en `#c-<id>` y
--  llevar al párrafo. Es lo mismo que ya se hizo con las notas del muro
--  (`#pub-<id>`), un nivel más adentro.
--
--  `on delete set null` y NO cascade: si alguien borra el comentario, el
--  aviso NO se borra con él. Se queda sin ancla y vuelve a llevar a la ficha,
--  que es exactamente lo que hacía antes. Con cascade, borrar un comentario
--  haría desaparecer avisos ya leídos del historial de otras personas —una
--  pantalla que dice que algo nunca pasó.
--
--  Sin default y sin backfill: los avisos de antes se quedan en nulo y siguen
--  funcionando como siempre. Nada que corregir hacia atrás.
-- ════════════════════════════════════════════════════════════════════════

alter table notificaciones
  add column if not exists comentario_id uuid references comentarios(id) on delete set null;

-- Para poder saltar del comentario a sus avisos (limpiezas, diagnósticos).
create index if not exists idx_notif_comentario on notificaciones(comentario_id);
