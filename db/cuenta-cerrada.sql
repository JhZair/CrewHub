-- ══════════════════════════════════════════════════════════════════════════
-- CUANDO EL BANCO CIERRA LA CUENTA, LA SERIE TERMINA
--
-- PO-005 gastó el fondo entero y cerró la cuenta exclusiva. El sistema seguía
-- pidiendo cinco estados mensuales —jun, jul, ago 2024 y dos más— porque su
-- serie solo sabía terminar por dos motivos: que se hubiera rendido, o que se
-- hubiera acabado el plazo del acta. Faltaba el tercero, y es el más
-- definitivo de los tres: no hay más papeles porque no hay más cuenta.
--
-- ── POR QUÉ NO SE REGISTRAN ESOS MESES EN CERO ──
-- Era la salida rápida y es la peor. Un estado de cuenta en cero AFIRMA que el
-- banco reportó saldo cero ese mes; lo que pasó es que la cuenta ya no
-- existía. Son hechos distintos, y el falso es el que queda guardado: dentro
-- de dos años nadie podrá saber si esos ceros son un dato o un relleno.
-- Además serían cinco filas sin PDF, así que la burbuja ámbar de «comprobantes
-- que faltan» subiría a cinco — se cambia un aviso correcto por uno falso.
-- Aquí se guarda el HECHO —la cuenta se cerró el día tal— y la cuenta de
-- meses sale sola. Un cero no es un cero: es «no lo sé».
-- ══════════════════════════════════════════════════════════════════════════

alter table postulaciones add column if not exists fecha_cierre_cuenta date;

comment on column postulaciones.fecha_cierre_cuenta is
  'Cuándo se cerró la cuenta bancaria exclusiva del fondo. A partir de ese mes no hay estados que pedir: el banco ya no emite. Cierra la serie igual que la rendición y el plazo del acta (ver lib/estadosCuenta).';

-- ── QUE NO SE CIERRE ANTES DE EMPEZAR ──
-- Una cuenta cerrada antes del desembolso dejaría la serie en cero meses y el
-- fondo se leería como «al día» sin un solo papel: la alarma más silenciosa
-- posible. Casi siempre sería un dedazo en el año.
alter table postulaciones drop constraint if exists postulaciones_cierre_cuenta_ok;
alter table postulaciones add constraint postulaciones_cierre_cuenta_ok check (
  fecha_cierre_cuenta is null
  or fecha_desembolso is null
  or fecha_cierre_cuenta >= fecha_desembolso
);

-- VERIFICAR
-- select id, fecha_desembolso, fecha_cierre_cuenta from postulaciones
--  where fecha_cierre_cuenta is not null;
