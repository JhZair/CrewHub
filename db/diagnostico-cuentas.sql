-- ============================================================
--  db/diagnostico-cuentas.sql — ¿POR QUÉ NO SALE EL CORREO?
--
--  La pestaña Cuentas dice «correo no disponible» en todas las filas. Esto no
--  cambia nada: pregunta a la base cuál de los tres eslabones está roto.
--
--  ⚠ OJO CON UNA TRAMPA: en el SQL Editor no hay sesión de nadie, así que
--  `auth.uid()` es NULL y `public.es_admin()` devuelve FALSE. Por eso NO sirve
--  llamar aquí a `resumen_cuentas()` y mirar si trae correo — saldría vacío
--  aunque todo funcione. Se comprueban las piezas por separado.
--
--  Correr en Supabase → SQL Editor y pegar el resultado. Solo lectura.
-- ============================================================

select
  -- 1) ¿Existe la función y es `security definer` con su search_path?
  (select count(*) from pg_proc
    where proname = 'resumen_cuentas' and pronamespace = 'public'::regnamespace)  as fn_existe,
  (select prosecdef from pg_proc
    where proname = 'resumen_cuentas' and pronamespace = 'public'::regnamespace)  as fn_es_definer,
  (select array_to_string(proconfig, ',') from pg_proc
    where proname = 'resumen_cuentas' and pronamespace = 'public'::regnamespace)  as fn_search_path,
  -- ¿Cuántas columnas devuelve? Si son 3, quedó la versión vieja sin correo.
  (select pronargs + coalesce(array_length(proallargtypes, 1), 0) from pg_proc
    where proname = 'resumen_cuentas' and pronamespace = 'public'::regnamespace)  as fn_columnas,

  -- 2) ¿El perfil y la cuenta de auth son la misma fila? Si esto da 0, el
  --    `left join` no encuentra nada y el correo sería null aunque lo demás
  --    esté bien.
  (select count(*) from perfiles p join auth.users u on u.id = p.id)              as perfiles_con_auth,
  (select count(*) from perfiles)                                                 as perfiles_total,
  (select count(*) from auth.users where email is not null)                       as auth_con_correo,

  -- 3) ¿Quién es admin? Si esto es 0, `es_admin()` devolvería false para todos
  --    y el `case` dejaría el correo en null a propósito.
  (select count(*) from perfiles where es_admin)                                  as admins,

  -- 4) ¿Puede la aplicación ejecutarla?
  has_function_privilege('authenticated', 'public.resumen_cuentas()', 'EXECUTE')  as puede_ejecutar;
