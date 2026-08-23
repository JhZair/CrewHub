-- ============================================================
--  db/invitaciones.sql — DAR DE ALTA A ALGUIEN SIN UN DESPLIEGUE
--
--  ── EL PROBLEMA ──
--  Quién puede entrar lo decidía `ALLOWED_EMAILS`, una variable de entorno.
--  Sumar a alguien al equipo era entrar a Vercel, editar la variable y volver
--  a desplegar la aplicación entera: un trámite de programador para una
--  decisión que no lo es, y que toca hacer justo el día que la persona llega.
--
--  Y tenía un fallo callado: `if (allowed.length && ...)`. Con la variable
--  vacía o mal escrita, la condición no se evaluaba y entraba CUALQUIERA con
--  una cuenta de Google. Una cerradura que al fallar abre del todo no lo es.
--
--  ── LA LISTA VIVE EN LA BASE ──
--  Una tabla, y una pantalla en /admin para tocarla. Lo demás sigue igual: se
--  entra con Google y el trigger crea el perfil.
--
--  ⚠ NO BORRES `ALLOWED_EMAILS` TODAVÍA. Las dos listas se SUMAN, y la
--  variable cubre un hueco que esta migración no puede llenar: a quien está
--  invitado ahí pero nunca ha entrado, aquí no hay forma de verlo —la variable
--  vive en Vercel, no en la base—. Antes de quitarla, míralas y añade a mano
--  desde /admin los correos que falten.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/cuentas-activas.sql (usa `public.es_admin()`).
-- ============================================================

-- ── 1. LA LISTA ──
-- El correo en minúsculas y como clave: dos filas para el mismo correo con
-- distinta caja serían dos verdades sobre la misma persona. Lo garantiza un
-- `check` y no la buena voluntad de quien inserta: una fila metida a mano
-- desde el SQL Editor con mayúsculas sería una invitación muerta —nunca la
-- encontraría la consulta de la puerta, que sí normaliza— e invisible.
create table if not exists cuenta_permitida (
  email         text primary key,
  -- Para qué se invitó. No es adorno: dentro de un año, un correo suelto en
  -- esta lista no dice si sigue teniendo sentido que esté.
  nota          text,
  invitado_por  uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);

-- Normalizar ANTES de exigirlo. Si la tabla ya existía con alguna fila en
-- mayúsculas, el `check` fallaría con `check_violation` y se llevaría por
-- delante la transacción entera —y con ella el archivo—. Primero se quitan los
-- que serían duplicados al bajar la caja, luego se normalizan, luego se exige.
delete from cuenta_permitida a
 using cuenta_permitida b
 where a.email <> b.email
   and lower(btrim(a.email)) = lower(btrim(b.email))
   and a.ctid > b.ctid;
update cuenta_permitida set email = lower(btrim(email))
 where email <> lower(btrim(email));

do $$ begin
  alter table cuenta_permitida
    add constraint cuenta_permitida_minusculas check (email = lower(btrim(email)));
exception when duplicate_object then null;
end $$;

alter table cuenta_permitida enable row level security;


-- ── 2. LA SIEMBRA, QUE ES LO QUE IMPIDE EL PORTAZO ──
--
-- Si la tabla naciera vacía y pasara a mandar, NADIE podría entrar mañana:
-- todo el equipo fuera, incluida la persona que tendría que arreglarlo. Un
-- despliegue que cierra la puerta con las llaves dentro.
--
-- Quien YA tiene cuenta viva es, por definición, alguien a quien se dejó
-- entrar. Con dos exclusiones que importan:
--   · las cuentas BORRADAS de auth (`deleted_at`), que ya no son de nadie;
--   · las cuentas APAGADAS en /admin. A alguien se le apagó por algo, y
--     reinvitarlo aquí sería deshacer esa decisión sin que nadie lo pidiera.
--     Y no es teórico: la allowlist se mira al iniciar sesión, así que apagar
--     una cuenta no impide volver a entrar — solo la saca de los combos.
-- `left join`, no `join`: una cuenta de auth sin fila en `perfiles` —el
-- trigger falló, se borró el perfil a mano— es una cuenta que SIGUE pudiendo
-- entrar. Con un `join` interior se quedaba fuera de la siembra, y la consulta
-- de verificar usaba el mismo join, así que tampoco lo habría delatado: el
-- único caso que la siembra se dejaba era invisible para su propia
-- comprobación.
insert into cuenta_permitida (email, nota)
select lower(btrim(u.email)), 'ya tenía cuenta al crear la lista'
  from auth.users u
  left join perfiles p on p.id = u.id
 where u.email is not null
   and u.deleted_at is null
   and coalesce(p.activo, true)   -- sin perfil, `null` → se da por encendida
on conflict (email) do nothing;


-- ── 3. QUIÉN LA TOCA ──
-- Solo administración, y en las tres operaciones. La lista de correos del
-- equipo no es secreta, pero tampoco es cosa de todos: quien la lee entera
-- puede escribirle a todo el mundo.
drop policy if exists "leer_cperm"   on cuenta_permitida;
drop policy if exists "crear_cperm"  on cuenta_permitida;
drop policy if exists "borrar_cperm" on cuenta_permitida;
create policy "leer_cperm"   on cuenta_permitida for select to authenticated using (public.es_admin());
create policy "crear_cperm"  on cuenta_permitida for insert to authenticated with check (public.es_admin());
create policy "borrar_cperm" on cuenta_permitida for delete to authenticated using (public.es_admin());


-- ── 4. LA PREGUNTA DE LA PUERTA ──
--
-- El callback tiene que saber si UN correo concreto está invitado, y lo hace
-- con una sesión recién creada que puede ser justo la de alguien a quien hay
-- que expulsar. Si consultara la tabla, esa persona tendría un instante para
-- leerse los correos del equipo entero; por eso no consulta la tabla: pregunta
-- por un valor que YA conoce —el suyo— y recibe sí o no.
--
-- Devuelve DOS cosas, y la segunda es la que evita el portazo: `hay_lista`
-- dice si alguien ha configurado esto alguna vez. Con solo el booleano, una
-- tabla vacía —proyecto recién instalado, migración corrida antes del primer
-- login— respondía «no invitado» a TODO EL MUNDO y dejaba el sistema sin
-- forma de entrar a arreglarlo. «No estás en la lista» y «no hay lista» son
-- respuestas distintas y tienen que viajar por separado.
drop function if exists public.correo_permitido(text);

create or replace function public.correo_permitido(correo text)
returns table (permitido boolean, hay_lista boolean)
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from cuenta_permitida where email = lower(btrim(correo))),
         exists (select 1 from cuenta_permitida);
$$;

-- Postgres concede EXECUTE a PUBLIC en toda función nueva, así que el `grant`
-- de abajo no restringe: hay que RETIRARLO primero. Sin esto, `anon` —cuya
-- clave viaja en el paquete del navegador— puede preguntar por cualquier
-- correo y averiguar si esa persona es del equipo. No abre la puerta ni deja
-- enumerar la lista, pero es un dato que no tenemos por qué regalar.
revoke execute on function public.correo_permitido(text) from public;
revoke execute on function public.correo_permitido(text) from anon;
grant  execute on function public.correo_permitido(text) to authenticated;


-- ── 5. ATAR UNA CUENTA A SU FICHA DE PERSONA ──
--
-- `personas.usuario_id` es lo que hace que el alias corto salga en la caja,
-- que se le puedan pagar jornadas y que /admin diga quién es cada cuenta. Se
-- rellenaba a mano por SQL porque `personas` no tenía política de UPDATE en
-- este repositorio.
--
-- ⚠ NO se abre `personas` a UPDATE por RLS, y es deliberado. La primera
-- versión de este archivo creaba una política de administrador sobre la tabla,
-- y eso concede a cualquier admin editar TODAS las columnas de cualquier
-- persona desde la API directa —tarifas, DNI, estado SUNAT—. Justo lo
-- contrario de lo que se hizo con `perfiles` en db/cuentas-activas.sql, donde
-- el UPDATE se retiró de la tabla y se concedió solo sobre una columna.
-- El enlace lo resuelve la función de más abajo, que es `security definer` y
-- por tanto no necesita política ninguna: toca una sola columna y comprueba
-- ella misma quién pregunta. Menos superficie por el mismo resultado.
drop policy if exists "editar_pers_admin" on personas;

-- ⚠ ANTES DEL ÍNDICE: soltar los duplicados que pueda haber.
-- Hasta hoy nada impedía que dos fichas apuntaran al mismo login, y el enlace
-- se hacía a mano por SQL. Si existe alguno, el `create unique index` de abajo
-- FALLA — y como el SQL Editor corre todo en una transacción, se revertiría el
-- archivo entero: ni tabla, ni función, ni políticas. La pantalla seguiría
-- diciendo «falta correr db/invitaciones.sql» después de haberlo corrido, que
-- es el peor sitio donde dejar a alguien.
-- Se conserva UNA de cada grupo —la de `id` menor, que es lo único ordenable:
-- `personas` no guarda cuándo se creó— y se sueltan las demás. Cuál se queda
-- da un poco igual: lo que importa es que alguien las mire, y para eso la
-- consulta de VERIFICAR de abajo dice cuántas se soltaron.
with dup as (
  select id, usuario_id,
         row_number() over (partition by usuario_id order by id) as n
    from personas
   where usuario_id is not null
)
update personas p set usuario_id = null
  from dup where dup.id = p.id and dup.n > 1;

-- Una cuenta no puede ser dos personas. Sin esto, un despiste deja dos fichas
-- apuntando al mismo login y el alias corto pasa a depender de cuál devuelva
-- la consulta primero — un fallo que no da error nunca.
create unique index if not exists idx_personas_usuario
  on personas (usuario_id) where usuario_id is not null;

-- ── Y EL ENLACE, EN UNA SOLA OPERACIÓN ──
--
-- Atar una cuenta a una ficha son dos escrituras: soltar la que tuviera y
-- asignar la nueva. Hechas desde la aplicación son dos viajes, y si el segundo
-- falla —choque con el índice, ficha borrada— el primero YA se guardó: la
-- cuenta se queda sin ficha y el estado anterior, que era correcto, se ha
-- perdido. Aquí las dos van en la misma transacción: o las dos, o ninguna.
create or replace function public.enlazar_cuenta_persona(cuenta uuid, persona uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare ocupada uuid;
begin
  if not public.es_admin() then return 'no_admin'; end if;

  if persona is not null then
    select usuario_id into ocupada from personas where id = persona;
    if not found then return 'sin_ficha'; end if;
    -- Comprobado ANTES de tocar nada: que el error llegue como una frase y no
    -- como «duplicate key value violates unique constraint».
    if ocupada is not null and ocupada <> cuenta then return 'ficha_ocupada'; end if;
  end if;

  update personas set usuario_id = null where usuario_id = cuenta;
  if persona is not null then
    update personas set usuario_id = cuenta where id = persona;
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.enlazar_cuenta_persona(uuid, uuid) from public;
revoke execute on function public.enlazar_cuenta_persona(uuid, uuid) from anon;
grant  execute on function public.enlazar_cuenta_persona(uuid, uuid) to authenticated;


-- ── 6. AVISAR A LA API ──
-- PostgREST guarda en memoria el esquema y no lo revisa solo. Sin esto, la
-- tabla y las funciones nuevas existen en la base y la API responde «no
-- existe».
notify pgrst, 'reload schema';


-- ── VERIFICAR ──
select (select count(*) from cuenta_permitida)                             as invitados,
       (select count(*) from auth.users where email is not null
          and deleted_at is null)                                          as cuentas_vivas,
       -- Invitados que todavía no han entrado nunca:
       (select count(*) from cuenta_permitida c
         where not exists (select 1 from auth.users u
                            where lower(btrim(u.email)) = c.email))        as sin_entrar,
       -- Cuentas VIVAS Y ENCENDIDAS que quedaron fuera de la lista. Debe ser 0
       -- justo después de correr esto; si no, la siembra no se aplicó.
       (select count(*) from auth.users u left join perfiles p on p.id = u.id
         where u.email is not null and u.deleted_at is null
           and coalesce(p.activo, true)
           and not exists (select 1 from cuenta_permitida c
                            where c.email = lower(btrim(u.email))))        as fuera_de_lista,
       -- Cuentas apagadas que NO se reinvitaron, que es lo correcto:
       (select count(*) from perfiles where activo is false)               as apagadas,
       -- Cuentas encendidas que no tienen ficha de persona atada. No es un
       -- error —alguien recién llegado empieza así— pero es lo que hay que ir
       -- a atar en /admin → Cuentas para que su alias corto salga en la caja.
       (select count(*) from perfiles p
         where coalesce(p.activo, true)
           and not exists (select 1 from personas x where x.usuario_id = p.id)) as cuentas_sin_ficha;
