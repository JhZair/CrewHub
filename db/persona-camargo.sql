-- ============================================================
--  Alta de la única persona que faltaba para cargar los RHE de PO-003
--
--  De los veinte emisores de recibos del fondo Chaccu, diecinueve ya estaban
--  en la base. Falta este, y sin él su recibo de S/ 3,000 no se puede colgar
--  de nadie: no aparecería en la pestaña Equipo ni contaría en la conciliación.
--
--  Los datos salen de su propio recibo (E001-33, 08/10/2025), que es la fuente
--  más fiable que hay: lo emitió él en SUNAT.
--    · Nombre y DNI: de la cabecera del RHE.
--    · Dirección: «A5 APV. VILLA MIRADOR, SAN JERÓNIMO, CUSCO».
--    · Servicio: transporte de personas y carga terrestre.
--
--  ── POR QUÉ «COLABORADOR EVENTUAL» ──
--  Prestó un servicio puntual al proyecto; no es del equipo estable ni se
--  declaró en la postulación. Ponerlo como «colaborador» a secas lo metería en
--  las alertas de CV y DNI que el sistema reclama al equipo permanente —y
--  reclamar un CV con enfoque a quien hizo un flete es la clase de aviso que
--  enseña a ignorar todos los avisos.
--
--  Idempotente: si ya existiera alguien con ese DNI, no hace nada.
-- ============================================================

insert into personas (nombre, alias, tipo, estado, rol, ruc_dni, direccion, region, provincia, distrito)
select 'Guillermo Camargo Peña', 'GuillermoC', 'colaborador eventual', 'activo',
       'Transporte', '42748873',
       'A5 APV. Villa Mirador', 'Cusco', 'Cusco', 'San Jerónimo'
 where not exists (
   select 1 from personas
    where regexp_replace(coalesce(ruc_dni,''), '\D', '', 'g') in ('42748873', '10427488735'));

-- ── VERIFICAR ──
select id, nombre, alias, tipo, ruc_dni
  from personas
 where regexp_replace(coalesce(ruc_dni,''), '\D', '', 'g') in ('42748873', '10427488735');

-- Y que ya no quede ningún recibo huérfano. Debe devolver CERO filas.
select r.dni, r.emisor, count(*) as recibos
  from rhe_po003 r
  left join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (r.dni, r.ruc)
 where p.id is null
 group by r.dni, r.emisor;
