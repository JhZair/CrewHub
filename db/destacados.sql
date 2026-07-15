-- Casos destacados en la cabecera del feed.
-- No es un booleano sino una FECHA de caducidad, a propósito: un
-- destacado que no expira se pudre — el aviso del 20 de julio seguiría
-- arriba en agosto y el equipo aprendería a ignorar la zona.
-- Al destacar, la fecha se pone sola: muere con la fecha límite del
-- caso, o a las 2 semanas si no tiene.
-- Además, los casos con fecha límite cercana suben solos sin necesidad
-- de esta columna (y bajan solos al pasar).
alter table publicaciones add column if not exists destacado_hasta timestamptz;

create index if not exists idx_pub_destacado on publicaciones(destacado_hasta)
  where destacado_hasta is not null;
