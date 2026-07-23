-- ============================================================
--  RENDICIÓN DEL FONDO — la parte financiera de un proyecto ganador
--
--  Hasta hoy, la plata de un fondo ganado vivía como CABECERA: monto
--  adjudicado, fechas, «entregado sí/no». Nada de lo que pasó DENTRO —lo que
--  se pagó, contra qué rubro, en qué banco— existía en el sistema. Esta
--  migración abre tres huecos, en el orden que el PLAN fija:
--
--    1) fecha_desembolso  → el dato que faltaba. El plazo de 2 años (acta 7.2)
--       y toda la rendición cuentan DESDE que el dinero llega a la cuenta, no
--       desde la firma del acta. Sin esta fecha se medía desde el punto
--       equivocado.
--
--    2) estado_cuenta     → el estado emitido por el banco, un PDF por mes.
--       Es referencia, no contabilidad línea a línea. Trae dos cosas que DAFO
--       pide: el saldo al cierre y los INTERESES generados (la plata en el
--       banco rinde y hay que declararlo; no se calcula, se copia al rendir).
--
--    3) rhe + dos ejes    → un RHE girado ya es «un dato, tres usos»: gasto de
--       personal, comprobante de rendición, y consumo del tope de 4ta. Le
--       faltaban los dos ejes de todo gasto: su RUBRO (para el presupuesto) y
--       su ACTIVIDAD del cronograma (para el informe económico, máx. 6). Sin
--       ellos, dos años después alguien reparte los gastos a mano — ese
--       reparto es el dolor, y anotarlos al momento lo evita.
--
--  Idempotente y sin transacción externa (pgBouncer): todo `if not exists`.
-- ============================================================

-- ── 1) El dato que faltaba ──────────────────────────────────
alter table postulaciones add column if not exists fecha_desembolso date;

comment on column postulaciones.fecha_desembolso is
  'Cuándo el estímulo llegó a la cuenta del banco. El plazo de ejecución (2 años, acta 7.2) se cuenta DESDE aquí, no desde la firma del acta. Todo lo de la rendición cuelga de esta fecha.';

-- ── 2) Estados de cuenta del banco, uno por mes ─────────────
create table if not exists estado_cuenta (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  periodo        date not null,             -- primer día del mes que cubre
  url            text,                       -- el PDF emitido por el banco
  saldo          numeric(12,2),             -- saldo al cierre del periodo
  intereses      numeric(12,2) default 0,   -- intereses generados en el mes
  nota           text,
  creado_en      timestamptz default now(),
  creado_por     uuid references perfiles(id),
  unique (postulacion_id, periodo)          -- un estado por fondo y por mes
);

create index if not exists idx_estcta_post on estado_cuenta(postulacion_id, periodo);

alter table estado_cuenta enable row level security;
drop policy if exists "leer_estcta"   on estado_cuenta;
drop policy if exists "crear_estcta"  on estado_cuenta;
drop policy if exists "editar_estcta" on estado_cuenta;
drop policy if exists "borrar_estcta" on estado_cuenta;
create policy "leer_estcta"   on estado_cuenta for select to authenticated using (true);
create policy "crear_estcta"  on estado_cuenta for insert to authenticated with check (true);
create policy "editar_estcta" on estado_cuenta for update to authenticated using (true);
create policy "borrar_estcta" on estado_cuenta for delete to authenticated using (true);

-- ── 3) Los dos ejes de cada RHE ─────────────────────────────
--  postulacion_id: a QUÉ fondo se le carga este pago (antes solo había
--    proyecto_id, que no distingue entre el fondo ganado y el proyecto).
--  actividad_id:   la actividad del cronograma que paga (eje del informe
--    económico). Es una HIPÓTESIS que se corrige: on delete set null, para
--    que borrar una actividad no borre el RHE.
--  rubro_item:     el id del ítem del presupuesto (jsonb) contra el que va el
--    gasto. Texto, no FK: los ítems viven dentro de postulaciones.presupuesto.
alter table rhe add column if not exists postulacion_id uuid references postulaciones(id) on delete set null;
alter table rhe add column if not exists actividad_id   uuid references cronograma_actividades(id) on delete set null;
alter table rhe add column if not exists rubro_item     text;

create index if not exists idx_rhe_postulacion on rhe(postulacion_id);
create index if not exists idx_rhe_actividad   on rhe(actividad_id);

comment on column rhe.postulacion_id is 'El fondo ganador al que se carga este pago. Es el eje que ata el RHE a la rendición.';
comment on column rhe.actividad_id   is 'La actividad del cronograma que este pago financia (eje del informe económico, máx. 6). Hipótesis corregible.';
comment on column rhe.rubro_item     is 'Id del ítem del presupuesto (postulaciones.presupuesto→items[].id) contra el que va el gasto.';

-- 👀 Los fondos en ejecución y qué les falta para poder rendir.
select coalesce(pr.nombre, p.codigo, 'sin nombre') as fondo,
       p.monto_adjudicado,
       p.fecha_desembolso,
       case when p.fecha_desembolso is null then '⚠ falta fecha de desembolso — el plazo no se puede contar'
            else '✅ con desembolso' end as situacion,
       (select count(*) from estado_cuenta ec where ec.postulacion_id = p.id) as estados_cargados,
       (select count(*) from rhe r where r.postulacion_id = p.id)             as rhe_del_fondo
  from postulaciones p
  left join proyectos pr on pr.id = p.proyecto_id
 where p.estado = 'ganadora' and p.fecha_rendicion_real is null
 order by p.fecha_desembolso nulls first;
