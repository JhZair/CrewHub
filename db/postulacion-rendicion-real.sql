-- ============================================================
--  Cuándo se entregó la rendición — el dato que nadie puede deducir
--
--  La regla decía: «ganadora sigue ejecutando mientras no venza su rendición».
--
--    const ejecutando = (p) => {
--      if (p.estado !== "ganadora") return false;
--      const f = p.fecha_prorroga || p.fecha_limite_rendicion;
--      return !!f && diasDesde(f) <= 0;
--    };
--
--  Dos agujeros, y los dos dejaban pasar justo lo que había que frenar:
--
--  1. Sin fecha de límite no hay `f`, así que no está ejecutando. Una empresa
--     que ganó S/ 200,000 y a la que nadie le cargó el plazo salía «libre
--     para postular». El hueco de un dato se leía como una vía libre.
--
--  2. Con la fecha vencida se daba por cerrada. Pero el sistema nunca
--     registró que la rendición se entregara, así que «vencida» significaba
--     dos cosas opuestas —entregada, o debiéndola— y el código elegía la
--     optimista. Una empresa que le debe una rendición a DAFO es justo la
--     que no puede postular.
--
--  Ninguna regla podía distinguir esos casos: falta el hecho, no la lógica.
--  Este es el hecho.
-- ============================================================

alter table postulaciones add column if not exists fecha_rendicion_real date;

comment on column postulaciones.fecha_rendicion_real is
  'Cuándo se entregó la rendición de verdad. Mientras esté vacía, la ganadora se considera ejecutando y su empresa no aparece libre para postular. `fecha_limite_rendicion` es el plazo (lo que DAFO pide); esta es la entrega (lo que pasó).';

-- 👀 Las ganadoras y su situación real. Las que salen 🔴 son las que la
--    regla vieja daba por cerradas.
select coalesce(pr.nombre, p.codigo, 'sin nombre') as postulacion,
       e.nombre                                    as empresa,
       p.monto_adjudicado,
       coalesce(p.fecha_prorroga, p.fecha_limite_rendicion) as plazo,
       p.fecha_rendicion_real                      as entregada,
       case
         when p.fecha_rendicion_real is not null then '✅ entregada — la empresa queda libre'
         when coalesce(p.fecha_prorroga, p.fecha_limite_rendicion) is null
           then '👻 sin plazo cargado — la regla vieja la daba por libre'
         when coalesce(p.fecha_prorroga, p.fecha_limite_rendicion) < current_date
           then '🔴 plazo vencido y sin entrega registrada'
         else    '🎬 ejecutando, en plazo'
       end                                         as situacion
  from postulaciones p
  left join empresas e   on e.id = p.empresa_id
  left join proyectos pr on pr.id = p.proyecto_id
 where p.estado = 'ganadora'
 order by p.fecha_rendicion_real nulls first,
          coalesce(p.fecha_prorroga, p.fecha_limite_rendicion) nulls first;

-- ✅ Si alguna de esas ya se entregó, ponle su fecha. Ejemplo:
-- update postulaciones set fecha_rendicion_real = '2025-03-14'
--  where codigo = 'P-0XX';
