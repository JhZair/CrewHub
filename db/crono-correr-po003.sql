-- ============================================================
--  db/crono-correr-po003.sql — CORRER EL CRONOGRAMA 10 DIAS
--  PO-003 · Chaccu: Entre Lana y Tradicion en Pomacanchi · 2024
--
--  El cronograma vivo empezaba el 01/09/2024, diez dias ANTES de que entrara
--  el dinero. El desembolso esta comprobado en el estado de cuenta del BCP:
--  S/ 200,000.00 el 11/09/2024, por ventanilla, origen Banco de la Nacion.
--  Se desplazan las 18 actividades +10 dias, inicio y fin.
--
--      antes:  01/09/2024 -> 30/09/2025
--      ahora:  11/09/2024 -> 10/10/2025
--
--  ── LO QUE ESTO DEJA FUERA DE PLAZO, DICHO AQUI ──
--  El plazo maximo del acta 042-2024-DAFO vencia el 11/09/2025 (desembolso
--  + un anio, clausula 7.2). Corrido diez dias, el cronograma TERMINA EL
--  10/10/2025: veintinueve dias despues. No es un efecto del desplazamiento
--  —ya terminaba el 30/09/2025, diecinueve dias tarde— pero lo agranda.
--  Decision de John, 24/08/2026, sabiendo esto.
--
--  ── Y LO OTRO QUE HAY QUE SABER ──
--  Las 18 actividades estan en FINALIZADA: esto no es un plan por ajustar,
--  es el registro de trabajo que ya ocurrio. Las fechas de los RHE, los
--  comprobantes y los movimientos del banco NO se mueven con este archivo, asi
--  que a partir de aqui el cronograma y los papeles cuentan la misma historia
--  con diez dias de diferencia. Si la rendicion se coteja fecha contra fecha,
--  ahi va a aparecer. Queda anotado, no corregido: la decision es de quien
--  conoce el expediente.
--
--  ── QUE PASA CON LAS VERSIONES ──
--  La foto `Reformulado` de hoy retrata las fechas VIEJAS. Si solo se
--  corrieran las filas, el panel marcaria 18 movidas contra una foto que nadie
--  presento a nadie. Asi que en la misma sentencia:
--    · la `Reformulado` vigente baja a historico (vigente = false),
--    · y entra una nueva, ya con las fechas corridas, como vigente.
--  No se pisa ninguna: quedan las tres, y se puede leer que cambio y por que.
--  La `Postulado` no se toca — es lo que fue a DAFO.
--
--  ── IDEMPOTENTE, Y AQUI IMPORTA MAS QUE NUNCA ──
--  Correr esto dos veces correria el cronograma VEINTE dias, y la segunda
--  pasada no daria ningun error. El seguro es exigir que el inicio siga siendo
--  el 01/09/2024: si ya se corrio, no se encuentra nada y no se toca nada.
--
--  Correr en: Supabase -> SQL Editor. De arriba abajo.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · ANTES — tiene que decir 18 actividades, 2024-09-01 -> 2025-09-30
-- ------------------------------------------------------------
select count(*) as actividades,
       min(ca.fecha_inicio) as desde,
       max(ca.fecha_fin)    as hasta,
       count(*) filter (where ca.fecha_inicio < date '2024-09-11') as empiezan_antes_del_desembolso
  from cronograma_actividades ca
  join postulaciones p on p.id = ca.postulacion_id
 where p.codigo = 'PO-003';

-- ------------------------------------------------------------
-- 2 · CORRER LAS FECHAS + REEMPLAZAR LA VERSION VIGENTE
--     Todo en una sentencia: si el desplazamiento ocurre, la foto nueva entra
--     con el; y si no ocurre, no entra ninguna foto que mienta.
--     La foto se arma con `+ 10` aplicado aqui mismo y no leyendo las filas ya
--     corridas: dentro de una misma sentencia las CTE ven el estado ANTERIOR,
--     asi que leerlas daria la foto vieja otra vez.
-- ------------------------------------------------------------
with po as (
  select id from postulaciones where codigo = 'PO-003'
),
/* El seguro contra la segunda corrida. Sin esto, correrlo dos veces desplaza
   veinte dias en silencio. */
listo as (
  select po.id
    from po
   where (select min(ca.fecha_inicio) from cronograma_actividades ca
           where ca.postulacion_id = po.id) = date '2024-09-01'
),
nueva_foto as (
  select listo.id as pid,
         jsonb_agg(
           jsonb_build_object(
             'nombre',       ca.nombre,
             'etapa',        ca.etapa,
             'fecha_inicio', ca.fecha_inicio + 10,
             'fecha_fin',    ca.fecha_fin + 10,
             'responsable',  coalesce(pe.alias, pe.nombre, pf.nombre),
             'descripcion',  ca.descripcion)
           order by ca.etapa, ca.orden, ca.fecha_inicio, ca.creado_en) as datos
    from cronograma_actividades ca
    join listo on ca.postulacion_id = listo.id
    left join personas pe on pe.id = ca.responsable_persona
    left join perfiles pf on pf.id = ca.responsable
   where ca.estado <> 'cancelada' and ca.fecha_inicio is not null
   group by listo.id
),
-- La vigente de ahora baja a historico. Va antes del insert por el indice
-- unico `uq_version_vigente`: no puede haber dos vigentes del mismo tipo.
bajada as (
  update version_fondo v
     set vigente = false
    from nueva_foto
   where v.postulacion_id = nueva_foto.pid
     and v.tipo = 'cronograma' and v.vigente
  returning v.id
),
guardada as (
  insert into version_fondo (postulacion_id, tipo, etiqueta, motivo, datos, vigente)
  select nueva_foto.pid, 'cronograma', 'Reformulado',
         'Mismo cronograma de ejecucion, corrido +10 dias: empezaba el '
         '01/09/2024, antes de que entrara el dinero. El desembolso esta '
         'comprobado en el estado de cuenta del BCP (S/ 200,000.00 el '
         '11/09/2024). Ahora va del 11/09/2024 al 10/10/2025. La version '
         'anterior queda en el historial con las fechas viejas.',
         nueva_foto.datos, true
    from nueva_foto
   where nueva_foto.datos is not null
     and exists (select 1 from bajada)
  returning id
)
update cronograma_actividades ca
   set fecha_inicio = ca.fecha_inicio + 10,
       fecha_fin    = case when ca.fecha_fin is null then null else ca.fecha_fin + 10 end
  from listo
 where ca.postulacion_id = listo.id
   and exists (select 1 from guardada);

-- ------------------------------------------------------------
-- 3 · VERIFICAR — 18 actividades, 2024-09-11 -> 2025-10-10,
--     y 0 que empiecen antes del desembolso
-- ------------------------------------------------------------
select count(*) as actividades,
       min(ca.fecha_inicio) as desde,
       max(ca.fecha_fin)    as hasta,
       count(*) filter (where ca.fecha_inicio < date '2024-09-11') as empiezan_antes_del_desembolso,
       max(ca.fecha_fin) - date '2025-09-11' as dias_despues_del_plazo
  from cronograma_actividades ca
  join postulaciones p on p.id = ca.postulacion_id
 where p.codigo = 'PO-003';

-- Las tres versiones: Postulado y la Reformulado vieja en historico, y la
-- Reformulado corrida como vigente.
select v.etiqueta, v.vigente, jsonb_array_length(v.datos) as actividades,
       (select min((e->>'fecha_inicio')::date) from jsonb_array_elements(v.datos) e) as desde,
       (select max((e->>'fecha_fin')::date)    from jsonb_array_elements(v.datos) e) as hasta,
       v.creado_en
  from version_fondo v
  join postulaciones p on p.id = v.postulacion_id
 where p.codigo = 'PO-003' and v.tipo = 'cronograma'
 order by v.creado_en;
