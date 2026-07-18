-- ============================================================
-- ARCHIVO: SEPARAR LOS DOS EJES  ·  migración de datos + estructura
--
-- ⚠ SIN TRANSACCIÓN, y a propósito. La primera versión usaba begin…commit,
--   y el editor SQL de Supabase corre sobre pgBouncer en modo transacción:
--   si no se ejecuta `commit;` en la MISMA tanda, al soltar la conexión se
--   revierte todo —incluido el `alter table`—. Pasó: se vio el resultado
--   7/9/2/0/18 dentro de la transacción y luego desapareció, la columna nunca
--   llegó a existir, y las consultas con `.is("archivado_en", null)` daban
--   vacío. Ahora cada statement se auto-commitea al correr. No hace falta
--   escribir COMMIT.
--
-- Es idempotente: se puede correr dos veces sin daño.
--   · el backfill filtra `archivado_en is null` → no repisa
--   · los updates de estado filtran `estado='archivada'`, que desaparece tras
--     el primer paso → la segunda corrida no toca nada
--   El orden importa: sellar la fecha ANTES de cambiar el estado.
--
-- Qué hace y por qué: ver db/archivo-diagnostico.sql. Reparto de las 18:
--     7 avisos          → siguen Vigente (abierta) + archivado_en
--     9 casos «se hizo» → resuelta   + archivado_en
--     2 SUNAT «ya no»   → descartada + archivado_en
--
-- CÓMO CORRERLO: selecciona TODO y ejecuta. Al final, el SELECT de
-- verificación debe decir  vigente 7 · resuelta 9 · descartada 2 ·
-- quedan_archivada 0 · total 18. Si cuadra, terminaste (ya está commiteado).
-- ============================================================


-- 1 ▸ LA COLUMNA (idempotente) ------------------------------
alter table publicaciones
  add column if not exists archivado_en timestamptz;

comment on column publicaciones.archivado_en is
  'Cuándo se sacó de la vista. null = a la vista. La fecha es la real del '
  'archivo (de la bitácora), no la de esta migración: el archivo conserva su '
  'cronología, que es lo que lo hace memoria y no un cajón.';


-- 2 ▸ SELLAR LA FECHA REAL — antes de tocar `estado` --------
update publicaciones p
set archivado_en = (
  select act.creado_en
  from actividad act
  where act.entidad_tipo = 'publicacion'
    and act.entidad_id   = p.id
    and act.tipo         = 'estado'
    and act.detalle->>'a' = 'archivada'
  order by act.creado_en desc
  limit 1
)
where p.estado = 'archivada'
  and p.archivado_en is null;


-- 3 ▸ RECLASIFICAR `estado` (el orden importa) --------------

-- 3a · AVISOS → Vigente (un aviso no se resuelve ni se descarta; se leyó).
update publicaciones
set estado = 'abierta'
where estado = 'archivada' and tipo = 'aviso';

-- 3b · LOS DOS SUNAT que ya no aplicaban → descartada. VA ANTES que 3c.
update publicaciones
set estado = 'descartada'
where estado = 'archivada' and tipo <> 'aviso'
  and (titulo like '%SUNAT: A-iCr3a%' or titulo like '%SUNAT: AsocHuaynasP%');

-- 3c · EL RESTO de los casos → resuelta (se hicieron).
update publicaciones
set estado = 'resuelta'
where estado = 'archivada' and tipo <> 'aviso';


-- 4 ▸ VERIFICACIÓN ------------------------------------------
-- Esperado:  vigente 7 · resuelta 9 · descartada 2 · quedan 0 · total 18
select
  count(*) filter (where estado = 'abierta'    and archivado_en is not null) as vigente_arch,
  count(*) filter (where estado = 'resuelta'   and archivado_en is not null) as resuelta_arch,
  count(*) filter (where estado = 'descartada')                              as descartada,
  count(*) filter (where estado = 'archivada')                               as quedan_archivada,
  count(*) filter (where archivado_en is not null)                           as total_archivado
from publicaciones;
