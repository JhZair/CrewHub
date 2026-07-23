-- ============================================================
--  Mujunakuy (PO-005) — Pre-llenado de los EJES de los 58 RHE
--  Rubro = por el concepto del recibo · Etapa = por la fecha vs. el cronograma
--  (Pre ≤ 28/01 · Prod hasta 25/02 · Post desde 26/02). Es un PRIMER PASE:
--  revisa/ajusta en la pantalla del fondo por persona.
--  Idempotente (sobrescribe los ejes). Empareja por DNI/RUC + número de recibo.
-- ============================================================

create temp table _ejes (dni text, ruc text, numero text, etapa text, rubro text) on commit drop;
insert into _ejes (dni, ruc, numero, etapa, rubro) values
  ('40150201', '10401502012', 'E001-155', 'preproduccion', 'logistica'),
  ('40150201', '10401502012', 'E001-157', 'produccion', 'logistica'),
  ('43704910', '10437049101', 'E001-28', 'postproduccion', 'equipo_proyecto'),
  ('40025424', '10400254244', 'E001-32', 'preproduccion', 'equipo_proyecto'),
  ('41299859', '10412998591', 'E001-37', 'preproduccion', 'formativo'),
  ('41299859', '10412998591', 'E001-38', 'preproduccion', 'equipo_proyecto'),
  ('41299859', '10412998591', 'E001-39', 'preproduccion', 'equipo_proyecto'),
  ('40025424', '10400254244', 'E001-33', 'produccion', 'juridicos_financieros'),
  ('25326988', '10253269885', 'E001-8', 'postproduccion', 'logistica'),
  ('41473351', '10414733510', 'E001-22', 'produccion', 'formativo'),
  ('70461111', '10704611116', 'E001-13', 'produccion', 'formativo'),
  ('70461111', '10704611116', 'E001-14', 'produccion', 'formativo'),
  ('40150201', '10401502012', 'E001-168', 'postproduccion', 'logistica'),
  ('43882942', '10438829429', 'E001-4', 'produccion', 'logistica'),
  ('46978092', '10469780924', 'E001-445', 'preproduccion', 'contables_admin'),
  ('40025424', '10400254244', 'E001-34', 'postproduccion', 'recursos_tecnicos'),
  ('23945704', '10239457041', 'E001-27', 'preproduccion', 'equipo_proyecto'),
  ('23945704', '10239457041', 'E001-29', 'produccion', 'equipo_proyecto'),
  ('43882942', '10438829429', 'E001-1', 'preproduccion', 'equipo_proyecto'),
  ('43882942', '10438829429', 'E001-2', 'preproduccion', 'logistica'),
  ('43882942', '10438829429', 'E001-3', 'preproduccion', 'logistica'),
  ('73609341', '10736093419', 'E001-59', 'preproduccion', 'formativo'),
  ('73609341', '10736093419', 'E001-60', 'preproduccion', 'equipo_proyecto'),
  ('73609341', '10736093419', 'E001-61', 'preproduccion', 'logistica'),
  ('40150201', '10401502012', 'E001-161', 'postproduccion', 'logistica'),
  ('40150201', '10401502012', 'E001-169', 'postproduccion', 'logistica'),
  ('40150201', '10401502012', 'E001-182', 'postproduccion', 'logistica'),
  ('40150201', '10401502012', 'E001-184', 'postproduccion', 'logistica'),
  ('43704910', '10437049101', 'E001-22', 'preproduccion', 'formativo'),
  ('43704910', '10437049101', 'E001-23', 'preproduccion', 'equipo_proyecto'),
  ('43067418', '10430674183', 'E001-20', 'preproduccion', 'formativo'),
  ('43067418', '10430674183', 'E001-23', 'produccion', 'equipo_proyecto'),
  ('41070169', '10410701699', 'E001-49', 'produccion', 'equipo_proyecto'),
  ('40455982', '10404559821', 'E001-22', 'postproduccion', 'equipo_proyecto'),
  ('23945704', '10239457041', 'E001-26', 'preproduccion', 'formativo'),
  ('23945704', '10239457041', 'E001-28', 'preproduccion', 'equipo_proyecto'),
  ('23945704', '10239457041', 'E001-30', 'postproduccion', 'formativo'),
  ('43704910', '10437049101', 'E001-25', 'preproduccion', 'equipo_proyecto'),
  ('46978092', '10469780924', 'E001-452', 'preproduccion', 'contables_admin'),
  ('72420725', '10724207257', 'E001-14', 'preproduccion', 'equipo_proyecto'),
  ('43067418', '10430674183', 'E001-21', 'preproduccion', 'equipo_proyecto'),
  ('43067418', '10430674183', 'E001-22', 'preproduccion', 'equipo_proyecto'),
  ('43067418', '10430674183', 'E001-24', 'postproduccion', 'equipo_proyecto'),
  ('41070169', '10410701699', 'E001-47', 'preproduccion', 'equipo_proyecto'),
  ('41070169', '10410701699', 'E001-48', 'preproduccion', 'equipo_proyecto'),
  ('41070169', '10410701699', 'E001-50', 'postproduccion', 'equipo_proyecto'),
  ('40455982', '10404559821', 'E001-16', 'preproduccion', 'formativo'),
  ('40455982', '10404559821', 'E001-17', 'preproduccion', 'equipo_proyecto'),
  ('40455982', '10404559821', 'E001-18', 'preproduccion', 'equipo_proyecto'),
  ('40455982', '10404559821', 'E001-19', 'produccion', 'equipo_proyecto'),
  ('40455982', '10404559821', 'E001-20', 'postproduccion', 'equipo_proyecto'),
  ('41299859', '10412998591', 'E001-40', 'produccion', 'equipo_proyecto'),
  ('41299859', '10412998591', 'E001-41', 'postproduccion', 'formativo'),
  ('40150201', '10401502012', 'E001-147', 'preproduccion', 'equipo_proyecto'),
  ('40150201', '10401502012', 'E001-151', 'preproduccion', 'logistica'),
  ('40634286', '10406342862', 'E001-21', 'preproduccion', 'juridicos_financieros'),
  ('72649167', '10726491670', 'E001-66', 'produccion', 'equipo_proyecto'),
  ('40195890', '10401958903', 'E001-107', 'preproduccion', 'equipo_proyecto');

update rhe r
   set etapa = e.etapa, rubro_item = e.rubro
  from _ejes e
  join personas p on (p.ruc_dni = e.dni or p.ruc_dni = e.ruc)
 where r.persona_id = p.id
   and r.numero = e.numero
   and r.postulacion_id = (select id from postulaciones where codigo = 'PO-005');

-- Comprobación: cuántos quedaron por etapa y rubro
select coalesce(etapa,'(sin etapa)') as etapa, coalesce(rubro_item,'(sin rubro)') as rubro,
       count(*) as rhe, sum(monto) as total_s
  from rhe r join postulaciones p on p.id = r.postulacion_id
 where p.codigo = 'PO-005'
 group by 1,2 order by 1,2;
