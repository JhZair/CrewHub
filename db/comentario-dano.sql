-- ============================================================
-- ETIQUETAS LIBRES + BANDERA DE DAÑO EN LOS COMENTARIOS
--
-- El hilo de un uso de equipo evoluciona: un comentario puede llevar ETIQUETAS
-- libres tipo chip (como el muro del proyecto) —«daño», «cargador faltante»,
-- «pendiente», o cualquiera que haga falta—, en vez de una sola casilla fija.
-- «daño» sigue siendo especial: cuando una etiqueta es un daño, la UI pinta el
-- comentario como avería y el equipo pasa a «en reparación». Esa condición se
-- guarda derivada en `es_dano` (la calcula la acción al crear) para no volver a
-- normalizar acentos en cada render ni al filtrar.
--
-- `imagenes` ya existe en `comentarios` (la usan casos y objetos). Idempotente,
-- SIN transacción externa (lección pgBouncer).
-- ============================================================

-- `imagenes` se usa en casos/objetos/bitácora desde hace tiempo (existe en la BD
-- viva), pero nunca quedó en una migración: se declara aquí para que un rebuild
-- limpio del esquema no falle al insertar comentarios con foto.
alter table comentarios add column if not exists imagenes jsonb not null default '[]'::jsonb;
alter table comentarios add column if not exists etiquetas text[] not null default '{}';
alter table comentarios add column if not exists es_dano boolean not null default false;

comment on column comentarios.etiquetas is
  'Etiquetas libres del comentario (chips), acotadas a su hilo. Ej. daño, '
  'cargador faltante, pendiente. Reusa el patrón del muro pero por comentario.';
comment on column comentarios.es_dano is
  'Derivada: true si alguna etiqueta es un daño. La UI lo resalta y, en el hilo '
  'de un uso de equipo, al crearlo el equipo pasa a en_reparacion.';

create index if not exists idx_com_dano on comentarios(es_dano) where es_dano;

select count(*) as comentarios_de_dano from comentarios where es_dano;
