-- ============================================================
--  db/cuentas-activas.sql — APAGAR UNA CUENTA
--
--  ── EL AGUJERO ──
--  `perfiles` lo crea un trigger en CADA registro de Google (ver
--  public.crear_perfil, db/schema.sql), con `activo = true` por defecto. Y la
--  única política que existía sobre esa tabla era de LECTURA, así que el
--  UPDATE no pasaba nunca. Dos consecuencias, y las dos silenciosas:
--
--    1. Nadie podía apagar una cuenta: la columna `activo` nació sin
--       interruptor. Quien entró una vez a probar quedó asignable para
--       siempre, en el combo de cada caso, de cada sub-caso y de cada
--       actividad del cronograma.
--    2. `app/auth/callback/route.ts` YA intentaba apagar el perfil fantasma de
--       quien no está en la allowlist, justo antes de expulsarlo. Ese UPDATE
--       lleva desde el primer día sin hacer nada: RLS lo descarta y PostgREST
--       responde «correcto» con cero filas cambiadas. De ahí salen los nombres
--       que nadie reconoce.
--
--  No era un problema de datos: era una puerta sin cerradura y otra que
--  parecía cerrarse y no. Aquí se arreglan las dos.
--
--  ── QUÉ SIGNIFICA APAGAR ──
--  Que esa cuenta no sale en los combos de asignar y no recibe los avisos que
--  van «a todo el equipo» — las dos caras de lo mismo: no se le encarga
--  trabajo, no se le interrumpe. NADA MÁS. Lo que escribió sigue firmado con
--  su nombre, sus casos siguen siendo suyos y sus jornadas cuentan igual:
--  apagar no es esconder, y menos borrar. Y no cierra la sesión: `activo` no
--  lo mira la autenticación.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- ── 1. LA COLUMNA ──
-- Existe desde db/schema.sql, pero puede faltar en una base más vieja.
alter table perfiles add column if not exists activo boolean default true;

-- Las que nunca se tocaron están en null y eso NO es «apagada»: es «nadie lo
-- ha decidido». Se dan por activas, que es como se han venido comportando.
update perfiles set activo = true where activo is null;


-- ── 2. LA CERRADURA, Y SOLO SOBRE UNA COLUMNA ──
--
-- Una política RLS decide QUÉ FILAS se pueden tocar, nunca qué columnas. Con
-- solo la política de abajo, cualquier administrador podría —desde la consola
-- del navegador, sin pasar por la pantalla— darse `es_admin`, quitárselo a los
-- demás o cambiarle el nombre a quien sea. La pantalla ofrece un interruptor;
-- la base estaría abriendo la caja entera.
--
-- Los permisos por COLUMNA sí existen en Postgres, y son la mitad que faltaba:
-- se retira el UPDATE de tabla y se concede solo sobre `activo`.
revoke update on perfiles from authenticated;
grant  update (activo) on perfiles to authenticated;

-- Y ahora, de esa única columna, quién. `public.es_admin()` es la misma
-- función que ya guarda los RHE y el banco (db/auditoria-financiera.sql): una
-- definición, no otra copia.
--
-- ⚠ La segunda rama es la del callback: una cuenta puede apagarse A SÍ MISMA.
-- Es lo que necesita el expulsado de la allowlist —no es admin y nunca lo
-- será—, y no abre nada: apagarse solo se quita a uno de los combos, y con la
-- concesión por columna de arriba no puede tocar nada más. Encender, en
-- cambio, sigue siendo cosa de administración: `with check` exige que, si la
-- fila queda encendida, quien lo hizo sea admin.
drop policy if exists "editar_perf" on perfiles;
create policy "editar_perf" on perfiles
  for update to authenticated
  using  (public.es_admin() or id = auth.uid())
  with check (public.es_admin() or (id = auth.uid() and activo = false));

-- ⚠ NO se añade política de INSERT ni de DELETE, a propósito. Un perfil nace
-- del trigger cuando alguien se registra y muere con su cuenta de auth
-- (`on delete cascade`). Dejar borrar perfiles desde la aplicación sería
-- llevarse por delante el autor de cada caso que esa persona escribió.


-- ── 3. QUIÉN ES CADA CUENTA ──
--
-- Lo que distingue de un vistazo a un miembro del colectivo de un login de
-- paso, y la pregunta que uno se hace justo antes de apagar: «¿esta quién es?».
--
-- Va en la base y no en la página, y ésa es la parte importante. La primera
-- versión se traía las dos columnas de `autor_id` enteras y agrupaba en
-- memoria; PostgREST corta en mil filas por defecto y no avisa, así que con
-- más de mil comentarios el recorte es arbitrario y una cuenta con trabajo
-- real puede salir con «nada». En una pantalla que sirve para decidir a quién
-- se apaga, un número equivocado hace que alguien apague a un compañero.
--
-- ── Y EL CORREO ──
-- «John Zair Oros P» y «John Zair Oros Pérez» son dos cuentas con el mismo
-- nombre puesto por Google. Sin el correo no hay forma de saber cuál apagar, y
-- apagar la equivocada deja fuera a quien sí trabaja.
--
-- El correo NO está en `perfiles`: vive en `auth.users`, que la aplicación no
-- puede leer. Se podría copiar a una columna —el trigger lo tiene a mano al
-- crear el perfil— pero una copia envejece: quien cambie su cuenta de Google
-- dejaría aquí el correo viejo, y un dato caducado en la pantalla que decide a
-- quién se apaga es peor que no tenerlo. Se lee del original.
--
-- Por eso `security definer`: es la única forma de mirar `auth.users`. Y por
-- eso mismo el correo sale SOLO si quien pregunta es administración: una
-- función definer que enseña de más es la forma más silenciosa de saltarse
-- RLS, y esto es una RPC que cualquier sesión puede invocar.
--
-- Los CONTEOS no llevan esa condición porque no hacen falta: las políticas de
-- lectura de `publicaciones`, `comentarios` y `perfiles` son `using(true)`, o
-- sea que ese número ya se puede sacar desde cualquier sesión contando a mano.
-- `drop` antes del `create`: `create or replace` NO puede cambiar el tipo que
-- devuelve una función, y esta ganó la columna del correo después de la
-- primera versión. Sin el drop, volver a correr el archivo falla con «cannot
-- change return type» — y este archivo promete ser idempotente.
drop function if exists public.resumen_cuentas();

create or replace function public.resumen_cuentas()
returns table (id uuid, email text, casos bigint, comentarios bigint)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id,
         case when public.es_admin() then u.email::text end,
         (select count(*) from publicaciones x where x.autor_id = p.id),
         (select count(*) from comentarios  c where c.autor_id = p.id)
    from perfiles p
    left join auth.users u on u.id = p.id
$$;

grant execute on function public.resumen_cuentas() to authenticated;


-- ── VERIFICAR ──
-- Quién está encendido hoy y cuánto ha hecho. La segunda columna es la que
-- distingue al miembro del colectivo del login de paso.
select p.nombre,
       r.email,
       p.activo,
       p.es_admin,
       r.casos,
       r.comentarios,
       p.creado_en::date as primera_entrada
  from perfiles p
  join public.resumen_cuentas() r on r.id = p.id
 order by p.activo desc, r.casos desc, p.nombre;
