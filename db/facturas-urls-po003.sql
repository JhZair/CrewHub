-- ============================================================
--  db/facturas-urls-po003.sql — EL PDF DE LAS SEIS FACTURAS CARGADAS
--
--  Las seis facturas de PO-003 entraron por `db/facturas-po003.sql` y se
--  quedaron sin comprobante: el bloque marca «6 sin PDF adjunto» y cada fila
--  dice «carga directa». Las dos que se registraron a mano después sí lo
--  tienen, porque el formulario lo pide.
--
--  Los seis PDF están en `042-2024-DAFO-Chaccu/EntregablesDAFO/Facturas`
--  (id 1WBRbPOCJcLno_RZ3xqE4kdxaH9s9iSIu), leídos con el conector de Drive.
--  Ningún id se tecleó.
--
--  ── LA SERIE Y EL NÚMERO NO SE VUELVEN A DEDUCIR ──
--  Se leen del propio archivo que cargó estas facturas, no del nombre del PDF.
--  No es rodeo: el nombre de archivo escribe el correlativo con OCHO dígitos
--  (`00002260`) y en la base está como lo imprime el papel (`0002260`). Cruzar
--  por el nombre habría fallado en las seis a la vez —lo cual se nota— o, peor,
--  en algunas sí y en otras no.
--
--  ⚠ El séptimo PDF de esa carpeta, FF53-0002098, NO tiene fila y no debe
--  tenerla: está emitido a ASOCIACION WATUKUY MALLMAYA y se dejó fuera a
--  propósito (ver db/facturas-po003.sql). Que aquí «falte» es lo correcto.
--
--  Idempotente. El paso de escritura va descomentado: es un update acotado por
--  serie y número, respeta lo que ya tenga PDF, y el paso 1 enseña qué va a
--  cambiar antes de tocar nada.
-- ============================================================

drop table if exists fact_url_po003;
create table fact_url_po003(serie text, numero text, archivo text, link text);

insert into fact_url_po003(serie, numero, archivo, link) values
('F001','00000485','F-00339-20605369775_F001-00000485-1003-PDF.pdf','https://drive.google.com/file/d/1OP6e_l9N4BHlmTqTWRyUBnI7rbp6PlWQ/view'),
('FF53','0002112','F-00288-20601844916-01-FF53-00002112.pdf','https://drive.google.com/file/d/1_9rhyJJxS2F_wI_VFBYH6NsOJcOx3Oqu/view'),
('FF53','0002145','F-00289-20601844916-01-FF53-00002145.pdf','https://drive.google.com/file/d/1CLOlc_77EO9k9G3JvOgNyQpopvnl8KRG/view'),
('FF53','0002146','F-00290-20601844916-01-FF53-00002146.pdf','https://drive.google.com/file/d/1egWE4ALejO8FMEtUUs1DTSfrr1Om6sf5/view'),
('FF53','0002259','F-00291-20601844916-01-FF53-00002259.pdf','https://drive.google.com/file/d/1R_kyOZjjpbtBWcJJa60wHpb9R5Vym1ia/view'),
('FF53','0002260','F-00296-20601844916-01-FF53-00002260.pdf','https://drive.google.com/file/d/1CAE-nfsT2J49wb3ww6w4x3BYX80WZPGO/view')
;


-- ------------------------------------------------------------
-- 1 · MIRAR — no escribe nada
--     Si alguna dice «SIN FACTURA», el cruce falló y hay que ver por qué antes
--     de escribir. Deben salir seis, todas «listo».
-- ------------------------------------------------------------
select u.serie || '-' || u.numero as documento,
       c.proveedor,
       case when c.id is null then '⚠ SIN FACTURA — no se pegará'
            when c.url is not null and c.url <> '' then 'ya tiene PDF (se respeta)'
            else 'listo para pegar' end as estado,
       u.archivo
  from fact_url_po003 u
  left join comprobante c
    on c.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and c.serie = u.serie and c.numero = u.numero
 order by u.serie, u.numero;


-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     `url is null or url = ''` protege las dos que se cargaron a mano: esa
--     decisión es más reciente y mejor informada que este lote.
-- ------------------------------------------------------------
update comprobante c
   set url = u.link
  from fact_url_po003 u
 where c.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and c.serie = u.serie and c.numero = u.numero
   and (c.url is null or c.url = '');


-- ------------------------------------------------------------
-- 3 · VERIFICAR — los 8 comprobantes deben quedar con PDF
-- ------------------------------------------------------------
select count(*) as comprobantes,
       count(*) filter (where url is not null and url <> '') as con_pdf,
       count(*) filter (where url is null or url = '')       as sin_pdf,
       sum(importe) as total
  from comprobante
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';

-- Y que dos facturas no apunten al MISMO archivo: eso significaría que el
-- cruce emparejó de más y una enseña el comprobante de otra. CERO filas.
select url, count(*) as veces, string_agg(serie || '-' || numero, ', ') as documentos
  from comprobante
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and url is not null and url <> ''
 group by url having count(*) > 1;


-- ------------------------------------------------------------
-- 4 · LIMPIAR
-- ------------------------------------------------------------
-- drop table if exists fact_url_po003;
-- drop table if exists fact_po003;
