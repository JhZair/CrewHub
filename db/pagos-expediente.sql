-- ============================================================
--  EL EXPEDIENTE DE UN PAGO — de la jornada al comprobante
--
--  El flujo real es este:
--    jornada aprobada → mes liquidado → RHE girado y registrado →
--    dinero salido del banco → comprobante en Drive → expediente cerrado
--
--  Seis pasos, y la tentación es guardar seis banderas. No se hace, y el
--  motivo es el que ya gobierna lib/fondos.ts: MANDA EL HECHO, NO LA BANDERA.
--  Una casilla «pagado» que alguien tilda a mano puede estar en verde con el
--  dinero sin salir, o en gris con el dinero fuera. No falla: miente, y el
--  tablero no da ninguna señal de estarlo haciendo.
--
--  Así que casi todo se DEDUCE de lo que ya existe (ver lib/pagos.ts):
--    · ¿hay recibo?      → una fila de `rhe` enlazada a esa liquidación
--    · ¿hay comprobante? → esa fila tiene `url` (el PDF en Drive)
--    · ¿se pagó?         → hay un `movimiento_banco` con ese `rhe_id`
--
--  Este archivo añade solo lo que NO se puede deducir. Son tres cosas.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================


-- ── 1. EL ESLABÓN QUE FALTABA ──
--
-- Hasta ahora nada unía «lo que se le debe a Fulano por agosto» con «el recibo
-- E001-123». Las dos mitades del pago existían y no se hablaban, así que la
-- tubería no se podía recorrer entera ni en un sentido ni en el otro.
--
-- Va en `rhe` y no en `liquidaciones` porque la relación es de muchos a uno:
-- un mes puede pagarse en dos recibos (un adelanto y un saldo), y el lado que
-- sabe a qué mes pertenece es el recibo. Al revés obligaría a inventar una
-- tabla puente para un caso que se resuelve con una columna.
--
-- `on delete set null` y no `cascade`: si alguien reabre una liquidación, el
-- RHE NO se borra. El recibo se giró de verdad, existe ante SUNAT y cuenta
-- para el tope de 4ta — borrarlo por corregir un mes sería perder un hecho
-- fiscal por un ajuste administrativo.
alter table rhe add column if not exists liquidacion_id uuid
  references liquidaciones(id) on delete set null;

create index if not exists idx_rhe_liquidacion on rhe(liquidacion_id);

comment on column rhe.liquidacion_id is
  'La liquidación (persona-mes) que este recibo paga. Nulo cuando el RHE no viene de jornadas — un servicio externo se gira igual y no tiene mes que liquidar.';


-- ── 2. EL PAGO SE PRUEBA CON SU COMPROBANTE ──
--
-- La primera versión de esto deducía el pago del estado de cuenta: si existe un
-- `movimiento_banco` con este `rhe_id`, hubo dinero. Sonaba a la prueba más
-- fuerte posible y estaba equivocada por dos motivos, los dos descubiertos
-- mirando cómo se paga de verdad:
--
--   1. Un retiro NO es un pago. En Mujunakuy hay siete retiros —cheques de
--      gerencia, notas de débito— por ≈ S/ 199,604 contra 58 recibos. Un
--      cheque paga a doce personas. La relación es de uno a muchos y
--      `rhe_id` es de uno a uno: nunca iba a poder atarlos.
--   2. Muchos pagos no pasan por ahí: efectivo, depósito, una cuenta cuyo
--      libro no llevamos.
--
-- Lo que SÍ existe siempre —porque Katy lo guarda de todos modos— es el
-- comprobante: la captura de la transferencia, el voucher del depósito, el
-- recibo del efectivo. Ese documento prueba ESTE pago a ESTA persona por ESTE
-- monto, que es justo lo que la línea del banco no puede decir.
--
-- Así que la prueba es el comprobante. El estado de cuenta se queda para lo que
-- sirve: cuadrar el fondo entero, no certificar pagos uno a uno.
--
-- Se guarda quién y cuándo, no un booleano: «alguien lo dio por pagado» sin
-- decir quién es lo mismo que no saberlo.
alter table rhe add column if not exists pagado_en    timestamptz;
alter table rhe add column if not exists pagado_por   uuid references perfiles(id);
alter table rhe add column if not exists pagado_nota  text;
alter table rhe add column if not exists pagado_url   text;
alter table rhe add column if not exists pagado_medio text;

comment on column rhe.pagado_url is
  'El comprobante del pago: captura de la transferencia, voucher del depósito, recibo del efectivo. Es LA prueba de que el dinero salió. Distinto de rhe.url, que es el PDF del recibo girado — uno dice qué se debía, el otro que se pagó.';

comment on column rhe.pagado_medio is
  'transferencia | deposito | efectivo | otro. Importa porque decide qué comprobante esperar: una transferencia siempre tiene captura, un pago en efectivo puede no tener más que la firma de quien cobró.';


-- ── 3. EL CIERRE ──
--
-- La única casilla del flujo que es una DECISIÓN y no un hecho. «Completo» lo
-- calcula el sistema —están el recibo, el comprobante y el dinero—; «cerrado»
-- lo dice una persona: revisé esto y no hay que volver.
--
-- Se separan porque no son lo mismo y confundirlos cuesta caro: un expediente
-- puede estar completo y tener el monto equivocado. Completo dice que no falta
-- nada; cerrado dice que además está bien.
alter table liquidaciones add column if not exists cerrado_en  timestamptz;
alter table liquidaciones add column if not exists cerrado_por uuid references perfiles(id);

-- ── 2b. QUIÉN GIRÓ EL RECIBO ──
--
-- Tres vías, y son tres realidades distintas:
--   oficina   · lo gira quien trabaja aquí
--   delegado  · nos delegaron su clave SOL y lo gira Katy (zona rural)
--   propio    · un eventual —el sonidista— lo gira él mismo
--
-- No es una etiqueta descriptiva: cambia a quién se le reclama cuando el
-- recibo falta, y cambia de quién es la responsabilidad del TOPE DE 4TA. En
-- los `delegado` somos los únicos que podemos ver venir la ruptura de la
-- suspensión, porque la clave la tenemos nosotros; en los `propio`, lo único
-- que podemos hacer es avisar. Hoy la vigilancia trata a todos igual.
alter table rhe add column if not exists girado_por text;

comment on column rhe.girado_por is
  'oficina | delegado | propio. Quién giró materialmente el recibo en SUNAT. Decide a quién reclamar si falta, y de quién es la responsabilidad de vigilar el tope de 4ta.';


-- El índice al otro lado del vínculo con el banco. La conciliación del fondo
-- sigue usando `movimiento_banco.rhe_id` cuando un retiro SÍ corresponde a un
-- recibo concreto; ya no es la prueba del pago, pero sigue siendo un dato útil
-- y se consulta por ese lado.
create index if not exists idx_movbanco_rhe on movimiento_banco(rhe_id);


comment on column liquidaciones.cerrado_en is
  'Cuándo se dio el expediente por revisado y terminado. Distinto de «completo», que lo deduce el sistema: completo = no falta nada; cerrado = además alguien lo miró.';
