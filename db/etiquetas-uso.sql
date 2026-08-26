-- ══════════════════════════════════════════════════════════════════════════
-- LAS ETIQUETAS QUE SE USAN, ORDENADAS POR CUÁNTO
--
-- El menú va a llevar directamente a una etiqueta —«Rodaje»— sin pasar por el
-- índice. Para que eso sirva, la lista tiene que estar ORDENADA POR USO: una
-- lista alfabética obliga a leerla entera, y entonces el submenú no ahorra
-- nada frente a entrar a /etiquetas.
--
-- ── POR QUÉ UNA FUNCIÓN Y NO UNA CONSULTA ──
-- Contar desde el navegador significa traerse TODAS las filas de
-- `publicacion_vinculos` con `entidad_tipo='etiqueta'` y agrupar en memoria,
-- que es lo que hace hoy app/etiquetas/page.tsx. Son cientos de filas para
-- calcular ocho números, y encima el corte de PostgREST (Max rows = 1000)
-- puede recortar la lista sin decirlo: los conteos saldrían BAJOS y nadie se
-- enteraría — el fallo que ya se pagó en /pulso y en /buscar.
--
-- Agrupar es exactamente para lo que sirve la base. Lo que viaja son diez
-- filas de tres columnas.
--
-- ── CUENTA EL TRABAJO VIVO, Y POR ESO NO CUADRA CON /etiquetas ──
-- Aquí se cuentan los casos que siguen abiertos: ni archivados, ni resueltos,
-- ni descartados. Es el mismo criterio que usa la ficha de una entidad para
-- decir qué está «activo» (CERRADOS en lib/familia.ts), y es el que hace útil
-- el orden: con los archivados dentro, la etiqueta de un proyecto terminado
-- hace dos años encabezaría el menú para siempre.
--
-- El índice /etiquetas cuenta OTRA cosa —todos los casos, archivados
-- incluidos— y hace bien: ahí el número sirve para decidir si una etiqueta se
-- puede borrar, y una etiqueta con historia no se borra aunque hoy no tenga
-- trabajo. Son dos preguntas distintas con dos números distintos, así que cada
-- pantalla dice cuál está enseñando en vez de dejar al lector cuadrarlos.
-- ══════════════════════════════════════════════════════════════════════════

begin;

-- `drop` antes del `create`: `create or replace` NO puede cambiar el tipo de
-- retorno, así que el día que esta tabla gane una columna el fichero fallaría
-- con «cannot change return type of existing function». Misma trampa que
-- documenta db/pulso-mes.sql.
drop function if exists public.etiquetas_uso(int);

create function public.etiquetas_uso(p_tope int default 12)
returns table (id uuid, nombre text, n bigint)
language sql
stable
security invoker      -- respeta las políticas de quien pregunta; no las esquiva
set search_path = public
as $$
  select e.id, e.nombre, count(p.id) as n
    from etiquetas e
    join publicacion_vinculos v
      on v.entidad_tipo = 'etiqueta' and v.entidad_id = e.id
    join publicaciones p
      on p.id = v.publicacion_id
     and p.archivado_en is null
     and p.estado not in ('resuelta', 'descartada')
   group by e.id, e.nombre
   order by count(p.id) desc, lower(e.nombre)
   -- `coalesce` primero: `least`/`greatest` IGNORAN los nulos, así que sin él
   -- una llamada con p_tope nulo devolvía cincuenta en silencio en vez de doce.
   limit greatest(1, least(coalesce(p_tope, 12), 50));
$$;

comment on function public.etiquetas_uso(int) is
  'Las etiquetas con casos ABIERTOS (ni archivados ni cerrados), de más a menos usadas. Para el submenú del menú. El índice /etiquetas cuenta todos los casos, archivados incluidos, porque allí el número sirve para decidir si se puede borrar.';

-- ⚠ `create or replace function` concede EXECUTE a PUBLIC al crearse, así que
-- el revoke va DESPUÉS y en la misma transacción que el create: la ventana
-- peligrosa está entre los dos, no entre el revoke y el grant.
revoke execute on function public.etiquetas_uso(int) from public;
revoke execute on function public.etiquetas_uso(int) from anon;
grant  execute on function public.etiquetas_uso(int) to authenticated;

commit;

-- PostgREST guarda el esquema en caché: sin esto, la primera llamada puede
-- responder «no existe esa función» sobre una función que acaba de crearse, y
-- la pantalla manda a correr un SQL ya corrido.
notify pgrst, 'reload schema';

-- VERIFICAR
-- select * from public.etiquetas_uso(12);
