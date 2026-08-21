-- ============================================================
--  db/obligacion-indices.sql — EL ÍNDICE QUE FALTABA
--
--  Al aligerar /obligaciones, las consultas de esa pantalla cambiaron de
--  forma: ya no preguntan «¿cuáles de estos seiscientos periodos tienen caso?»
--  con la lista entera de identificadores, sino «¿qué periodos tienen caso?».
--  Es mucho más barato de pedir, pero sin índice obliga a recorrer la tabla.
--
--  Las otras cinco tablas de la rendición ya tenían el suyo desde
--  db/rendicion-caso.sql; `obligacion_periodo` nació después y se quedó sin él.
--  Es PARCIAL —solo las filas con caso— porque son un puñado entre cientos: un
--  índice completo ocuparía cien veces más para responder lo mismo.
--
--  Correr en Supabase → SQL Editor. Idempotente y sin efectos sobre los datos.
--  ⚠ DESPUÉS de db/obligacion-hilo.sql.
-- ============================================================

create index if not exists idx_oblper_caso
  on obligacion_periodo (caso_id) where caso_id is not null;

-- ── VERIFICAR ──
-- Deben aparecer los tres que usa la pantalla: por obligación, por vencimiento
-- (parcial, para lo no declarado) y este por caso.
select indexname, indexdef
  from pg_indexes
 where tablename = 'obligacion_periodo'
 order by indexname;
