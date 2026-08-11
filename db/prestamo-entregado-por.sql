-- ============================================================
--  db/prestamo-entregado-por.sql
--
--  QUIÉN ENTREGÓ.
--
--  El préstamo decía a quién sale, para qué proyecto, desde cuándo y de
--  qué kit. No decía quién lo dio. Y esa es la mitad que falta cuando
--  algo no cuadra: «la cámara no está y KatyP dice que no se la
--  llevó» — con quién entregó hay a quién preguntar; sin él, el
--  registro apunta a una sola persona y esa es justamente la que dice
--  que no.
--
--  No es para culpar a nadie: es que una entrega la hacen DOS, y hasta
--  ahora solo se guardaba una.
--
--  Apunta a `perfiles` (quien usa el sistema) y no a `personas` (quien
--  puede recibir un equipo aunque no tenga cuenta): quien entrega
--  siempre está logueado, porque la entrega se registra desde aquí.
--
--  `on delete set null`: si un perfil se va, el préstamo no se borra.
--  Se pierde el nombre, no el hecho.
--
--  Idempotente. Los préstamos anteriores se quedan en null y la
--  pantalla lo dice —«no se registró»— en vez de inventarse un nombre.
-- ============================================================

alter table equipo_prestamos add column if not exists entregado_por uuid
  references perfiles(id) on delete set null;

create index if not exists idx_prestamos_entregado_por
  on equipo_prestamos(entregado_por);

-- ── COMPROBAR: tiene que decir «si» ──
select 'equipo_prestamos.entregado_por' as columna,
       case when count(*) = 1 then 'si' else 'NO — algo falló' end as existe
from information_schema.columns
where table_name = 'equipo_prestamos' and column_name = 'entregado_por';

-- Cuántos préstamos abiertos se quedan sin ese dato (es normal: son los
-- de antes de este cambio; los nuevos lo traen solo).
select count(*) as abiertos_sin_quien_entrego
from equipo_prestamos
where hasta is null and entregado_por is null;
