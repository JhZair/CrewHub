-- ============================================================
--  UNA SOLA CARA POR PERSONA
--
--  La cara de alguien vivía en dos sitios:
--    · `perfiles.avatar_url`  — la foto de la CUENTA, la que trae Google al
--      entrar por primera vez (ver `crear_perfil()` en db/schema.sql).
--    · `personas.foto_url`    — la de la FICHA, la que sube administración
--      desde /entidad/persona (ver db/persona-foto.sql).
--
--  Y cada pantalla miraba una. Wilfredo y Zenón, que tienen la de la ficha y
--  no la de la cuenta, salían con sus iniciales en la portada, en la agenda y
--  en los entregables del acta; se arregló dos veces, pantalla a pantalla, y
--  a la tercera quedó claro que el problema no era de las pantallas. Hay unas
--  veinte consultas que leen `perfiles.avatar_url` —el avatar del autor de un
--  comentario, el del responsable de un caso, el del pulso del equipo— y
--  parchearlas de una en una es garantizar que alguna se queda sin arreglar y
--  nadie lo nota hasta que alguien lo reporta.
--
--  ── LA DE LA FICHA MANDA ──
--  La sube administración a propósito y es la que el equipo reconoce; la de
--  Google la pone el buscador sin que nadie decida. Cuando hay las dos, gana
--  la ficha.
--
--  ⚠ Esto ESCRIBE en `perfiles.avatar_url`. No se pierde nada que no se pueda
--  recuperar —la de Google se vuelve a leer en cada inicio de sesión solo al
--  CREAR el perfil, así que en la práctica lo que hay ahí es lo que se guardó
--  el primer día—, pero conviene saber que la columna deja de ser «lo que dijo
--  Google» y pasa a ser «la cara de esta persona».
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/persona-foto.sql.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'personas'
                    and column_name = 'foto_url') then
    raise exception 'Falta personas.foto_url: corre antes db/persona-foto.sql';
  end if;
end $$;


-- ── 1. LAS QUE YA ESTÁN ──
-- Solo donde la ficha tiene foto Y está enlazada a una cuenta. Una persona sin
-- `usuario_id` no tiene perfil que actualizar, y una ficha sin foto no debe
-- borrar la de Google: rellenar no es lo mismo que pisar con nada.
update perfiles p
   set avatar_url = pe.foto_url
  from personas pe
 where pe.usuario_id = p.id
   and pe.foto_url is not null
   and pe.foto_url <> ''
   and coalesce(p.avatar_url, '') is distinct from pe.foto_url;


-- ── 2. Y LAS QUE VENGAN ──
--
-- Sin esto, la copia de arriba sería una foto de un instante: el día que
-- alguien cambie la imagen de una ficha, esa cara se quedaría vieja en las
-- veinte pantallas hasta que a alguien se le ocurriera volver a correr este
-- archivo. Un arreglo que hay que acordarse de repetir no es un arreglo.
--
-- `security definer` porque escribe en `perfiles`, que tiene su propia RLS:
-- quien edita la ficha de una persona no tiene por qué poder tocar perfiles a
-- mano, y aquí no lo hace — lo hace el disparador, con una regla fija.
-- `search_path` clavado: sin él, un esquema en el `search_path` de quien
-- dispara podría suplantar `perfiles`, que es la vía clásica para colar
-- código en una función `definer`.
create or replace function public.sincronizar_cara_persona()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin cuenta no hay perfil que tocar.
  if new.usuario_id is null then return new; end if;

  -- La ficha se quedó sin foto: NO se borra la de la cuenta. Quitar la foto de
  -- una ficha es «ya no tengo esta», no «que esta persona no tenga cara».
  if new.foto_url is null or new.foto_url = '' then return new; end if;

  update perfiles
     set avatar_url = new.foto_url
   where id = new.usuario_id
     -- Sin esto, cada guardado de la ficha escribiría en `perfiles` aunque no
     -- cambie nada: una escritura por nada, y un evento de realtime que hace
     -- repintar pantallas sin motivo.
     and coalesce(avatar_url, '') is distinct from new.foto_url;

  return new;
end $$;

drop trigger if exists al_cambiar_foto_persona on personas;
-- También en el INSERT: una persona puede nacer con foto y cuenta a la vez
-- (importación, alta desde /admin), y solo con el update esa cara no llegaría
-- nunca al perfil.
-- La condición en el `when` y no dentro de la función: así el disparador ni se
-- ejecuta cuando se guarda una ficha sin tocar la foto ni la cuenta, que es la
-- inmensa mayoría de los guardados.
create trigger al_cambiar_foto_persona
  after insert or update of foto_url, usuario_id on personas
  for each row
  when (new.usuario_id is not null and new.foto_url is not null and new.foto_url <> '')
  execute function public.sincronizar_cara_persona();


-- ── LO QUE ESTO NO HACE ──
-- No copia al revés (de la cuenta a la ficha). La ficha es de administración y
-- la cuenta es de quien entra: escribir en la ficha desde el inicio de sesión
-- de alguien sería cambiar un dato del expediente sin que nadie lo pida.
-- Tampoco borra: ver el `if` de arriba.

notify pgrst, 'reload schema';
