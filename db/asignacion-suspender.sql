-- ============================================================
--  db/asignacion-suspender.sql — UNA ASIGNACIÓN NO SE PIERDE POR SALIR
--
--  Continúa db/asignacion.sql, que trajo la columna `tipo`. Aquí se arreglan
--  las dos cosas que quedaron sin resolver y que el uso diario destapó.
--
--  ── 1. EL EQUIPO ASIGNADO QUE SALE A UN RODAJE ──
--  La laptop es de Michel. Un martes hace falta para una salida. Hasta hoy el
--  único camino era QUITARLE la asignación, prestarla, y al devolverla el
--  equipo volvía a «disponible»: la asignación se había perdido y nadie la
--  restauraba. Michel se quedaba sin laptop en el sistema, y el sistema sin
--  saber de quién era.
--
--  La custodia se SUSPENDE, no se borra. Se cierra la asignación con
--  `motivo_fin = 'prestado'` —o sea, «esto no terminó, se apartó»— y la fila
--  del PRÉSTAMO guarda en `reanuda_id` a cuál hay que volver. Al devolver, esa
--  asignación se reabre.
--
--  ⚠ Se cierra y se reabre en vez de dejar DOS custodias abiertas a la vez.
--  Todo el código de hoy —el inventario, los kits, los combos, la ficha de la
--  persona, quién-tiene-qué— da por hecho que un equipo tiene como mucho una
--  fila con `hasta is null`, y no hay ninguna restricción en la base que lo
--  garantice: lo sostiene la aplicación cerrando antes de insertar. Meter una
--  segunda custodia abierta rompería esa suposición en una docena de sitios a
--  la vez, y en silencio.
--  La consecuencia es que el histórico dice la verdad de otra manera: la
--  asignación reabierta conserva su `desde` original —Michel la tiene desde
--  marzo, sin interrupción— y el paréntesis del rodaje queda contado en la
--  fila del préstamo, que es donde pasó.
--
--  ── 2. POR QUÉ TERMINÓ ──
--  Quitar una asignación no dejaba rastro. Se leía después como «↩ Devolvió»,
--  igual que un préstamo, y no aparecía en ninguna actividad. El día que
--  alguien pregunta «¿y la cámara de Fulano?» no había nada que mirar.
--  `motivo_fin` distingue las cuatro razones por las que una asignación
--  termina de verdad —y la quinta, `prestado`, que es la que NO termina.
--
--  Idempotente y sin transacción (pgBouncer). Al final verifica.
-- ============================================================

-- ── 1. POR QUÉ SE CERRÓ ──
--    Nullable a propósito y sin defecto: las filas viejas —y todos los
--    préstamos normales, que se cierran devolviendo— no tienen por qué
--    inventarse un motivo. `null` aquí significa «una devolución corriente»,
--    que es lo que era antes de existir esta columna.
alter table equipo_prestamos add column if not exists motivo_fin text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipo_prestamos_motivo_fin_chk') then
    alter table equipo_prestamos
      add constraint equipo_prestamos_motivo_fin_chk
      check (motivo_fin is null or motivo_fin in
             ('prestado','se_fue','reasignado','baja','malogrado')) not valid;
    alter table equipo_prestamos validate constraint equipo_prestamos_motivo_fin_chk;
  end if;
end $$;

-- ── 2. A QUÉ CUSTODIA HAY QUE VOLVER ──
--    Va en la fila del PRÉSTAMO, no en la de la asignación, y apunta hacia
--    atrás: «cuando yo termine, reabre a aquella». Puesto al revés —un
--    `suspendida_por` en la asignación— habría que limpiarlo al devolver, y un
--    puntero que hay que acordarse de borrar es un puntero que algún día
--    apunta a algo que ya pasó.
--
--    `on delete set null`: si alguien borra la asignación a mano, el préstamo
--    sigue siendo un préstamo válido. Simplemente no habrá a dónde volver, y
--    eso es preferible a que la fila del préstamo desaparezca con ella.
alter table equipo_prestamos add column if not exists reanuda_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipo_prestamos_reanuda_fk') then
    alter table equipo_prestamos
      add constraint equipo_prestamos_reanuda_fk
      foreign key (reanuda_id) references equipo_prestamos(id) on delete set null;
  end if;
end $$;

-- Se consulta al DEVOLVER: «este préstamo que cierro, ¿reanuda algo?». Son
-- pocas filas y siempre por id, así que el índice es parcial: solo las que
-- llevan puntero.
create index if not exists idx_prestamos_reanuda
  on equipo_prestamos(reanuda_id) where reanuda_id is not null;

-- (Aquí iba un índice por `persona_id where hasta is null and tipo='asignacion'`.
--  Se quitó antes de correrlo: NINGUNA consulta del repositorio lo puede usar.
--  La pantalla nueva pide todas las custodias abiertas sin filtrar por tipo, y
--  la ficha de la persona filtra por persona y por `hasta` pero tampoco por
--  tipo. Y lo que quedaba lo cubre ya `idx_prestamos_tipo_abiertos`, de
--  db/asignacion.sql. Un índice que nadie usa se paga en cada escritura.)

-- ── 3. VERIFICACIÓN ──
select 'equipo_prestamos.motivo_fin' as que, count(*) as ok
  from information_schema.columns
 where table_name = 'equipo_prestamos' and column_name = 'motivo_fin'
union all
select 'equipo_prestamos.reanuda_id', count(*)
  from information_schema.columns
 where table_name = 'equipo_prestamos' and column_name = 'reanuda_id'
union all
select 'check de motivo_fin', count(*) from pg_constraint
 where conname = 'equipo_prestamos_motivo_fin_chk'
union all
select 'fk de reanuda_id', count(*) from pg_constraint
 where conname = 'equipo_prestamos_reanuda_fk'
union all
-- ⚠ «abiertas», no «vivas». La cabecera de este mismo fichero declara que las
-- vivas son estas MÁS las apartadas por un rodaje, que están cerradas: llamar
-- «vivas» a esta cuenta sería repetir aquí el error que el fichero viene a
-- corregir, y en el único sitio donde se va a comprobar a mano.
select 'asignaciones abiertas (sin las apartadas)', count(*)
  from equipo_prestamos where hasta is null and tipo = 'asignacion'
union all
select 'asignaciones suspendidas por un prestamo abierto', count(*)
  from equipo_prestamos p
 where p.tipo = 'prestamo' and p.hasta is null and p.reanuda_id is not null
union all
-- Esta tiene que dar CERO. Si no, hay un equipo con dos custodias abiertas y
-- media aplicación va a enseñar la que no es.
select '⚠ equipos con MAS de una custodia abierta (debe ser 0)', count(*)
  from (select equipamiento_id from equipo_prestamos
         where hasta is null group by equipamiento_id having count(*) > 1) d
union all
-- Y esta también. Una asignación cerrada con `motivo_fin = 'prestado'` dice
-- «esto no terminó, se apartó», así que TIENE que haber un préstamo abierto
-- que la apunte. Sin él es una asignación huérfana: no está viva —no sale en
-- ninguna pantalla, no la cuenta ninguna pestaña— y tampoco terminó, así que
-- nadie la va a cerrar nunca. Es el único estado del que no se sale solo, y
-- sin esta línea no hay forma de descubrirlo.
select '⚠ asignaciones apartadas SIN prestamo que las devuelva (debe ser 0)', count(*)
  from equipo_prestamos a
 where a.tipo = 'asignacion' and a.motivo_fin = 'prestado'
   and not exists (select 1 from equipo_prestamos p
                    where p.reanuda_id = a.id and p.hasta is null);
