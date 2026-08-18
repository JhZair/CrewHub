-- ============================================================
--  HABLAR DE LA PLATA — las cinco puertas de la rendición
--
--  El módulo de caja ya lo tiene y funciona: cada apunte se puede comentar y
--  se le puede poner un 👀. Esto lleva exactamente eso mismo a las otras cinco
--  tablas donde vive el dinero de un fondo:
--
--    · comprobante        · las facturas y boletas de proveedor
--    · estado_cuenta      · los estados mensuales del banco
--    · rhe                · los recibos por honorarios
--    · gasto_dj           · las declaraciones juradas
--    · movimiento_banco   · el libro línea a línea
--
--  ── POR QUÉ ESTAS Y NO OTRAS ──
--  Porque son las filas que alguien va a mirar con una duda concreta en la
--  mano. «¿Este retiro de S/ 29,000 a qué corresponde?». «¿La PC de S/ 7,588
--  entra en el presupuesto?». «Este RHE es de octubre, después del plazo».
--  Hoy esas preguntas se hacen por WhatsApp y la respuesta no vuelve nunca a
--  la fila — que es donde hará falta el día de la observación, dentro de un
--  año, cuando ya nadie recuerde el hilo.
--
--  ── NO SE CONSTRUYE UN MOTOR NUEVO ──
--  Se usa el que existe, con la regla que db/objeto-comentarios.sql fijó desde
--  el principio: «una sola bodega, muchas puertas». Eran seis (publicación,
--  objeto, préstamo, equipamiento, postulación, movimiento de caja); con estas
--  son ONCE.
--
--  Once columnas anulables es un costo real y conviene decirlo en voz alta en
--  vez de disimularlo. Se paga a propósito: la alternativa —un par
--  (tipo, id) polimórfico para la familia financiera— ahorraría esquema pero
--  dejaría el sistema con DOS formas de comentar según qué se comente, y
--  perdería el borrado en cascada. Un comentario huérfano no da error: se
--  queda ahí, colgando de un RHE que ya no existe, y aparece el día que una
--  pantalla intenta pintarlo. Entre once columnas con integridad y dos
--  mecanismos sin ella, once columnas.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/movcaja-comentarios.sql (es la puerta seis; el check se
--    reescribe entero y hay que partir de él), de db/facturas.sql,
--    db/rendicion-fondo.sql, db/declaraciones-juradas.sql y
--    db/movimiento-banco.sql.
-- ============================================================


-- ── 0. EL ORDEN, COMPROBADO ──
--
-- El check de dueño único se reescribe ENTERO cada vez que aparece una puerta
-- nueva. Correr esto antes que movcaja-comentarios.sql dejaría el check sin el
-- término de caja, y la siguiente reacción sobre un apunte de caja reventaría
-- contra filas que ya estaban ahí. Es el mismo blindaje que documentan
-- db/prestamo-comentarios.sql y db/movcaja-comentarios.sql; no se inventa
-- nada, se repite porque funciona.
--
-- Y se comprueban las cinco tablas de destino, no solo una: si falta
-- `gasto_dj`, el `alter` de esa columna falla a mitad y deja la migración a
-- medias —con tres puertas abiertas, dos no, y un check que ya no describe la
-- realidad—. Fallar antes de tocar nada es más barato que fallar en el medio.
do $$
declare falta text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'comentarios'
                    and column_name = 'movimiento_caja_id') then
    raise exception 'Falta comentarios.movimiento_caja_id: corre antes db/movcaja-comentarios.sql';
  end if;
  select string_agg(t, ', ') into falta
    from unnest(array['comprobante', 'estado_cuenta', 'rhe', 'gasto_dj', 'movimiento_banco']) t
   where to_regclass('public.' || t) is null;
  if falta is not null then
    raise exception 'Faltan tablas de la rendición: %. Corre db/facturas.sql, db/rendicion-fondo.sql, db/declaraciones-juradas.sql y db/movimiento-banco.sql', falta;
  end if;
end $$;


-- ── 1. LAS CINCO PUERTAS DE `comentarios` ──
--
-- `on delete cascade` en las cinco: si se borra la factura, se va su hilo. Un
-- comentario que sobrevive a su dueño no es un archivo histórico, es basura
-- que nadie sabe leer — y las pantallas que lo intenten pintar mostrarán un
-- hueco sin explicación.
alter table comentarios
  add column if not exists comprobante_id      uuid references comprobante(id)      on delete cascade,
  add column if not exists estado_cuenta_id    uuid references estado_cuenta(id)    on delete cascade,
  add column if not exists rhe_id              uuid references rhe(id)              on delete cascade,
  add column if not exists gasto_dj_id         uuid references gasto_dj(id)         on delete cascade,
  add column if not exists movimiento_banco_id uuid references movimiento_banco(id) on delete cascade;

-- El índice lleva `creado_en` como todos los demás: un hilo se lee ordenado
-- por fecha, y sin la segunda columna Postgres ordena a mano lo que ya podía
-- venir ordenado del índice.
create index if not exists idx_com_comprobante on comentarios (comprobante_id, creado_en);
create index if not exists idx_com_estcta      on comentarios (estado_cuenta_id, creado_en);
create index if not exists idx_com_rhe         on comentarios (rhe_id, creado_en);
create index if not exists idx_com_gastodj     on comentarios (gasto_dj_id, creado_en);
create index if not exists idx_com_movbanco    on comentarios (movimiento_banco_id, creado_en);

-- Exactamente UNO de los once dueños. Un comentario huérfano —o de dos
-- dueños— no lo detecta nadie hasta que una pantalla se rompe, y para
-- entonces ya hay filas malas que hay que limpiar a mano.
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
  = 1
);

comment on column comentarios.comprobante_id is
  'Séptima puerta: el hilo de una factura o boleta de proveedor.';
comment on column comentarios.estado_cuenta_id is
  'Octava puerta: el hilo de un estado de cuenta mensual.';
comment on column comentarios.rhe_id is
  'Novena puerta: el hilo de un recibo por honorarios.';
comment on column comentarios.gasto_dj_id is
  'Décima puerta: el hilo de una declaración jurada.';
comment on column comentarios.movimiento_banco_id is
  'Undécima puerta: el hilo de un movimiento del banco — «¿este retiro qué fue?».';


-- ── 2. REACCIONAR A LA FILA, NO SOLO A SUS COMENTARIOS ──
--
-- Igual que en caja, y por el mismo motivo: un 👀 sobre una factura es «la vi,
-- está bien» sin tener que escribir «la vi, está bien». En una rendición que
-- revisa una contadora sobre lo que cargó otra persona, ese acuse silencioso
-- es la mitad de la conversación — y la mitad que nunca se escribe si hay que
-- redactarla.
alter table reacciones
  add column if not exists comprobante_id      uuid references comprobante(id)      on delete cascade,
  add column if not exists estado_cuenta_id    uuid references estado_cuenta(id)    on delete cascade,
  add column if not exists rhe_id              uuid references rhe(id)              on delete cascade,
  add column if not exists gasto_dj_id         uuid references gasto_dj(id)         on delete cascade,
  add column if not exists movimiento_banco_id uuid references movimiento_banco(id) on delete cascade;

create index if not exists idx_rx_comprobante on reacciones (comprobante_id);
create index if not exists idx_rx_estcta      on reacciones (estado_cuenta_id);
create index if not exists idx_rx_rhe         on reacciones (rhe_id);
create index if not exists idx_rx_gastodj     on reacciones (gasto_dj_id);
create index if not exists idx_rx_movbanco    on reacciones (movimiento_banco_id);

alter table reacciones drop constraint if exists reacciones_dueno_chk;
alter table reacciones add constraint reacciones_dueno_chk check (
  publicacion_id is not null or comentario_id is not null
  or postulacion_id is not null or movimiento_caja_id is not null
  or comprobante_id is not null or estado_cuenta_id is not null
  or rhe_id is not null or gasto_dj_id is not null
  or movimiento_banco_id is not null
);

-- ⚠ EL UNIQUE HAY QUE REHACERLO. Este es el fallo sutil que ya mordió DOS
-- veces (db/postulacion-interaccion.sql y db/movcaja-comentarios.sql lo
-- documentan), y la tercera sería por no leer lo que ya está escrito:
-- un unique que no mira las columnas nuevas trata a DOS facturas distintas
-- como la misma —las dos con pub=null, com=null, post=null, caja=null— y
-- bloquea la segunda reacción con un error de duplicado que en pantalla no
-- significa absolutamente nada.
-- El `coalesce` a texto vacío es lo que impide además que los null colisionen
-- entre tipos de dueño distintos.
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
  usuario_id, emoji
);


-- ── 3. QUE EL AVISO SEPA A DÓNDE LLEVAR ──
--
-- Sin esto, mencionar a alguien en una factura le manda un aviso que al
-- pulsarlo no lleva a ninguna parte. Ya pasó —y costó dos rondas de
-- depuración— con `comentario_id`: el aviso existía, se veía, y el clic no
-- hacía nada. Un aviso que no lleva a su sitio es peor que no avisar, porque
-- enseña a ignorar la campana.
alter table notificaciones
  add column if not exists comprobante_id      uuid references comprobante(id)      on delete cascade,
  add column if not exists estado_cuenta_id    uuid references estado_cuenta(id)    on delete cascade,
  add column if not exists rhe_id              uuid references rhe(id)              on delete cascade,
  add column if not exists gasto_dj_id         uuid references gasto_dj(id)         on delete cascade,
  add column if not exists movimiento_banco_id uuid references movimiento_banco(id) on delete cascade;

-- Índices PARCIALES, como los de objeto, equipamiento y caja: sin ellos, cada
-- borrado de una factura obliga a un recorrido completo de `notificaciones`
-- por la FK en cascada. (`postulacion_id` se saltó este paso en su día; no se
-- repite el olvido cinco veces seguidas.)
create index if not exists idx_notif_comprobante on notificaciones (comprobante_id)      where comprobante_id      is not null;
create index if not exists idx_notif_estcta      on notificaciones (estado_cuenta_id)    where estado_cuenta_id    is not null;
create index if not exists idx_notif_rhe         on notificaciones (rhe_id)              where rhe_id              is not null;
create index if not exists idx_notif_gastodj     on notificaciones (gasto_dj_id)         where gasto_dj_id         is not null;
create index if not exists idx_notif_movbanco    on notificaciones (movimiento_banco_id) where movimiento_banco_id is not null;


-- ── 4. QUIÉN PUEDE COMENTAR LA PLATA ──
--
-- ABIERTO a todo el equipo, a propósito, aunque escribir en estas tablas esté
-- restringido a finanzas por `es_finanzas()`.
--
-- Es la misma decisión que se tomó en caja y por la misma razón: registrar un
-- gasto es mover plata; preguntar por él no. Y la pregunta que esto quiere
-- capturar —«¿esta factura de qué es?»— viene justo de quien NO lleva las
-- finanzas. Si solo finanzas pudiera comentar, la conversación seguiría en
-- WhatsApp y esto sería una tabla más sin nadie escribiendo en ella.
--
-- Las políticas de `comentarios` y `reacciones` ya sirven tal cual: son por
-- tabla y no miran de qué cuelga la fila. No hay nada que añadir aquí; se deja
-- dicho para que nadie las busque pensando que se olvidaron.


-- ------------------------------------------------------------
--  VERIFICAR
-- ------------------------------------------------------------

-- 1. Las quince columnas nuevas, cinco por tabla. Debe dar 15.
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('comentarios', 'reacciones', 'notificaciones')
   and column_name in ('comprobante_id', 'estado_cuenta_id', 'rhe_id',
                       'gasto_dj_id', 'movimiento_banco_id');

-- 2. El check de dueño único, con sus once términos. Debe devolver UNA fila
--    cuyo texto mencione las once columnas.
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'comentarios'::regclass and conname = 'comentarios_dueno_chk';

-- 3. El unique de reacciones, rehecho. La definición tiene que nombrar las
--    cinco columnas nuevas: si no aparecen, la segunda reacción sobre dos
--    filas distintas de la misma tabla se rechazará por duplicado.
select indexdef from pg_indexes
 where schemaname = 'public' and indexname = 'uq_reacciones_dueno';

-- 4. Los comentarios sin dueño o con dos ya NO hay que buscarlos aquí: si este
--    archivo llegó hasta el final, es que no los hay. Postgres valida el check
--    contra todas las filas existentes al crearlo, así que un solo comentario
--    huérfano habría hecho fallar el paso 1 con «violates check constraint».
--    Se deja dicho para que nadie escriba la consulta y concluya, al verla
--    vacía, que la comprobó — cuando lo que la vacía es el propio check.
--    La comprobación que SÍ dice algo es que las once puertas estén completas
--    en las tres tablas: sin la columna en `notificaciones`, comentar funciona
--    y el aviso no lleva a ninguna parte. Debe devolver CERO filas.
select t.tabla, c.columna
  from unnest(array['comentarios', 'reacciones', 'notificaciones']) as t(tabla)
 cross join unnest(array['comprobante_id', 'estado_cuenta_id', 'rhe_id',
                         'gasto_dj_id', 'movimiento_banco_id']) as c(columna)
 where not exists (
   select 1 from information_schema.columns i
    where i.table_schema = 'public' and i.table_name = t.tabla
      and i.column_name = c.columna);
