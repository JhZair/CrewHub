-- ============================================================
--  db/sunat-puerta-sol.sql — LA PUERTA DE SUNAT ES LA PORTADA, NO UN ATAJO
--
--  El botón «🔐 SUNAT» de /obligaciones abre `plataformas.url` de la clave
--  `sunat_sol`. Hasta ahora apuntaba a un enlace de acceso directo al Menú SOL:
--
--      https://api-seguridad.sunat.gob.pe/v1/clientessol/4f3b88b3-…/oauth2/
--      loginMenuSol?…&state=rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcAUH2sHDFmDR…
--
--  ── POR QUÉ SE CAMBIA ──
--  Ese `state=rO0ABX…` es un objeto Java serializado que SUNAT genera para cada
--  sesión. db/plataforma-puertas.sql ya avisaba de que si dejaba de abrir no
--  sería culpa nuestra. Mirando hoy la portada de SOL se ve por qué: sus cuatro
--  accesos no son enlaces, son llamadas `javascript:` que construyen esa URL al
--  vuelo. Guardar una copia de algo que el propio sitio fabrica cada vez es
--  guardar algo con fecha de caducidad y sin aviso: el día que deje de valer, el
--  botón llevará a una pantalla de error y quien lo pulse aprenderá a no fiarse
--  del botón.
--
--  La portada, en cambio, es una dirección estable y publicada, y desde ella se
--  llega a las cuatro cosas: declaraciones y pagos, trámites y consultas, renta
--  anual de personas y de empresas. Un clic más y ninguna sorpresa.
--
--  ── LOS ATAJOS SE QUEDAN ──
--  Las dos puertas de `plataforma_puertas` («Mis declaraciones y pagos» y
--  «Renta anual») no se tocan: mientras funcionen ahorran pasos, y si un día
--  fallan se corrigen desde /admin?s=plataformas sin publicar nada. Lo que
--  cambia es cuál es la ENTRADA por defecto — la que tiene que aguantar.
--
--  Idempotente. Al final verifica.
-- ============================================================

update plataformas
   set url = 'https://www.sunat.gob.pe/sol.html'
 where clave = 'sunat_sol';

-- ── VERIFICAR ──
-- La principal debe ser la portada; debajo, los atajos que siguen vivos.
select p.nombre,
       coalesce(p.url, '⚠ SIN PUERTA PRINCIPAL') as principal,
       q.orden, q.titulo
  from plataformas p
  left join plataforma_puertas q on q.plataforma_id = p.id
 where p.clave = 'sunat_sol'
 order by q.orden nulls first;
