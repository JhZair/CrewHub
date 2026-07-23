-- ============================================================
--  Mujunakuy (PO-005) — Cronograma de ejecución (20 actividades)
--  Extraído del Gantt de postulación, ANCLADO al desembolso (20/10/2023):
--  arranca cuando llegó el dinero y corre hasta jun-2024. Fechas editables
--  en la ficha. Idempotente: no re-inserta una actividad ya cargada.
-- ============================================================
with f as (select id from postulaciones where codigo='PO-005' limit 1)
insert into cronograma_actividades (postulacion_id, etapa, nombre, fecha_inicio, fecha_fin, orden, estado)
select f.id, d.etapa, d.nombre, d.fi, d.ff, d.orden, 'planificada'
from f cross join (values
  ('preproduccion', 'Investigación y desarrollo de la idea', '2023-10-20'::date, '2023-11-03'::date, 0),
  ('preproduccion', 'Planificación de logística', '2023-11-01'::date, '2023-11-10'::date, 1),
  ('preproduccion', 'Diseño de producción', '2023-11-06'::date, '2023-11-17'::date, 2),
  ('preproduccion', 'Capacitación de equipo técnico - Rodaje', '2023-11-06'::date, '2023-12-29'::date, 3),
  ('preproduccion', 'Capacitación de equipo técnico - Edición', '2023-11-13'::date, '2024-01-05'::date, 4),
  ('preproduccion', 'Selección de Talento', '2024-01-08'::date, '2024-01-19'::date, 5),
  ('preproduccion', 'Plan de Rodaje - Guión de Intenciones', '2024-01-15'::date, '2024-01-26'::date, 6),
  ('produccion', 'Preparación técnica', '2024-01-29'::date, '2024-02-02'::date, 7),
  ('produccion', 'Rodaje', '2024-02-01'::date, '2024-02-09'::date, 8),
  ('produccion', 'Registro de entrevistas', '2024-02-05'::date, '2024-02-16'::date, 9),
  ('produccion', 'Footage', '2024-02-05'::date, '2024-02-16'::date, 10),
  ('produccion', 'Registro de sonido adicional', '2024-02-12'::date, '2024-02-16'::date, 11),
  ('postproduccion', 'Importación y organización del material', '2024-02-26'::date, '2024-03-01'::date, 12),
  ('postproduccion', 'Edición del mediometraje documental', '2024-03-01'::date, '2024-03-22'::date, 13),
  ('postproduccion', 'Corrección de color y ajustes de imagen', '2024-03-25'::date, '2024-04-05'::date, 14),
  ('postproduccion', 'Diseño y edición de sonido', '2024-04-08'::date, '2024-04-19'::date, 15),
  ('postproduccion', 'Finalización y exportación', '2024-04-22'::date, '2024-05-03'::date, 16),
  ('postproduccion', 'Socialización y Presentación a la Comunidad', '2024-05-06'::date, '2024-05-17'::date, 17),
  ('postproduccion', 'Acción de devolución a la ciudadanía', '2024-05-20'::date, '2024-05-31'::date, 18),
  ('postproduccion', 'Entrega final a DAFO', '2024-06-03'::date, '2024-06-14'::date, 19)
) as d(etapa, nombre, fi, ff, orden)
where not exists (
  select 1 from cronograma_actividades c
   where c.postulacion_id = f.id and c.nombre = d.nombre
);

select etapa, count(*) as actividades, min(fecha_inicio) as desde, max(fecha_fin) as hasta
  from cronograma_actividades c join postulaciones p on p.id=c.postulacion_id
 where p.codigo='PO-005' group by etapa order by min(fecha_inicio);
