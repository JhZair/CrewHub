-- ============================================================
--  db/asignacion.sql — ASIGNAR NO ES PRESTAR
--
--  Un PRÉSTAMO tiene fecha de vuelta implícita: la cámara sale a un rodaje y
--  regresa. Por eso la ficha dice «5 días sin movimiento» y el kit reclama la
--  pieza que falta.
--
--  Una ASIGNACIÓN no. La interfaz de audio es del puesto de postproducción, la
--  laptop es de Michel, la ropa táctica es de Katy. Que sigan ahí seis meses no
--  es una deuda: es lo correcto. Hasta hoy el sistema solo sabía prestar, así
--  que esos equipos vivían mal de las dos formas posibles:
--    · «disponible», y alguien se los llevaba a un rodaje;
--    · «en uso», y el sistema los trataba como algo que no ha vuelto.
--
--  NO hay tabla nueva. Una asignación ES una custodia —quién lo tiene, desde
--  cuándo, quién se lo dio, qué se comentó— y eso ya es `equipo_prestamos`
--  entero. Lo único que cambia es su NATURALEZA, y eso es una columna. Misma
--  decisión que con los ensamblados: el modelo ya existía, faltaba usarlo.
--
--  Idempotente y sin transacción (pgBouncer). Al final verifica.
-- ============================================================

-- ── 1. La naturaleza de la custodia ──
--    Por defecto 'prestamo': todo lo que ya está registrado ES un préstamo,
--    y así ninguna fila vieja cambia de significado al correr esto.
alter table equipo_prestamos add column if not exists tipo text not null default 'prestamo';

-- El check va aparte y con `not valid` primero para que no falle si alguna
-- fila trae basura; se valida a continuación y ahí sí se ve el problema.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipo_prestamos_tipo_chk') then
    alter table equipo_prestamos
      add constraint equipo_prestamos_tipo_chk check (tipo in ('prestamo','asignacion')) not valid;
    alter table equipo_prestamos validate constraint equipo_prestamos_tipo_chk;
  end if;
end $$;

-- La consulta que más se hace sobre esto: qué tiene cada persona AHORA, y de
-- qué tipo. El índice parcial cubre solo las custodias abiertas, que son las
-- únicas que se listan.
create index if not exists idx_prestamos_tipo_abiertos
  on equipo_prestamos(tipo) where hasta is null;

-- ── 2. VERIFICACIÓN ──
select 'equipo_prestamos.tipo' as que, count(*) as ok
  from information_schema.columns
 where table_name = 'equipo_prestamos' and column_name = 'tipo'
union all
select 'check de tipo', count(*) from pg_constraint
 where conname = 'equipo_prestamos_tipo_chk'
union all
select 'custodias abiertas por tipo — préstamos', count(*)
  from equipo_prestamos where hasta is null and tipo = 'prestamo'
union all
select 'custodias abiertas por tipo — asignaciones', count(*)
  from equipo_prestamos where hasta is null and tipo = 'asignacion';
