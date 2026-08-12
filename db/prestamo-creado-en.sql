-- ============================================================
--  db/prestamo-creado-en.sql — CUÁNDO SE REGISTRÓ, QUE NO ES CUÁNDO SALIÓ
--
--  `equipo_prestamos.desde` es una FECHA suelta: el día en que el equipo sale.
--  Está bien que sea así —una salida a rodaje es de un día, no de una hora—
--  pero deja una pregunta sin respuesta: ¿cuándo se anotó esto?
--
--  Se nota en la ventana «qué hizo esa persona ese día»: veintidós equipos
--  entregados aparecen todos «sin hora», fuera de la barra del día, cuando lo
--  cierto es que alguien los registró de una sentada a una hora concreta y el
--  sistema lo sabía en ese momento — solo que no lo guardaba.
--
--  SIN DEFAULT AL AÑADIRLA, y el default después. Postgres rellena la columna
--  nueva con su default para TODAS las filas existentes, así que un
--  `default now()` de entrada fecharía los préstamos de marzo como si se
--  hubieran registrado hoy. Prefiero que queden en null: «no se sabe» es un
--  dato correcto y «hoy» es uno falso.
--
--  Idempotente y sin transacción (pgBouncer). Al final verifica.
-- ============================================================

alter table equipo_prestamos add column if not exists creado_en timestamptz;
alter table equipo_prestamos alter column creado_en set default now();

-- La consulta que lo usa pregunta por un día concreto de una persona.
create index if not exists idx_prestamos_creado_en on equipo_prestamos(creado_en);

select 'equipo_prestamos.creado_en' as que, count(*) as ok
  from information_schema.columns
 where table_name = 'equipo_prestamos' and column_name = 'creado_en'
union all
select 'prestamos sin registrar cuándo (los de antes)', count(*)
  from equipo_prestamos where creado_en is null;
