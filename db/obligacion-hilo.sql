-- ============================================================
--  db/obligacion-hilo.sql — LA DOCEAVA PUERTA: HABLAR DE UNA DECLARACIÓN
--
--  Cada periodo de `obligacion_periodo` —«octubre 2025 de Apu Wilkakalle»—
--  pasa a poder comentarse, reaccionarse y convertirse en caso, igual que ya
--  se puede con una factura o un movimiento del banco.
--
--  ── POR QUÉ HACE FALTA AQUÍ ──
--  Es la fila donde más preguntas caben y donde peor se pierden. «¿Por qué
--  noviembre 2024 se declaró en cero si hay S/ 1,189 de crédito?» es una
--  pregunta con respuesta —puede que la haya, puede que sea un error— y hoy no
--  tiene dónde vivir. Se pregunta por WhatsApp, se contesta de memoria, y
--  dentro de un año, cuando SUNAT observe el periodo, la explicación no está
--  en ninguna parte. La conversación tiene que quedar pegada al mes del que
--  habla.
--
--  ── LA MISMA BODEGA, UNA PUERTA MÁS ──
--  No se construye nada nuevo: se sigue la regla que fijó
--  db/objeto-comentarios.sql y que ya llevó el sistema a once puertas. Con
--  esta son DOCE. El costo —una columna anulable más en tres tablas— se paga a
--  propósito, por lo mismo de siempre: mantiene el borrado en cascada y una
--  sola forma de comentar. Ver db/rendicion-interaccion.sql, que argumenta
--  esto largo y no se repite aquí.
--
--  ── Y QUIÉN MARCÓ EL PERIODO, Y CUÁNDO ──
--  `declarado_por` ya existía y `marcarDeclarado` lo escribe. Lo que faltaba
--  era CUÁNDO se marcó: `declarado_en` es la fecha en que SUNAT recibió la
--  declaración, no la fecha en que alguien lo apuntó aquí, y son cosas
--  distintas —los 18 periodos de Wilkakalle se presentaron entre 2024 y 2025 y
--  se apuntaron todos en un rato de 2026—. Confundirlas es el mismo error que
--  ya se evitó en `estado_cuenta` con `creado_en` / `comprobante_en`.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/rendicion-interaccion.sql (es la puerta once; el check de
--    dueño único se reescribe entero y hay que partir de él) y de
--    db/obligaciones.sql.
-- ============================================================


-- ── 0. EL ORDEN, COMPROBADO ──
-- El check de dueño único se reescribe ENTERO más abajo. Si esto corre antes
-- que rendicion-interaccion.sql, el check saldría sin los cinco términos de la
-- rendición y la siguiente reacción sobre una factura reventaría contra filas
-- que ya estaban ahí. Fallar antes de tocar nada es más barato.
do $$
begin
  if to_regclass('public.obligacion_periodo') is null then
    raise exception 'Falta db/obligaciones.sql: no existe obligacion_periodo.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'comentarios' and column_name = 'movimiento_banco_id'
  ) then
    raise exception 'Corre antes db/rendicion-interaccion.sql: faltan las puertas 7-11.';
  end if;
end $$;


-- ── 1. CUÁNDO SE APUNTÓ AQUÍ ──
alter table obligacion_periodo
  add column if not exists registrado_en timestamptz;

comment on column obligacion_periodo.registrado_en is
  'Cuándo se marcó el periodo EN CREWHUB. No confundir con declarado_en, que es la fecha en que SUNAT recibió la declaración: un periodo de 2024 puede haberse apuntado aquí en 2026.';

-- Los que ya estaban marcados no tienen este dato y no se puede inventar. Se
-- quedan en null, y la pantalla dirá «no consta» en vez de una fecha falsa.


-- ── 2. COMENTAR UN PERIODO ──
alter table comentarios
  add column if not exists obligacion_periodo_id uuid
    references obligacion_periodo(id) on delete cascade;

create index if not exists idx_com_oblper on comentarios (obligacion_periodo_id, creado_en);

-- Exactamente UNO de los doce dueños.
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
  = 1
);

comment on column comentarios.obligacion_periodo_id is
  'Duodécima puerta: el hilo de un periodo declarable — «¿por qué este mes se declaró en cero?».';


-- ── 3. REACCIONAR AL PERIODO ──
-- El 👀 sobre un mes es «lo revisé y está bien» sin escribirlo. En una lista
-- de veintiocho meses es la única forma realista de dejar constancia de una
-- revisión completa.
alter table reacciones
  add column if not exists obligacion_periodo_id uuid
    references obligacion_periodo(id) on delete cascade;

create index if not exists idx_rx_oblper on reacciones (obligacion_periodo_id);

alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null
  or postulacion_id is not null or movimiento_caja_id is not null
  or comprobante_id is not null or estado_cuenta_id is not null
  or rhe_id is not null or gasto_dj_id is not null
  or movimiento_banco_id is not null or obligacion_periodo_id is not null
);

-- ⚠ EL UNIQUE HAY QUE REHACERLO, Y ESTA ES LA CUARTA VEZ QUE SE ESCRIBE.
-- Un unique que no mira la columna nueva trata a DOS periodos distintos como
-- el mismo —los dos con todas las demás en null— y bloquea la segunda reacción
-- con un error de duplicado que en pantalla no significa nada.
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
  usuario_id, emoji
);


-- ── 4. QUE EL AVISO SEPA A DÓNDE LLEVAR ──
alter table notificaciones
  add column if not exists obligacion_periodo_id uuid
    references obligacion_periodo(id) on delete cascade;

-- Índice PARCIAL, como los otros once: sin él, borrar un periodo obliga a un
-- recorrido completo de `notificaciones` por la FK en cascada.
create index if not exists idx_notif_oblper on notificaciones (obligacion_periodo_id)
  where obligacion_periodo_id is not null;


-- ── 5. QUIÉN PUEDE HABLAR ──
-- Abierto a todo el equipo, igual que las once anteriores y que la propia
-- pantalla de obligaciones (ver el comentario de app/obligaciones/page.tsx).
-- Las políticas de `comentarios` y `reacciones` ya son por tabla, no por
-- columna, así que no hay nada que añadir: la puerta nueva hereda las de la
-- bodega. Se dice aquí para que quede constancia de que se comprobó y no de
-- que se olvidó.


-- ── VERIFICAR ──
select
  (select count(*) from information_schema.columns
    where table_name = 'comentarios'   and column_name = 'obligacion_periodo_id') as en_comentarios,
  (select count(*) from information_schema.columns
    where table_name = 'reacciones'    and column_name = 'obligacion_periodo_id') as en_reacciones,
  (select count(*) from information_schema.columns
    where table_name = 'notificaciones' and column_name = 'obligacion_periodo_id') as en_notificaciones,
  (select count(*) from information_schema.columns
    where table_name = 'obligacion_periodo' and column_name = 'registrado_en') as registrado_en;
-- Los cuatro deben salir en 1.
