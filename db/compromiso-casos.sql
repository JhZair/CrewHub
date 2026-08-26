-- ══════════════════════════════════════════════════════════════════════════
-- UNA CLÁUSULA, VARIOS CASOS
--
-- `compromiso_acta.caso_id` guardaba UN caso por cláusula, y en la práctica no
-- alcanza. La 5.2.4 —«documentos que acrediten los gastos declarados»— es
-- trabajo de tres personas durante meses: juntar los comprobantes, revisarlos
-- contra el reglamento de SUNAT y armar el anexo. Con un solo hueco, abrir el
-- segundo caso obligaba a desatar el primero, y el primero era justo el que
-- guardaba la historia.
--
-- Peor todavía: al resolverse, el caso dejaba de contar —la pantalla solo
-- ofrecía «＋ caso» si el hueco estaba libre o el caso estaba muerto—, así que
-- el trabajo TERMINADO desaparecía de la cláusula. En una rendición, lo hecho
-- es exactamente lo que hay que poder enseñar.
--
-- La relación real es de uno a muchos: una cláusula tiene los casos que haga
-- falta, y cada caso pertenece a una cláusula. Eso es una columna en
-- `publicaciones`, no un hueco en el compromiso.
--
-- ── `caso_id` SE QUEDA, PERO YA NO MANDA ──
-- No se borra: es el rastro de los casos abiertos hasta hoy y de él sale el
-- backfill. Pero deja de escribirse y de leerse — dos sitios que dicen «el
-- caso de esta cláusula» acaban diciendo cosas distintas, y el que se mira no
-- es siempre el que se actualiza.
-- ══════════════════════════════════════════════════════════════════════════

begin;

alter table publicaciones add column if not exists compromiso_id uuid
  references compromiso_acta(id) on delete set null;

comment on column publicaciones.compromiso_id is
  'La cláusula del acta que este caso atiende. `on delete set null`: si se rehace el extracto del acta, el trabajo hecho no se borra — solo se queda sin cláusula.';

-- Parcial: la inmensa mayoría de los casos no salen de un acta, y un índice
-- sobre cientos de nulos ocupa sin servir.
create index if not exists idx_pub_compromiso on publicaciones(compromiso_id)
  where compromiso_id is not null;

-- ── BACKFILL ──
-- Lo que ya estaba atado por `caso_id` pasa a la columna nueva. Sin esto, las
-- cláusulas que ya tenían caso aparecerían vacías después de la migración: el
-- trabajo seguiría existiendo y la pantalla diría que no.
update publicaciones p
   set compromiso_id = c.id
  from compromiso_acta c
 where c.caso_id = p.id
   and p.compromiso_id is null;

comment on column compromiso_acta.caso_id is
  'OBSOLETA desde db/compromiso-casos.sql. La relación vive ahora en publicaciones.compromiso_id, que admite varios casos por cláusula. Se conserva como rastro; no se escribe ni se lee.';

commit;

-- VERIFICAR
-- select c.clausula, count(p.id) as casos
--   from compromiso_acta c left join publicaciones p on p.compromiso_id = c.id
--  group by c.clausula order by c.clausula;
