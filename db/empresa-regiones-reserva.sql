-- ============================================================
--  Las tres regiones que pide la reserva regional del DAFO
--
--  Bases 2026 (Animación), numeral IV.3 — cita textual:
--
--    "Para efectos de las postulaciones que apliquen a la reserva para las
--     regiones del país excluyendo a Lima Metropolitana y Callao, los
--     postulantes deben acreditar como lugar de constitución una región
--     distinta de Lima Metropolitana y Callao, en la Superintendencia
--     Nacional de los Registros Públicos (SUNARP) y consignar domicilio en
--     una región fuera de Lima Metropolitana y Callao ante la SUNARP y la
--     Superintendencia Nacional de Aduanas y Administración Tributaria
--     (SUNAT)."
--
--  Ahí hay TRES hechos, no uno:
--    1. lugar de constitución  → SUNARP
--    2. domicilio registral    → SUNARP
--    3. domicilio fiscal       → SUNAT
--  Los tres tienen que estar fuera de Lima Metropolitana y Callao. Pueden no
--  coincidir: una empresa constituida en Cusco puede haber mudado su
--  domicilio registral a Lima. Guardarlos en un solo campo sería decidir por
--  adelantado que nunca difieren — y el día que difieran, el sistema diría
--  «califica» de algo que no.
--
--  `empresas.region` NO sirve para esto: significa dónde OPERA la empresa
--  (confirmado con el equipo). Es otro hecho, igual de válido, y se queda
--  como está.
--
--  Por qué no se deducen de `domicilio_fiscal`: es texto libre que alguien
--  tecleó ("Cal. Paseo de la amistad S/N. Paucartambo- Cusco"). La API de
--  SUNAT que consultamos solo devuelve estado y condición, no el
--  departamento. Adivinar la región de una cadena de texto para decidir si
--  se accede a media convocatoria es exactamente lo que no hay que hacer.
--
--  OJO CON «LIMA»: la reserva excluye Lima METROPOLITANA y Callao, no el
--  departamento de Lima. Una empresa en Huacho o en Cañete está en el
--  departamento de Lima y SÍ entra a la reserva. Por eso el sistema, cuando
--  ve "Lima", no concluye: pide la provincia. Ver lib/fondos.ts.
-- ============================================================

alter table empresas add column if not exists sunarp_region_constitucion text;
alter table empresas add column if not exists sunarp_region_domicilio    text;
alter table empresas add column if not exists sunat_region_domicilio     text;
-- Solo se usa cuando alguna de las tres dice "Lima": ahí el departamento no
-- alcanza para saber si es Lima Metropolitana (excluida) o una provincia
-- del departamento (que sí entra).
alter table empresas add column if not exists provincia_lima text;

comment on column empresas.sunarp_region_constitucion is
  'Región del lugar de constitución según la partida registral de SUNARP. Requisito 1 de la reserva regional del DAFO. Distinto de `region`, que es dónde opera.';
comment on column empresas.sunarp_region_domicilio is
  'Región del domicilio consignado ante SUNARP. Puede no coincidir con el lugar de constitución.';
comment on column empresas.sunat_region_domicilio is
  'Región del domicilio fiscal ante SUNAT. No se deduce de `domicilio_fiscal` (texto libre) ni viene de la API, que solo da estado y condición.';
comment on column empresas.provincia_lima is
  'Solo si alguna región dice "Lima": la reserva excluye Lima Metropolitana, no el departamento. Huacho o Cañete SÍ entran.';

-- 👀 Cómo están hoy. Todas en null: nadie ha cargado estos datos porque el
--    sistema no los pedía. Se llenan desde ✏️ Editar en cada ficha.
select codigo, nombre,
       region                       as opera_en,
       sunarp_region_constitucion   as constituida_en,
       sunarp_region_domicilio      as domicilio_sunarp,
       sunat_region_domicilio       as domicilio_sunat,
       domicilio_fiscal
  from empresas
 where estado = 'activa' and relacion = 'propia'
 order by codigo;

-- 💡 Atajo para arrancar: si sabes que una empresa tiene los tres en el
--    mismo sitio, cárgalos de una. NO lo corras a ciegas sobre todas —
--    copiar `region` a las tres sería inventar tres hechos a partir de uno
--    que significa otra cosa (dónde opera), y es justo el error que este
--    archivo vino a evitar.
-- update empresas
--    set sunarp_region_constitucion = 'Cusco',
--        sunarp_region_domicilio    = 'Cusco',
--        sunat_region_domicilio     = 'Cusco'
--  where codigo = 'E-0XX';
