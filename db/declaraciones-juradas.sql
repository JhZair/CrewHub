-- ============================================================
--  DECLARACIONES JURADAS — el saldo que evita pagar dos veces
--
--  EL PROBLEMA, en las palabras del 16/07:
--    «En zona rural o en la puna, no hay forma de pedir RHE, se paga sin
--     ningún comprobante; ya luego regresando al Cusco se suman esos gastos y
--     se generan declaraciones juradas. Generalmente el 10% no es suficiente.»
--
--  DAFO acepta esos gastos —el acta 139-2025 los describe con esas palabras:
--  «actividades realizadas en zonas alejadas de centros poblados o en
--  situación de informalidad»— pero los TOPEA: un porcentaje del estímulo, y
--  ni un sol más.
--
--  Y lo que hace que esto sea la pieza número uno y no contabilidad es la
--  cláusula 6.9 del mismo contrato: si no se acreditan los gastos de manera
--  fehaciente, hay que DEVOLVER el monto. Pasarse del tope no es un papel
--  rechazado: es pagar dos veces, de un bolsillo que ya pagó una, por plata
--  que se entregó en efectivo a gente en comunidad y no se puede recuperar.
--
--  Por eso lo que este módulo tiene que decir no es «cuánto llevas gastado»
--  sino CUÁNTO TE QUEDA — y decirlo ANTES de subir a la puna, que es cuando
--  sirve. Es la misma forma que lib/cuarta.ts, que ya funciona: un tope que se
--  consume y avisa antes de romperse.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/rhe-permisos.sql: las políticas de aquí usan es_finanzas().
-- ============================================================


-- ── 0. LA DEPENDENCIA, COMPROBADA ANTES DE TOCAR NADA ──
--
-- Las políticas de más abajo llaman a `public.es_finanzas()`, que crea
-- db/rhe-permisos.sql. Sin esa función el script se caía A MITAD: dejaba la
-- tabla creada, la RLS activada y NINGUNA política — y ese estado no da error
-- al leer, devuelve CERO FILAS. La pantalla habría dicho, con toda confianza,
-- que queda el tope entero libre. En el único número cuyo exceso obliga a
-- devolver plata, ese es el peor fallo imaginable: silencioso y optimista.
--
-- Se comprueba primero y se para con un mensaje que dice qué correr.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'es_finanzas') then
    raise exception 'Falta public.es_finanzas(): corre antes db/rhe-permisos.sql';
  end if;
end $$;


-- ── 1. EL TOPE, EN DOS SITIOS Y CON UN ORDEN ──
--
-- La regla general vive en la CONVOCATORIA: 10% general, 25% en cine indígena.
-- Es una regla del concurso, no del sistema — igual que la reserva regional—,
-- así que no puede estar escrita en el código: el día que DAFO la cambie habría
-- que desplegar para arreglar una cifra de sus bases.
--
-- Pero el que MANDA es el acta. El acta 139-2025 (Pacha Apus Plus, S/ 400,000)
-- dice 10% en su cláusula 5.2.4, y lo que se firmó es lo que obliga —diga lo
-- que diga la categoría—. Por eso la postulación puede llevar el suyo propio y
-- gana sobre el de la convocatoria.
-- `check` de 0 a 100 en las dos: el CERO es un valor legítimo —un concurso que
-- no admite declaraciones juradas— y distinto de NULL, que quiere decir «no se
-- ha cargado». Confundirlos haría caer al tope de las bases y enseñar un margen
-- que no existe.
alter table convocatorias add column if not exists tope_dj_pct numeric(5,2)
  check (tope_dj_pct is null or (tope_dj_pct >= 0 and tope_dj_pct <= 100));
alter table postulaciones add column if not exists tope_dj_pct numeric(5,2)
  check (tope_dj_pct is null or (tope_dj_pct >= 0 and tope_dj_pct <= 100));

comment on column convocatorias.tope_dj_pct is
  'Tope de declaraciones juradas del concurso, en % del estímulo (10 general, 25 cine indígena). Regla de las bases, no del sistema.';
comment on column postulaciones.tope_dj_pct is
  'El tope que dice ESTA acta, cuando difiere del de la convocatoria. Gana sobre aquel: lo que obliga es lo firmado.';

-- NOTA IMPORTANTE, y está en lib/dj.ts además de aquí: cuando no hay ninguno de
-- los dos cargados, NO se asume 10%. Asumir de menos frena rodaje que sí se
-- podía hacer; asumir de más termina en devolver plata. Sin dato, la pantalla
-- dice «falta cargar el tope» — que es la verdad y además se puede arreglar.


-- ── 2. EL GASTO DECLARADO ──
--
-- Las columnas son las que pide el formato de DAFO, ni una más: «Descripción ·
-- Actividad relacionada al desarrollo del proyecto · Lugar (Origen/Destino) ·
-- Fecha (día o rango) · Importe». Inventar campos propios obligaría a traducir
-- al exportar, y una traducción es un sitio donde perder datos.
create table if not exists gasto_dj (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,

  descripcion    text not null,
  -- El «para qué», que en el informe económico es la actividad 1-6. Se guarda
  -- la etapa como en `rhe.etapa`, por el mismo motivo: es el eje que agrupa.
  etapa          text,
  -- El «de qué tipo», para cuadrar contra el presupuesto (lib/rubros.ts).
  rubro_item     text,

  -- La fecha es un RANGO porque una semana de rodaje es una fila del cuaderno,
  -- no siete. `hasta` nulo = un solo día. Partirlo en siete filas para caber en
  -- un `date` habría multiplicado por siete las 9 filas que admite una DJ.
  fecha          date not null,
  fecha_hasta    date,

  -- Origen/Destino tal como los pide el formato. Dos columnas y no un texto
  -- libre: en el informe van separados y juntarlos obliga a partirlo después.
  lugar_origen   text,
  lugar_destino  text,

  importe        numeric(12,2) not null check (importe > 0),
  -- El rango, comprobado también aquí y no solo en el servidor. Una fila con
  -- «del 9 al 3 de agosto» no rompe nada nuestro: sale impresa en la DJ y la
  -- lee DAFO. Y el rol de finanzas puede escribir por API directa, saltándose
  -- la validación de app/actions.ts.
  constraint gasto_dj_rango check (fecha_hasta is null or fecha_hasta >= fecha),

  -- El documento donde va esta fila. Una DJ admite 9 filas y la puede firmar
  -- otra persona si no fue el representante legal quien gastó (formato DAFO),
  -- así que el número agrupa y `firmada_por` dice quién responde.
  dj_numero      text,
  dj_url         text,
  firmada_por    uuid references personas(id),

  creado_en      timestamptz default now(),
  creado_por     uuid references perfiles(id)
);

-- Uno solo: `(postulacion_id, fecha)` ya sirve para las consultas que filtran
-- solo por postulación, porque es su prefijo. Dos índices serían dos escrituras
-- por cada fila para responder a lo mismo.
create index if not exists idx_gastodj_post on gasto_dj(postulacion_id, fecha);

comment on table gasto_dj is
  'Gastos pagados sin comprobante y respaldados con declaración jurada. Topeados por DAFO a un % del estímulo: pasarse obliga a devolver el exceso (acta, cláusula 6.9).';


-- ── 3. PERMISOS ──
--
-- Mismo criterio que los RHE tras db/rhe-permisos.sql: leer, todo el equipo;
-- escribir, administración o finanzas. Aquí NO hay puerta de «lo mío»: una DJ
-- no la gira nadie a su nombre, la firma quien responde por el gasto, y el
-- documento lo arma administración con el cuaderno delante.
alter table gasto_dj enable row level security;

drop policy if exists "leer_gdj"   on gasto_dj;
drop policy if exists "crear_gdj"  on gasto_dj;
drop policy if exists "editar_gdj" on gasto_dj;
drop policy if exists "borrar_gdj" on gasto_dj;

create policy "leer_gdj"   on gasto_dj for select to authenticated using (true);
create policy "crear_gdj"  on gasto_dj for insert to authenticated with check (public.es_finanzas());
create policy "editar_gdj" on gasto_dj for update to authenticated using (public.es_finanzas()) with check (public.es_finanzas());
create policy "borrar_gdj" on gasto_dj for delete to authenticated using (public.es_finanzas());


-- ── 4. AUDITORÍA ──
--
-- Es plata, así que entra en el mismo rastro inmutable que `rhe`,
-- `estado_cuenta` y `movimiento_banco` (db/auditoria-financiera.sql). Y aquí
-- pesa más que en ninguna: un gasto declarado no tiene comprobante externo que
-- lo respalde —ese es el punto— así que el único rastro de quién lo puso y por
-- cuánto es este.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'audit_financiera') then
    drop trigger if exists trg_audfin_gasto_dj on gasto_dj;
    create trigger trg_audfin_gasto_dj after insert or update or delete on gasto_dj
      for each row execute function audit_financiera();
  else
    raise notice 'Sin auditoría en gasto_dj: falta correr db/auditoria-financiera.sql';
  end if;
end $$;


-- ── 5. CARGAR EL TOPE DE LAS CONVOCATORIAS ──
--
-- Se hace a mano y a conciencia, mirando las bases de cada concurso. Un
-- `update` masivo por categoría parecería cómodo y sería justo el error que
-- este archivo existe para evitar: poner 25 donde el acta dice 10 acaba en
-- devolver plata.
--
--   select id, codigo, nombre, anio, categoria, tope_dj_pct
--     from convocatorias where tope_dj_pct is null order by anio desc, codigo;
--
--   update convocatorias set tope_dj_pct = 10 where codigo = 'C-0XX';
--   update convocatorias set tope_dj_pct = 25 where codigo = 'C-0XX';  -- cine indígena
--
-- Y si el acta de una postulación dice otra cosa que sus bases, manda el acta:
--
--   update postulaciones set tope_dj_pct = 10 where codigo = 'PO-0XX';
