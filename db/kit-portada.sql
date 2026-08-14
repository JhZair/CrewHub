-- ============================================================
--  db/kit-portada.sql — LA CARA DEL KIT SE ELIGE, NO SE HEREDA
--
--  El problema, con nombre y apellido: el «Kit Zhiyun Molus G60» sale en la
--  lista con la foto de un trípode. No es un fallo de pintado — es que la
--  cara del kit era «la primera pieza que tenga foto», y las piezas van en
--  orden de folio: A-028 (trípode) antes que A-031 (la Molus G60 que da
--  nombre al kit).
--
--  ── POR QUÉ NO SE ARREGLA REORDENANDO ──
--  La tentación es dejar mover las piezas y que la primera mande. Pero el
--  orden de un kit NO es libre: es el de los folios, y eso está decidido a
--  propósito (ver el comentario en components/PanelKits.tsx). Un kit se
--  repasa contra la bolsa que se está llenando, y las etiquetas físicas
--  están numeradas: si el orden de la pantalla deja de ser el de las
--  etiquetas, contar deja de ser barrer con el dedo.
--
--  O sea que son DOS cosas distintas metidas en una:
--    · el ORDEN sirve para CONTAR   → manda el folio
--    · la PORTADA sirve para RECONOCER → manda el aparato principal
--  Se separan, y cada una queda gobernada por lo que le corresponde.
--
--  `on delete set null`: si la pieza elegida se da de baja del inventario, el
--  kit pierde su portada y vuelve a la regla automática. No se cae, y no se
--  queda apuntando a una fila que ya no existe.
--
--  Idempotente. Al final verifica.
-- ============================================================

alter table kits add column if not exists portada_equipo_id uuid
  references equipamiento(id) on delete set null;

comment on column kits.portada_equipo_id is
  'Qué pieza representa al kit en las listas. Nulo = la primera con foto, en orden de folio.';

-- No hace falta índice: se lee una vez por kit al pintar la lista y son
-- decenas de filas, no miles. Un índice aquí sería mantenimiento sin beneficio.

-- ── VERIFICAR ──
select case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'kits'
       and column_name = 'portada_equipo_id')
  then '✅ kits.portada_equipo_id existe'
  else '❌ no se creó' end as estado;

-- Cuántos kits ya eligieron cara. Al correr esto por primera vez es 0 y está
-- bien: la regla automática sigue funcionando para todos.
select count(*) filter (where portada_equipo_id is not null) as con_portada,
       count(*)                                              as kits_totales
  from kits where retirado_en is null;
