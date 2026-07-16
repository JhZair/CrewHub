-- ============================================================
--  credenciales.url deja de ser una copia y pasa a ser la excepción
--
--  El error era mío y del tipo que llevo todo el día persiguiendo: el mismo
--  dato en dos sitios, divergiendo en silencio.
--
--  · db/plataformas.sql copiaba el link de la plataforma a cada credencial.
--    Cuando corrió, SUNAT-ClaveSOL todavía no tenía link (lo dejé nulo a
--    propósito, para no inventarlo). La credencial se quedó en null.
--  · db/plataforma-puertas.sql le puso el link a la plataforma… y nunca
--    volvió a copiar. Resultado: la plataforma sabía, la credencial decía
--    «🔗 sin link».
--  · Y guardarPlataforma() solo rellenaba las credenciales con url NULA.
--    O sea que cambiar el link de DAFO en el admin habría dejado a las cinco
--    que ya heredaron el viejo con el viejo. Para siempre y sin avisar.
--
--  Ahora el link se resuelve al leer (lib/plataformas.ts → conPlataforma):
--    credencial.url ?? plataforma.url
--
--  Con eso `credenciales.url` significa UNA sola cosa: la excepción — esta
--  cuenta entra por otra puerta que las demás de su plataforma. Este archivo
--  borra las copias que ya se sembraron, para que solo queden excepciones
--  de verdad.
-- ============================================================

-- 👀 Qué hay hoy.
--    OJO: la primera versión de esta consulta preguntaba `c.url is null`
--    antes que nada y devolvía «hereda de su plataforma» para TODAS las que
--    no tuvieran link — incluidas las que no tienen plataforma que las herede.
--    Tres situaciones bajo una etiqueta, que es el error que este archivo
--    vino a arreglar. El orden del `case` importa: lo específico primero.
select c.plataforma,
       coalesce(e.nombre, p.nombre)          as ficha,
       case
         when pl.id is null                  then '👻 huérfana — su plataforma no está cargada'
         when c.url is null and pl.url is null then '⚠ hueco — la plataforma existe pero sin link'
         when c.url is null                  then '✅ hereda de su plataforma'
         when c.url = pl.url                 then '📄 copia (se va a borrar)'
         else                                     '🚪 excepción real — entra por otra puerta'
       end                                   as origen,
       c.url                                 as url_credencial,
       pl.url                                as url_plataforma
  from credenciales c
  left join plataformas pl
    on lower(btrim(c.plataforma)) = lower(btrim(pl.nombre))
  left join empresas e on e.id = c.empresa_id
  left join personas p on p.id = c.persona_id
 order by c.plataforma;

-- ✅ Borrar las copias. No borra las excepciones (url distinta a la de su
--    plataforma) ni las huérfanas (plataforma sin link cargado).
-- update credenciales c
--    set url = null
--   from plataformas pl
--  where lower(btrim(c.plataforma)) = lower(btrim(pl.nombre))
--    and c.url is not null
--    and c.url = pl.url;

-- 🔎 Control: no debería quedar ninguna fila que diga «copia»
-- select count(*) from credenciales c
--   join plataformas pl on lower(btrim(c.plataforma)) = lower(btrim(pl.nombre))
--  where c.url = pl.url;

-- 🔎 Y las que quedan huérfanas: su plataforma no está cargada, así que
--    nunca van a heredar nada. Cárgalas en /admin?s=plataformas con ese
--    nombre exacto — el nombre es la llave.
-- select distinct c.plataforma
--   from credenciales c
--   left join plataformas pl
--     on lower(btrim(c.plataforma)) = lower(btrim(pl.nombre))
--  where pl.id is null;
