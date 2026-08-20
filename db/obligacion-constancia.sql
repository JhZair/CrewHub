-- ============================================================
--  db/obligacion-constancia.sql — LA PRUEBA DE QUE SE DECLARÓ
--
--  `obligacion_periodo` sabía SI se declaró y CUÁNDO. Le faltaba lo único que
--  lo prueba: el número de orden que SUNAT asigna a cada presentación. Sin él,
--  marcar un periodo es decir «sí, creo que sí» — y el día que alguien
--  pregunte, hay que volver a entrar a SOL a buscarlo.
--
--  ── Y LAS RECTIFICATORIAS ──
--  Un periodo puede declararse dos veces: la original y la que la corrige. El
--  reporte de SOL las lista como dos filas del mismo periodo, y eso obliga a
--  una decisión que cambia el resultado:
--
--    `declarado_en` guarda la fecha de la PRIMERA.
--
--  Porque lo que decide si se presentó dentro de plazo es la original:
--  rectificar en noviembre no vuelve tardía una declaración de agosto, ni
--  salva a una que ya lo era. Las posteriores van aparte, en `rectificaciones`,
--  y no se tiran: explican por qué el importe declarado puede no coincidir con
--  el de la primera.
--
--  Idempotente. Al final verifica.
-- ============================================================

alter table obligacion_periodo add column if not exists nro_orden text;

/* Las presentaciones POSTERIORES a la primera: [{fecha, nroOrden}, …].
   `jsonb` y no una tabla aparte: son cero, una o dos por periodo, nunca se
   consultan sueltas y no tienen vida propia. Una tabla para esto sería un
   join permanente a cambio de nada. */
alter table obligacion_periodo add column if not exists rectificaciones jsonb;

/* Lo que se pagó al presentar, si algo. Distinto de `monto`: aquel es el
   RESULTADO del periodo (saldo a favor, a pagar) y este es lo que efectivamente
   se giró. En esta asociación todos vienen en cero, pero el día que uno no lo
   esté, cuadrarlo contra el banco es la pregunta siguiente. */
alter table obligacion_periodo add column if not exists monto_pago numeric(12,2);

comment on column obligacion_periodo.nro_orden is
  'Número de orden de la constancia de SUNAT: la prueba de la presentación.';
comment on column obligacion_periodo.rectificaciones is
  'Presentaciones posteriores a la primera. La fecha de la PRIMERA vive en declarado_en, porque es la que decide la puntualidad.';

-- ── VERIFICAR ──
select column_name, data_type
  from information_schema.columns
 where table_name = 'obligacion_periodo'
   and column_name in ('nro_orden', 'rectificaciones', 'monto_pago')
 order by column_name;
