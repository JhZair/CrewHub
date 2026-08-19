-- ============================================================
--  db/rendicion-caso.sql — ABRIR UN CASO DESDE UNA FILA DE LA RENDICIÓN
--
--  Comentar y reaccionar ya están en las cinco tablas del dinero. Falta la
--  tercera cosa que se hace mirando una fila: decidir que alguien se ocupe.
--
--  ── UN COMENTARIO NO ES UNA TAREA ──
--  Y esa es toda la razón de esta columna. En el hilo del RHE E001-5 alguien
--  escribió que Dahira no giró su recibo, que se prestó de otra persona. Eso
--  es una observación grave para la rendición, y como comentario se queda ahí:
--  sin responsable, sin plazo, y sin aparecer en ningún tablero. A los tres
--  meses nadie recuerda que estaba pendiente.
--  El caso es la decisión de ocuparse AHORA, con responsable y fecha. Lo toma
--  una persona, no el sistema — por eso es un botón y no algo automático.
--
--  Misma solución que `compromiso_acta.caso_id` (db/compromiso-acta.sql), y
--  por el mismo motivo técnico: sin esta columna, el segundo clic en «＋ caso»
--  abre un caso gemelo y el tablero se llena de pares.
--
--  `on delete set null`: borrar el caso NO borra la fila. La factura sigue
--  existiendo; lo que desaparece es la decisión de atenderla.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/facturas.sql, db/rendicion-fondo.sql,
--    db/declaraciones-juradas.sql y db/movimiento-banco.sql.
-- ============================================================

do $$
declare falta text;
begin
  select string_agg(t, ', ') into falta
    from unnest(array['comprobante','estado_cuenta','rhe','gasto_dj','movimiento_banco']) t
   where to_regclass('public.' || t) is null;
  if falta is not null then
    raise exception 'Faltan tablas de la rendición: %', falta;
  end if;
end $$;

alter table comprobante       add column if not exists caso_id uuid references publicaciones(id) on delete set null;
alter table estado_cuenta     add column if not exists caso_id uuid references publicaciones(id) on delete set null;
alter table rhe               add column if not exists caso_id uuid references publicaciones(id) on delete set null;
alter table gasto_dj          add column if not exists caso_id uuid references publicaciones(id) on delete set null;
alter table movimiento_banco  add column if not exists caso_id uuid references publicaciones(id) on delete set null;

/* Índices parciales: solo unas pocas filas tendrán caso, y un índice completo
   sobre cinco tablas para encontrar esas pocas es pagar de más. */
create index if not exists idx_cmp_caso     on comprobante(caso_id)      where caso_id is not null;
create index if not exists idx_estcta_caso  on estado_cuenta(caso_id)    where caso_id is not null;
create index if not exists idx_rhe_caso     on rhe(caso_id)              where caso_id is not null;
create index if not exists idx_gdj_caso     on gasto_dj(caso_id)         where caso_id is not null;
create index if not exists idx_movbco_caso  on movimiento_banco(caso_id) where caso_id is not null;

comment on column comprobante.caso_id is
  'El caso abierto desde esta factura. Un comprobante no es una tarea —existe aunque nadie se ocupe—; el caso es la decisión de ocuparse, con responsable y plazo.';
comment on column rhe.caso_id is
  'El caso abierto desde este recibo: una observación que hay que resolver antes de rendir.';


-- ── VERIFICAR ──
-- Las cinco columnas. Debe dar 5.
select count(*) as columnas
  from information_schema.columns
 where table_schema = 'public' and column_name = 'caso_id'
   and table_name in ('comprobante','estado_cuenta','rhe','gasto_dj','movimiento_banco');
