-- ============================================================
--  Plantilla: cuando cada cuenta entra por un link distinto
--
--  Gmail con seis cuentas te deja en la que estaba abierta. Entrar «a Gmail»
--  no es el problema —nadie necesita ayuda para encontrarlo—: el problema es
--  caer en la bandeja equivocada y cambiarla a mano, seis veces al día.
--
--  Pero el correo ya está guardado: es el identificador de la credencial. Así
--  que el link no se guarda, se calcula — igual que el RUC de una persona se
--  calcula de su DNI en vez de guardarse aparte.
--
--  La plantilla vive en la plataforma, no en el código. Si dijera «si se
--  llama Gmail, arma este link», el día que alguien la renombre a «Correo
--  Google» dejaría de funcionar sin decir por qué. Y Google cambia sus URLs.
--
--  Depende de db/plataformas.sql — córrelo primero.
-- ============================================================

alter table plataformas add column if not exists plantilla_url text;

comment on column plataformas.plantilla_url is
  'Link por cuenta. El hueco {usuario} se reemplaza con el identificador de cada credencial al leer. Nunca se guarda copia.';

-- ── Gmail ────────────────────────────────────────────────────
-- OJO: esta URL de Google ha cambiado más de una vez. Después de correr
-- esto, ve a /admin?s=plataformas y pruébala con el ↗. Si no te deja en la
-- cuenta correcta, la cambias ahí mismo — sin deploy, sin tocar código.
insert into plataformas (nombre, url, requiere_cuenta, clave, plantilla_url, notas) values
  ('Gmail', 'https://mail.google.com/', true, 'gmail',
   'https://accounts.google.com/AccountChooser?Email={usuario}&continue=https%3A%2F%2Fmail.google.com%2Fmail%2F',
   'Cada credencial abre directo en su propia bandeja: el link se arma con el correo del identificador.')
on conflict (nombre) do update
   set plantilla_url = excluded.plantilla_url,
       url           = coalesce(plataformas.url, excluded.url);

-- ── «e-Mail» no es una plataforma, es una categoría ──────────
-- Seis credenciales bajo un nombre que no dice a dónde se entra. Por eso no
-- tiene link y nunca lo iba a tener: si le pusiéramos uno, le mentiríamos a
-- las que no son de ese proveedor.

-- 👀 PRIMERO mira qué son de verdad. El nombre de la plataforma es la llave
--    con la que la credencial encuentra su link: si dice «e-Mail», no hay
--    nada que encontrar.
select c.identificador,
       coalesce(e.nombre, p.nombre) as ficha,
       case
         when c.identificador ilike '%@gmail.com' then '→ Gmail'
         else                                           '⚠ decide tú cómo se llama'
       end as propuesta
  from credenciales c
  left join empresas e on e.id = c.empresa_id
  left join personas p on p.id = c.persona_id
 where lower(btrim(c.plataforma)) = 'e-mail'
 order by c.identificador;

-- ✅ Solo las de @gmail.com pasan a Gmail. Las demás NO se tocan: si alguna
--    es webmail de hosting o de dominio propio, entra por otro lado y hay
--    que cargarla como su propia plataforma.
-- update credenciales
--    set plataforma = 'Gmail'
--  where lower(btrim(plataforma)) = 'e-mail'
--    and identificador ilike '%@gmail.com';

-- 🔎 Las que quedaron en «e-Mail»: estas son las que necesitan que decidas
--    a qué plataforma pertenecen de verdad.
-- select identificador from credenciales
--  where lower(btrim(plataforma)) = 'e-mail';

-- 🔎 Cómo quedó: cada credencial de Gmail con su link calculado.
-- select c.identificador,
--        replace(pl.plantilla_url, '{usuario}', c.identificador) as abre_en
--   from credenciales c
--   join plataformas pl on lower(btrim(c.plataforma)) = lower(btrim(pl.nombre))
--  where pl.clave = 'gmail';
