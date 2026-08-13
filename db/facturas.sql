-- ============================================================
--  FACTURAS Y BOLETAS — la tercera pata de la rendición
--
--  Se rinde con tres cosas: RHE, declaraciones juradas y COMPROBANTES de
--  proveedor. Las dos primeras ya viven en el sistema; esta faltaba, y su
--  ausencia hacía daño por dos lados a la vez:
--
--   1. La conciliación llamaba «ejecutado» a la suma de RHE. Un fondo donde
--      buena parte del gasto son facturas —alquiler de equipos, hospedaje,
--      combustible, imprenta— se veía al 76% con la plata gastada entera. En
--      Mujunakuy son ~S/ 48,000 sin sitio donde aterrizar.
--
--   2. Y lo peor: sin dónde poner una factura, la salida a mano es meterla
--      como declaración jurada. Eso consume TOPE que no debía consumirse, y el
--      tope es lo que obliga a devolver plata (acta, cláusula 6.9). Un hueco
--      en el sistema no es solo una cosa que falta: es una presión para usar
--      mal la que sí está.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/rhe-permisos.sql: las políticas usan es_finanzas().
-- ============================================================


-- ── 0. LA DEPENDENCIA, ANTES DE TOCAR NADA ──
-- Misma razón que en db/declaraciones-juradas.sql: sin `es_finanzas()` el
-- script se caería a mitad y dejaría la tabla con RLS y sin políticas — un
-- estado que no da error al leer, devuelve cero filas.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'es_finanzas') then
    raise exception 'Falta public.es_finanzas(): corre antes db/rhe-permisos.sql';
  end if;
end $$;


-- ── 1. EL COMPROBANTE ──
--
-- `tipo` en vez de dos tablas: una factura y una boleta se diferencian en para
-- qué sirven ante SUNAT, no en qué datos llevan. Separarlas habría duplicado
-- la pantalla, el formulario y las consultas para distinguir un valor.
create table if not exists comprobante (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,

  tipo           text not null default 'factura'
                 check (tipo in ('factura', 'boleta', 'recibo_servicio', 'otro')),

  -- Quién emitió. El RUC es COLUMNA OBLIGATORIA del informe económico de DAFO,
  -- así que se guarda aparte del nombre: sacarlo después de un texto libre es
  -- justo donde se pierde un dígito, y un RUC con un dígito de menos no falla
  -- —valida como otro RUC, o como ninguno— y el error aparece al rendir.
  proveedor      text not null,
  ruc            text,

  -- Serie y número tal como los imprime SUNAT («F001» · «1234»). Juntos son la
  -- identidad del documento, y por eso el `unique` de abajo: cargar dos veces
  -- la misma factura infla el ejecutado sin que nada avise.
  serie          text,
  numero         text,

  fecha          date not null,
  -- El total es lo que se rinde. El IGV se guarda aparte porque el informe lo
  -- pide desglosado y calcularlo hacia atrás sobre un total redondeado da
  -- céntimos que no cuadran con el papel.
  importe        numeric(12,2) not null check (importe > 0),
  igv            numeric(12,2) default 0 check (igv >= 0),

  concepto       text,
  -- Los mismos dos ejes que `rhe` y `gasto_dj`: la etapa agrupa para el informe
  -- económico y el rubro cuadra contra el presupuesto. Tres tablas, un solo
  -- vocabulario — si cada una nombrara el gasto a su manera, el informe habría
  -- que armarlo traduciendo, y una traducción es donde se pierden datos.
  etapa          text,
  rubro_item     text,

  url            text,   -- el PDF o la foto del comprobante

  creado_en      timestamptz default now(),
  creado_por     uuid references perfiles(id),

  -- El mismo documento no puede entrar dos veces en el mismo fondo: cargar dos
  -- veces la misma factura infla el ejecutado y nada avisaría.
  -- En Postgres dos NULL no chocan entre sí, y aquí eso es justo lo que hace
  -- falta: una boleta manuscrita puede no traer serie ni número, y varias así
  -- tienen que poder convivir. La regla vale para las que sí están numeradas,
  -- que son las que se duplican al teclear.
  unique (postulacion_id, serie, numero)
);

create index if not exists idx_comprobante_post on comprobante(postulacion_id, fecha);

comment on table comprobante is
  'Facturas y boletas de proveedor. La tercera forma de rendir, junto a los RHE y las declaraciones juradas. A diferencia de las DJ, NO tiene tope.';
comment on column comprobante.ruc is
  'RUC del emisor: columna obligatoria del informe económico de DAFO. Se guarda aparte del nombre para no tener que extraerlo de un texto libre al rendir.';


-- ── 2. PERMISOS ──
-- Iguales a los de gasto_dj: leer todo el equipo, escribir administración o
-- finanzas. Aquí tampoco hay puerta de «lo mío»: una factura no es de nadie
-- del equipo, es de un proveedor.
alter table comprobante enable row level security;

drop policy if exists "leer_cmp"   on comprobante;
drop policy if exists "crear_cmp"  on comprobante;
drop policy if exists "editar_cmp" on comprobante;
drop policy if exists "borrar_cmp" on comprobante;

create policy "leer_cmp"   on comprobante for select to authenticated using (true);
create policy "crear_cmp"  on comprobante for insert to authenticated with check (public.es_finanzas());
create policy "editar_cmp" on comprobante for update to authenticated using (public.es_finanzas()) with check (public.es_finanzas());
create policy "borrar_cmp" on comprobante for delete to authenticated using (public.es_finanzas());


-- ── 3. AUDITORÍA ──
-- Es plata: entra al mismo rastro inmutable que rhe, estado_cuenta,
-- movimiento_banco y gasto_dj (db/auditoria-financiera.sql).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'audit_financiera') then
    drop trigger if exists trg_audfin_comprobante on comprobante;
    create trigger trg_audfin_comprobante after insert or update or delete on comprobante
      for each row execute function audit_financiera();
  else
    raise notice 'Sin auditoría en comprobante: falta correr db/auditoria-financiera.sql';
  end if;
end $$;
