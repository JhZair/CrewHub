-- ============================================================
-- UN CASO POR SECCIÓN DEL EXPEDIENTE
--
-- Las cuatro secciones del formulario DAFO son cuatro trabajos distintos y los
-- hace gente distinta: la A la arma quien lleva la papelería de la empresa, la
-- C la escribe el equipo creativo, la D la cuadra contabilidad. Hasta ahora el
-- expediente decía CUÁNTO falta pero no había forma de encargarlo: el reparto
-- vivía en el chat y se perdía.
--
-- Se guarda qué caso atiende cada sección — `{"C": "<uuid del caso>"}` —, no
-- una copia del caso. El caso es un caso normal: tiene responsable, plazo,
-- comentarios y aparece en el tablero como cualquier otro. Aquí solo queda el
-- puente para no volver a crearlo dos veces ni buscarlo a mano.
--
-- Deliberadamente NO va dentro de `expediente`: esa columna la reescribe
-- `set_expediente_campo` con jsonb_build_object, que reemplaza el objeto del
-- campo entero — cualquier clave extra que le colgáramos se perdería al
-- siguiente guardado.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================

alter table postulaciones
  add column if not exists expediente_casos jsonb not null default '{}'::jsonb;

/* RESERVA, no asignación. Devuelve el caso que QUEDÓ asignado a esa sección,
   sea el que acabas de proponer o el que ya estaba.

   Dos personas abriendo la misma sección a la vez leían «no hay caso», creaban
   una tarea cada una y la última pisaba a la otra: dos tareas idénticas en el
   tablero y una de ellas imposible de encontrar desde el expediente. El
   `and not (... ? clave)` hace que solo escriba quien llega primero; el que
   pierde recibe el id del ganador y borra la suya.

   `caso null` libera la sección — hace falta cuando el caso encargado se
   archiva o se descarta: sin liberar, la sección quedaba encargada para
   siempre a algo que ya no está en ningún tablero. */
drop function if exists public.set_expediente_caso(uuid, text, uuid);
create or replace function public.set_expediente_caso(
  pid uuid, clave text, caso uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare actual uuid;
begin
  if caso is null then
    update postulaciones
       set expediente_casos = coalesce(expediente_casos, '{}'::jsonb) - clave
     where id = pid;
    return null;
  end if;

  update postulaciones
     set expediente_casos = jsonb_set(
       coalesce(expediente_casos, '{}'::jsonb),
       array[clave], to_jsonb(caso::text), true)
   where id = pid
     and not (coalesce(expediente_casos, '{}'::jsonb) ? clave);

  -- Lo que quedó: el nuevo si ganó, el de la otra persona si perdió, y NULL
  -- si la postulación no existe (que es lo que el llamador necesita saber).
  select (expediente_casos ->> clave)::uuid into actual
    from postulaciones where id = pid;
  return actual;
end $$;

-- Igual que la otra: `security definer` + EXECUTE a PUBLIC por defecto dejaría
-- a `anon` (la anon key es pública) tocar cualquier postulación sin login.
revoke all on function public.set_expediente_caso(uuid, text, uuid) from public;
grant execute on function public.set_expediente_caso(uuid, text, uuid) to authenticated;

-- Verificación
select proname from pg_proc where proname = 'set_expediente_caso';
