-- ============================================================
--  CASILLA DAFO — dar de alta un lote de cuentas de correo
--
--  POR QUÉ ESTE ARCHIVO
--  La casilla vincula un correo a su postulación por dos vías: el código DAFO
--  en el asunto y —cuando no viene— la CUENTA que lo recibió. La segunda vía
--  necesita saber de qué empresa es cada Gmail, y ese dato no se guarda en
--  ningún sitio nuevo: ya vive en `credenciales`, cada cuenta colgada de su
--  empresa (ver app/api/ingesta/dafo/route.ts → empresaDeCorreo). Una tabla
--  aparte sería el mismo dato en dos lados, y el día que se contradigan nadie
--  sabrá cuál vale.
--
--  Así que dar de alta una cuenta = escribir una credencial de Gmail. Esto no
--  inventa ninguna estructura; solo lo hace para once correos de una vez.
--
--  CÓMO SE USA: en TRES pasos, y el primero NO escribe nada.
--    PASO 1 — mira qué empresa le tocaría a cada correo. Se revisa a ojo.
--    PASO 2 — solo entonces, inserta.
--    PASO 3 — dice qué quedó fuera y por qué.
--
--  El paso 1 existe porque el emparejamiento es por PARECIDO DE NOMBRE, y un
--  parecido no es una certeza. Una cuenta colgada de la empresa equivocada no
--  falla ruidosamente: manda los correos de DAFO a la postulación de otro, y
--  eso se descubre tarde y mal. Mejor mirar once filas una vez.
--
--  Idempotente: correrlo dos veces no duplica nada.
--  Correr en: Supabase → SQL Editor.
-- ============================================================


-- ────────────────────────────────────────────────────────────
--  PASO 1 · DIAGNÓSTICO — qué empresa le tocaría a cada correo
--  No escribe nada. Se lee la columna `veredicto`:
--    ✅ va      → una sola empresa casó, el paso 2 la inserta
--    🟡 ya está → ese correo ya estaba registrado (no se toca)
--    🔴 ambigua → casaron varias empresas; hay que elegir a mano
--    🔴 ninguna → ninguna empresa se parece; hay que asignarla a mano
-- ────────────────────────────────────────────────────────────
with lote(correo) as (values
  ('microcinecha@gmail.com'),
  ('tawatvsantander@gmail.com'),
  ('lunacarlitos8011@gmail.com'),
  ('panakaayllu@gmail.com'),
  ('kpachatv@gmail.com'),
  ('cinechaypaukar@gmail.com'),
  ('corepachastudio@gmail.com'),
  ('kawsaychapro@gmail.com'),
  ('pukllaychamary@gmail.com'),
  ('icr3aoficial@gmail.com'),
  ('asociacionpichiuchallay@gmail.com')
),
-- El nombre de una empresa y el usuario de su Gmail nunca se escriben igual:
-- «Asociación Pichiu Challay» vs. «asociacionpichiuchallay». Se comparan
-- desnudos —sin tildes, sin espacios, sin puntuación, en minúsculas— porque
-- eso es lo único que las dos formas tienen en común.
-- `translate` y no `unaccent`: la extensión puede no estar instalada, y un
-- script de alta que exige instalar una extensión se queda sin correr.
norm as (
  select id, nombre,
         lower(regexp_replace(
           translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
           '[^A-Za-z0-9]', '', 'g')) as clave
  from empresas
),
-- El usuario del correo se desnuda igual que el nombre de la empresa. Y no es
-- solo simetría: en `like`, el guion bajo de un «bot_qhaway» es un COMODÍN que
-- casa con cualquier letra, así que dejarlo crudo convertiría un correo con
-- guion bajo en una red que pesca empresas que no son.
usuario as (
  select correo,
         lower(regexp_replace(split_part(correo, '@', 1), '[^A-Za-z0-9]', '', 'g')) as u
  from lote
),
-- Se acepta el parecido EN LOS DOS SENTIDOS: el usuario puede llevar el
-- nombre entero y algo más («tawatvsantander» ⊃ «tawatv»), o ser un recorte
-- del nombre («kawsaychapro» ⊂ «kawsaychaproducciones»).
-- El corte de 5 caracteres no es cosmético: sin él, una empresa llamada «ICR»
-- casaría con cualquier correo que lleve esas tres letras seguidas, y el
-- emparejamiento pasaría de heurística a lotería.
casan as (
  select u.correo, n.id as empresa_id, n.nombre
  from usuario u
  join norm n on length(n.clave) >= 5
             and (u.u like '%' || n.clave || '%' or n.clave like '%' || u.u || '%')
),
ya as (
  select lower(trim(c.identificador)) as correo, e.nombre as empresa
  from credenciales c
  left join empresas e on e.id = c.empresa_id
  where c.empresa_id is not null
    and lower(trim(c.identificador)) in (select correo from lote)
)
select
  l.correo,
  coalesce(ya.empresa, string_agg(casan.nombre, ' | ' order by casan.nombre)) as empresa,
  case
    when ya.correo is not null      then '🟡 ya está'
    when count(casan.empresa_id) = 1 then '✅ va'
    when count(casan.empresa_id) > 1 then '🔴 ambigua — elige a mano'
    else                                  '🔴 ninguna — asigna a mano'
  end as veredicto
from lote l
left join casan on casan.correo = l.correo
left join ya    on ya.correo    = l.correo
group by l.correo, ya.correo, ya.empresa
order by 3, 1;


-- ────────────────────────────────────────────────────────────
--  PASO 2 · EL ALTA — solo las que el paso 1 marcó ✅
--
--  Escribe una credencial de Gmail por cuenta, igual que si se hubiera
--  registrado desde la ficha de la empresa. `plataforma = 'Gmail'` importa:
--  es la llave por la que la ficha resuelve el link y las puertas de la
--  cuenta (ver lib/puertas.ts).
--
--  Las 🔴 se quedan fuera A PROPÓSITO. Un `coalesce` a «la primera que casó»
--  habría dado el script por terminado dejando cuentas mal colgadas, que es
--  exactamente el error que no avisa.
-- ────────────────────────────────────────────────────────────
with lote(correo) as (values
  ('microcinecha@gmail.com'),
  ('tawatvsantander@gmail.com'),
  ('lunacarlitos8011@gmail.com'),
  ('panakaayllu@gmail.com'),
  ('kpachatv@gmail.com'),
  ('cinechaypaukar@gmail.com'),
  ('corepachastudio@gmail.com'),
  ('kawsaychapro@gmail.com'),
  ('pukllaychamary@gmail.com'),
  ('icr3aoficial@gmail.com'),
  ('asociacionpichiuchallay@gmail.com')
),
norm as (
  select id, nombre,
         lower(regexp_replace(
           translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
           '[^A-Za-z0-9]', '', 'g')) as clave
  from empresas
),
-- El usuario del correo se desnuda igual que el nombre de la empresa. Y no es
-- solo simetría: en `like`, el guion bajo de un «bot_qhaway» es un COMODÍN que
-- casa con cualquier letra, así que dejarlo crudo convertiría un correo con
-- guion bajo en una red que pesca empresas que no son.
usuario as (
  select correo,
         lower(regexp_replace(split_part(correo, '@', 1), '[^A-Za-z0-9]', '', 'g')) as u
  from lote
),
casan as (
  select u.correo, n.id as empresa_id
  from usuario u
  join norm n on length(n.clave) >= 5
             and (u.u like '%' || n.clave || '%' or n.clave like '%' || u.u || '%')
),
-- `array_agg(...)[1]` y no `min(...)`: Postgres no define min() para uuid.
-- Da igual cuál se tome —el `having` garantiza que solo hay una fila—, así que
-- lo único que hace falta es un agregado que acepte el tipo.
unicas as (
  select correo, (array_agg(empresa_id))[1] as empresa_id
  from casan group by correo having count(*) = 1
)
insert into credenciales (empresa_id, plataforma, identificador, notas, actualizado_en)
select u.empresa_id, 'Gmail', u.correo,
       'Cuenta de postulación — reenvía al buzón maestro de 📬 Casilla DAFO.',
       current_date
from unicas u
-- El anti-duplicado es la razón de ser de este `not exists`: dos filas con el
-- mismo correo y empresas distintas harían que la vía «cuenta» apunte a una o
-- a otra según el orden en que la base devuelva las filas. No fallaría: daría
-- una respuesta distinta cada día.
where not exists (
  select 1 from credenciales c
  where lower(trim(c.identificador)) = u.correo
    and c.empresa_id is not null
);


-- ────────────────────────────────────────────────────────────
--  PASO 3 · CONTROL — qué cuentas de este lote quedaron sin empresa
--  Si esto devuelve filas, esas cuentas NO pueden vincular nada por la vía
--  «cuenta»: sus correos entrarán al panel como «sin vincular» y habrá que
--  atarlos a mano, uno por uno, para siempre. Se arreglan desde la ficha de
--  su empresa (Credenciales → agregar, plataforma «Gmail»).
-- ────────────────────────────────────────────────────────────
with lote(correo) as (values
  ('microcinecha@gmail.com'), ('tawatvsantander@gmail.com'),
  ('lunacarlitos8011@gmail.com'), ('panakaayllu@gmail.com'),
  ('kpachatv@gmail.com'), ('cinechaypaukar@gmail.com'),
  ('corepachastudio@gmail.com'), ('kawsaychapro@gmail.com'),
  ('pukllaychamary@gmail.com'), ('icr3aoficial@gmail.com'),
  ('asociacionpichiuchallay@gmail.com')
)
select l.correo as sin_empresa
from lote l
where not exists (
  select 1 from credenciales c
  where lower(trim(c.identificador)) = l.correo and c.empresa_id is not null
)
order by 1;


-- ────────────────────────────────────────────────────────────
--  NOTA SOBRE corepachastudio@gmail.com
--
--  Ese correo es el BUZÓN MAESTRO: el sitio al que reenvían todas las demás.
--  Registrarlo como cuenta de una empresa no hace daño, pero tampoco hace
--  nada para la vía «cuenta»: la ingesta descarta el buzón al buscar de quién
--  era el correo, porque el reenvío de Gmail agrega el maestro a TODOS los
--  destinatarios y quedarse con él daría siempre la misma empresa —una
--  respuesta inventada con cara de deducción—.
--
--  Vale la pena registrarlo SOLO si además es la cuenta con la que se postuló
--  algún expediente. Y en ese caso hay un hueco real que conviene saber: un
--  correo que DAFO manda directo al maestro llega con un único destinatario
--  —el propio maestro—, así que la vía «cuenta» se queda sin nada que mirar y
--  ese correo dependerá del código en el asunto o de vincularlo a mano.
-- ────────────────────────────────────────────────────────────
