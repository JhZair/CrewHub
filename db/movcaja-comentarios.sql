-- ============================================================
--  HABLAR DE UN APUNTE DE CAJA — la sexta puerta
--
--  Un gasto de caja necesita conversación más que casi ningún otro dato del
--  sistema: «¿esto qué fue?», «¿quién lo autorizó?», «¿por qué S/ 300 de
--  transporte?». Hoy eso vive en WhatsApp y la respuesta no vuelve nunca al
--  apunte — que es donde hará falta cuando alguien la busque en tres meses.
--
--  NO se construye un motor nuevo. Se usa el que ya existe, con la regla que
--  db/objeto-comentarios.sql fijó desde el principio: «una sola bodega, dos
--  puertas». Van seis: publicación, objeto, préstamo, equipamiento,
--  postulación y ahora movimiento de caja. Misma tabla, mismas menciones,
--  misma bandeja de avisos — solo cambia de quién cuelga.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/caja.sql y de db/postulacion-interaccion.sql.
-- ============================================================


-- ── 0. EL ORDEN, COMPROBADO ──
-- El check de dueño único se reescribe entero cada vez que aparece una puerta
-- nueva, así que correr esto ANTES que postulacion-interaccion.sql dejaría el
-- check en cinco y reventaría contra las filas de caja ya insertadas. Es el
-- mismo blindaje que db/prestamo-comentarios.sql documenta.
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'movimiento_caja') then
    raise exception 'Falta la tabla movimiento_caja: corre antes db/caja.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'comentarios'
                    and column_name = 'postulacion_id') then
    raise exception 'Falta comentarios.postulacion_id: corre antes db/postulacion-interaccion.sql';
  end if;
end $$;


-- ── 1. LA SEXTA PUERTA DE `comentarios` ──
alter table comentarios
  add column if not exists movimiento_caja_id uuid references movimiento_caja(id) on delete cascade;

-- El índice va con `creado_en` como todos los demás: un hilo se lee ordenado
-- por fecha, y sin la segunda columna Postgres ordena a mano lo que ya podía
-- venir ordenado.
create index if not exists idx_com_movcaja on comentarios (movimiento_caja_id, creado_en);

-- Exactamente UNO de los seis dueños. Un comentario huérfano —o de dos
-- dueños— no lo detecta nadie hasta que una pantalla se rompe.
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk check (
    (publicacion_id is not null)::int
  + (objeto_id is not null)::int
  + (prestamo_id is not null)::int
  + (equipamiento_id is not null)::int
  + (postulacion_id is not null)::int
  + (movimiento_caja_id is not null)::int
  = 1
);

comment on column comentarios.movimiento_caja_id is
  'Sexta puerta: el hilo de un apunte de caja — qué fue ese gasto, quién lo autorizó.';


-- ── 2. REACCIONAR AL PROPIO MOVIMIENTO ──
--
-- No solo a sus comentarios. Un 👀 sobre un gasto es «lo vi, está bien» sin
-- tener que escribir «lo vi, está bien» — y en una caja que revisa otra
-- persona, eso es la mitad de la conversación.
alter table reacciones
  add column if not exists movimiento_caja_id uuid references movimiento_caja(id) on delete cascade;
create index if not exists idx_rx_movcaja on reacciones (movimiento_caja_id);

alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null
  or postulacion_id is not null or movimiento_caja_id is not null
);

-- ⚠ EL UNIQUE HAY QUE REHACERLO, y este es el fallo sutil que ya mordió una
-- vez (db/postulacion-interaccion.sql): un unique que no mira la columna nueva
-- trata a DOS movimientos distintos como el mismo —los dos con pub=null,
-- com=null, post=null— y bloquea la segunda reacción con un error de duplicado
-- que no tiene ningún sentido en pantalla. El `coalesce` evita además que los
-- null colisionen entre tipos de dueño.
drop index if exists uq_reacciones_dueno;
create unique index uq_reacciones_dueno on reacciones (
  coalesce(publicacion_id::text, ''),
  coalesce(comentario_id::text, ''),
  coalesce(postulacion_id::text, ''),
  coalesce(movimiento_caja_id::text, ''),
  usuario_id, emoji
);


-- ── 3. QUE EL AVISO SEPA A DÓNDE LLEVAR ──
alter table notificaciones
  add column if not exists movimiento_caja_id uuid references movimiento_caja(id) on delete cascade;

-- Índice PARCIAL, como los de objeto y equipamiento: sin él, cada borrado de
-- un movimiento obliga a un recorrido completo de la tabla por la FK en
-- cascada. (`postulacion_id` se saltó este paso; no se repite el olvido.)
create index if not exists idx_notif_movcaja on notificaciones (movimiento_caja_id)
  where movimiento_caja_id is not null;


-- ── 4. LAS POLÍTICAS DE `reacciones`, POR FIN VERSIONADAS ──
--
-- Deuda vieja que se salda aquí. `reacciones` solo tenía versionada la de
-- LECTURA; las de insertar y borrar existen únicamente en el dashboard de
-- Supabase, hechas a mano. Es exactamente lo que db/objeto-comentarios.sql
-- denunció y corrigió para `comentarios`, y tiene la misma consecuencia: una
-- base reconstruida desde el repo se queda con las reacciones muertas —sin
-- error visible, simplemente no pasa nada al pulsar.
--
-- `usuario_id = auth.uid()` en las dos: se reacciona por uno mismo, y se quita
-- la propia reacción. Nadie borra la de otro.
drop policy if exists "crear_reac"  on reacciones;
drop policy if exists "borrar_reac" on reacciones;
create policy "crear_reac"  on reacciones for insert to authenticated
  with check (usuario_id = auth.uid());
create policy "borrar_reac" on reacciones for delete to authenticated
  using (usuario_id = auth.uid());


-- ── 5. QUIÉN PUEDE COMENTAR UN MOVIMIENTO ──
--
-- Se deja ABIERTO a todo el equipo, a propósito, aunque escribir en la caja
-- esté restringido a finanzas.
--
-- Escribir un movimiento es mover plata; preguntar por él no. Y la pregunta
-- que este módulo quiere capturar —«¿esto qué fue?»— viene justo de quien NO
-- lleva la caja: si solo finanzas pudiera comentar, la conversación seguiría
-- en WhatsApp y esto habría sido una tabla más sin nadie escribiendo en ella.
--
-- Las políticas existentes de `comentarios` ya sirven tal cual: son por tabla
-- y no miran de qué cuelga el comentario. No hay nada que añadir.
