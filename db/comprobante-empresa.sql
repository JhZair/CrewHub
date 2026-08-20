-- ============================================================
--  db/comprobante-empresa.sql — UNA FACTURA ES DE LA EMPRESA, NO DEL FONDO
--
--  `comprobante` nació dentro de la rendición de un fondo, y por eso
--  `postulacion_id` era NOT NULL: una factura solo podía existir colgando de
--  una postulación. Fue correcto mientras la única plata que se registraba era
--  la de DAFO. Dejó de serlo el día que se miró el IGV.
--
--  ── LO QUE DESTAPÓ EL IGV ──
--  El resultado mensual de una empresa es `IGV de ventas − IGV de compras`, y
--  se comprobó contra la contabilidad real del equipo: abril 2025, egresos de
--  S/ 7,588.61 → crédito de S/ 1,157.58, que es exactamente la factura de la
--  PC de edición del fondo PO-003. La regla funciona; lo que no funcionaba era
--  el modelo:
--
--   · Las compras de la empresa que NO son de un fondo no tenían dónde vivir.
--   · No existían las facturas de VENTA, así que el débito no era calculable.
--   · `unique (postulacion_id, serie, numero)` permitía la MISMA factura en
--     dos fondos. Ante SUNAT eso es imposible: una factura es un hecho único.
--
--  ── EL CAMBIO, EN UNA FRASE ──
--  Una factura pertenece a una EMPRESA, tiene fecha e IGV, y OPCIONALMENTE se
--  imputa a un fondo y a un rubro. El fondo es el destino del gasto, no su
--  dueño. Modelarlo al revés obligaba a inventar un fondo para poder anotar
--  una compra de la asociación — o a no anotarla, que es lo que pasó.
--
--  ── NO SE PIERDE NADA ──
--  `empresa_id` se rellena de la postulación de cada comprobante, que es de
--  dónde salía la empresa igualmente. Ningún dato se teclea otra vez y la
--  pantalla del fondo sigue viendo lo mismo: filtra por `postulacion_id`, que
--  sigue ahí.
--
--  Idempotente. Al final verifica.
-- ============================================================

-- ── 1 · DE QUÉ EMPRESA ES ──
alter table comprobante add column if not exists empresa_id uuid references empresas(id);

/* Rellenar desde la postulación. Se hace ANTES de aflojar el NOT NULL para que
   no pueda quedar ninguno huérfano por el camino. */
update comprobante c
   set empresa_id = p.empresa_id
  from postulaciones p
 where c.postulacion_id = p.id
   and c.empresa_id is null;

/* ── 2 · COMPRA O VENTA ──
   Sin esto el IGV no se puede sumar: el de una compra es CRÉDITO y el de una
   venta es DÉBITO, y sumarlos juntos daría un número sin significado. Todo lo
   que hay hoy es compra —la rendición de un fondo solo registra gastos—, así
   que el `default` es correcto para el histórico y para lo que más se teclea. */
alter table comprobante add column if not exists sentido text not null default 'compra';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comprobante_sentido_chk') then
    alter table comprobante add constraint comprobante_sentido_chk
      check (sentido in ('compra', 'venta'));
  end if;
end $$;

/* ── 3 · EL FONDO PASA A SER OPCIONAL ──
   Es el cambio de fondo. Una compra de la asociación con plata propia no tiene
   postulación, y hasta hoy eso la dejaba fuera del sistema. */
alter table comprobante alter column postulacion_id drop not null;

-- Y ahora sí, la empresa es obligatoria: toda factura es de alguien.
do $$ begin
  if exists (select 1 from comprobante where empresa_id is null) then
    raise exception 'Hay % comprobantes sin empresa. Revísalos antes de seguir.',
      (select count(*) from comprobante where empresa_id is null);
  end if;
end $$;
alter table comprobante alter column empresa_id set not null;

/* ── 4 · LA UNICIDAD, COMO LA ENTIENDE SUNAT ──
   Era (postulación, serie, número): la misma factura podía repetirse en dos
   fondos, y una compra sin fondo no chocaba con nada.
   La regla real: para una COMPRA, el par (serie, número) es único por EMISOR
   —dos proveedores distintos pueden tener ambos una F001-000123—; para una
   VENTA, lo es por la empresa que la emite.
   `coalesce(ruc,'')` porque hay comprobantes cargados sin RUC del proveedor: sin
   el coalesce, el índice los ignoraría —los NULL no chocan entre sí— y dejaría
   de proteger justo a los peor cargados. Y el índice es PARCIAL: un
   comprobante sin serie o sin número no puede compararse con nada, y exigirle
   unicidad impediría anotar el ticket que llegó sin numerar. */
drop index if exists uq_comprobante_doc;
alter table comprobante drop constraint if exists comprobante_postulacion_id_serie_numero_key;
create unique index if not exists uq_comprobante_doc
  on comprobante (empresa_id, sentido, coalesce(ruc, ''), serie, numero)
  where serie is not null and numero is not null;

create index if not exists idx_comprobante_emp_fecha on comprobante (empresa_id, fecha);
/* Para las obligaciones: sumar el IGV de un mes es la consulta que se hace
   doce veces por pantalla. */
create index if not exists idx_comprobante_periodo
  on comprobante (empresa_id, sentido, fecha);

-- ── VERIFICAR ──
select count(*) as comprobantes,
       count(*) filter (where empresa_id is not null) as con_empresa,
       count(*) filter (where postulacion_id is null) as sin_fondo,
       count(*) filter (where sentido = 'compra') as compras,
       count(*) filter (where sentido = 'venta')  as ventas
  from comprobante;

/* El IGV que ya se puede calcular con lo que hay cargado. Para Apu Wilkakalle
   debería salir crédito 1,157.58 en abril de 2025 — el mismo número que tiene
   la contabilidad del equipo en su tabla vieja. Si no coincide, algo de lo de
   arriba se aplicó mal. */
select e.nombre,
       extract(year from c.fecha)::int  as anio,
       extract(month from c.fecha)::int as mes,
       sum(c.igv) filter (where c.sentido = 'venta')  as debito,
       sum(c.igv) filter (where c.sentido = 'compra') as credito,
       coalesce(sum(c.igv) filter (where c.sentido = 'venta'), 0)
         - coalesce(sum(c.igv) filter (where c.sentido = 'compra'), 0) as a_pagar
  from comprobante c join empresas e on e.id = c.empresa_id
 group by 1, 2, 3
 having coalesce(sum(c.igv), 0) <> 0
 order by 1, 2, 3;
