-- ============================================================
-- ANOTAR SOBRE UN COMPETIDOR
--
-- La pestaña 🏁 dice lo que dijo el Ministerio y nada más: empresa, proyecto,
-- director, hasta dónde llegó. Eso es a propósito —es un registro de documentos
-- públicos, no un directorio— pero deja fuera la mitad del trabajo real: lo que
-- uno AVERIGUA de un rival. «Este proyecto ya tiene teaser, aquí está», «el
-- director es el mismo de tal documental», «se estrenó en tal festival».
--
-- Hoy eso se queda en la cabeza de quien lo buscó, o en un WhatsApp. Dentro de
-- un año, cuando esa empresa vuelva a aparecer en la lista de otra edición, esa
-- investigación ya no existe y se hace otra vez desde cero. La fila del rival
-- es justo donde hará falta.
--
-- ── SIN TOCAR LO QUE DICE EL DOCUMENTO ──
-- Esto NO añade columnas a `convocatoria_competencia`: lo que se lee del PDF se
-- guarda tal cual y no se mezcla nunca con lo que opinamos. La investigación
-- vive en `comentarios`, con su autor y su fecha, y se distingue siempre de lo
-- que resolvió DAFO. Un comentario no convierte a un rival en una empresa del
-- sistema, ni le da ficha, ni lo saca de donde está.
--
-- Es la MISMA tabla `comentarios` de los casos, los objetos, los préstamos y
-- las cinco tablas de la rendición: una sola bodega, ahora con una puerta más.
-- Con ella vienen gratis las @menciones, las respuestas anidadas, las imágenes
-- y los avisos — que es justo lo que hace que una nota se lea.
--
-- Idempotente, SIN transacción externa (lección pgBouncer).
-- Requiere db/competencia.sql.
-- ============================================================

-- ── 1. LA DECIMOTERCERA PUERTA ──
alter table comentarios add column if not exists competencia_id uuid
  references convocatoria_competencia(id) on delete cascade;

create index if not exists idx_com_competencia on comentarios (competencia_id, creado_en);

comment on column comentarios.competencia_id is
  'Lo que hemos averiguado de un competidor. Nunca lo que dice su resolución: eso vive en convocatoria_competencia y no se mezcla.';

-- Exactamente UNO de los trece dueños.
-- ⚠ Se reconstruye el check ENTERO cada vez, con todas las columnas que
-- existan. Escribir solo las que a uno le interesan lo rompería para las demás:
-- este constraint es de toda la tabla, no de esta migración.
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk check (
    (publicacion_id is not null)::int
  + (objeto_id is not null)::int
  + (prestamo_id is not null)::int
  + (equipamiento_id is not null)::int
  + (postulacion_id is not null)::int
  + (movimiento_caja_id is not null)::int
  + (comprobante_id is not null)::int
  + (estado_cuenta_id is not null)::int
  + (rhe_id is not null)::int
  + (gasto_dj_id is not null)::int
  + (movimiento_banco_id is not null)::int
  + (obligacion_periodo_id is not null)::int
  + (competencia_id is not null)::int
  = 1
);

-- La policy de INSERT ya es «el autor es quien comenta»: vale sea cual sea la
-- puerta. Se redeclara por si este proyecto se montó sin las anteriores.
drop policy if exists "crear_com" on comentarios;
create policy "crear_com" on comentarios
  for insert to authenticated with check (autor_id = auth.uid());

-- ── 2. REACCIONAR A LA FILA ──
-- Un 👀 sobre un rival es «ya lo investigué, no hace falta otra vez», y es lo
-- que más se va a hacer: si obliga a escribir un comentario, no se hace y el
-- acuse se pierde.
alter table reacciones add column if not exists competencia_id uuid
  references convocatoria_competencia(id) on delete cascade;
create index if not exists idx_rx_competencia on reacciones (competencia_id);

-- ⚠ AÑADIR LA COLUMNA NO BASTA: HAY DOS GUARDIANES MÁS, Y LOS DOS SON DE TODA
-- LA TABLA. Esta migración se escribió sin ellos y el 👀 contestaba «new row
-- for relation "reacciones" violates check constraint "reacciones_dueno_chk"»
-- —la columna existía, se llenaba, y el check seguía exigiendo que el dueño
-- fuera uno de los diez de antes—.
alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null
  or postulacion_id is not null or movimiento_caja_id is not null
  or comprobante_id is not null or estado_cuenta_id is not null
  or rhe_id is not null or gasto_dj_id is not null
  or movimiento_banco_id is not null or obligacion_periodo_id is not null
  or competencia_id is not null
);

-- ⚠ Y EL UNIQUE, QUE ES EL QUE MUERDE DESPUÉS.
-- Es «una reacción por dueño, usuario y emoji», escrito como la lista entera de
-- columnas. Un unique que no mira la columna nueva trata a DOS competidores
-- distintos como el mismo —los dos con todas las demás en null— así que el
-- primer 👀 entraría y el segundo, sobre otro rival, moriría con un error de
-- duplicado que en pantalla no significa nada. Su propio archivo ya avisaba de
-- esto («esta es la cuarta vez que se escribe») y aun así se me pasó: la quinta
-- queda aquí por el mismo motivo.
drop index if exists uq_reacciones_dueno;
create unique index uq_reacciones_dueno on reacciones (
  coalesce(publicacion_id::text, ''),
  coalesce(comentario_id::text, ''),
  coalesce(postulacion_id::text, ''),
  coalesce(movimiento_caja_id::text, ''),
  coalesce(comprobante_id::text, ''),
  coalesce(estado_cuenta_id::text, ''),
  coalesce(rhe_id::text, ''),
  coalesce(gasto_dj_id::text, ''),
  coalesce(movimiento_banco_id::text, ''),
  coalesce(obligacion_periodo_id::text, ''),
  coalesce(competencia_id::text, ''),
  usuario_id, emoji
);

-- ── 3. QUE EL AVISO SEPA LLEGAR ──
-- Sin esto, un «@Katy» escrito en la ficha de un rival se guardaría bien y no
-- avisaría a nadie: el fallo silencioso de siempre.
alter table notificaciones add column if not exists competencia_id uuid
  references convocatoria_competencia(id) on delete cascade;
create index if not exists idx_notif_competencia on notificaciones (competencia_id)
  where competencia_id is not null;

-- Las tres columnas y los dos guardianes, para verlo de un vistazo: si `rx_chk`
-- o `rx_uq` salen en 0, el 👀 dará error aunque la columna esté.
select
  (select count(*) from information_schema.columns
     where table_name='comentarios' and column_name='competencia_id') as com,
  (select count(*) from pg_constraint
     where conname='reacciones_dueno_chk'
       and pg_get_constraintdef(oid) like '%competencia_id%') as rx_chk,
  (select count(*) from pg_indexes
     where indexname='uq_reacciones_dueno' and indexdef like '%competencia_id%') as rx_uq,
  (select count(*) from information_schema.columns
     where table_name='reacciones' and column_name='competencia_id') as rx,
  (select count(*) from information_schema.columns
     where table_name='notificaciones' and column_name='competencia_id') as notif;
