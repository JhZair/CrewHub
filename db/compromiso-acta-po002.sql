-- ============================================================
--  db/compromiso-acta-po002.sql — EL EXTRACTO DEL ACTA 178-2024-DAFO
--  PO-002 · Linderaje: Raices de Armonia · KawsayPachaTV
--
--  39 filas: 19 entregables · 14 obligaciones · 6 plazos.
--  UNA SOLA SENTENCIA para el extracto; el `values` viaja dentro del insert y
--  el id se resuelve por codigo en la misma sentencia. No hay tabla de paso ni
--  pasos dependientes que se puedan correr a medias.
--
--  ── DE DONDE SALE ──
--  Del PDF del acta firmada (12 paginas, escaneo sin capa de texto: pdftotext
--  solo devuelve las firmas digitales). Se paso a 300 ppp y se leyo con OCR en
--  espaniol, clausula por clausula. Los `detalle` estan pegados a la letra del
--  acta, no resumidos.
--
--  ── ES CASI GEMELA DE LA 139-2025 (PO-001), PERO NO IGUAL ──
--  Copiar el extracto de PO-001 habria metido cuatro cosas que esta acta NO
--  dice. Las diferencias, verificadas en el texto:
--    · 5.2   — el informe economico sustenta el 100% del estimulo, SIN la
--              coletilla «mas intereses, de ser el caso» que si trae la 139.
--    · 5.2.4.2 — gastos con proveedores extranjeros: aqui NO hay umbral de
--              S/ 2,000 ni referencia al tipo de cambio de la SBS.
--    · 6.2   — remite al numeral 5.2.2.2 de las BASES (en la 139 es 6.4.2.2).
--    · montos — estimulo S/ 340,200.00, asi que el tope de DJ del 10% es
--              S/ 34,020 y el 30% de reserva de regiones es S/ 102,060.
--  Lo demas coincide, incluido el plazo de DOS anios (7.2) y la prorroga de
--  DOS anios mas (8.1) — que es donde se diferencian de la 042-2024, que da
--  uno de cada.
--
--  ── UNA FILA QUE PUEDE NO APLICAR ──
--  `5.2.4.4` (reserva de regiones) rige solo «para los proyectos que accedieron
--  a la reserva de regiones». No se si PO-002 accedio: en PO-001 el formulario
--  lo declaraba y aqui no lo he comprobado. La fila entra igual, con el
--  condicional escrito en su detalle. Si no aplica, marcala `no_aplica` desde
--  la pantalla; si aplica, el 30% es S/ 102,060 y conviene mirarlo antes de
--  rendir, no despues.
--  Igual que `5.8` (Indecopi), que depende de si el proyecto fue beneficiario
--  antes de un concurso de desarrollo.
--
--  ── LO QUE NO ENTRA ──
--  Las clausulas 11 a 19 (vigencia, infracciones y sanciones, resolucion,
--  legislacion aplicable, acciones judiciales): regimen sancionador general,
--  identico en todas las actas, que no ayuda a decidir nada durante el rodaje.
--  De la clausula cuarta solo entra el 4.6, porque decide POR DONDE se entrega
--  cada material — y equivocarse ahi es no haber entregado.
--
--  Idempotente: `on conflict do nothing`. Correr en Supabase -> SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · EL EXTRACTO
-- ------------------------------------------------------------
insert into compromiso_acta (postulacion_id, clase, clausula, titulo, detalle, orden)
select po.id, v.clase, v.clausula, v.titulo, v.detalle, v.orden
  from (select id from postulaciones where codigo = 'PO-002') po,
       (values
  ('entregable','5.2.1','Resumen de gastos (Excel y PDF)',
   'Según el «Formato de Informe Económico» del MINISTERIO. El PDF va con firma del representante legal Y con sello y firma de un CONTADOR PÚBLICO COLEGIADO.',1),
  ('entregable','5.2.2','Consolidado de gastos (Excel y PDF)',
   'Según el «Formato de Informe Económico» del MINISTERIO.',2),
  ('entregable','5.2.3','Estados mensuales de la cuenta exclusiva',
   'Desde el depósito y/o transferencia bancaria hasta la ejecución total del estímulo.',3),
  ('entregable','5.2.4','Documentos que acrediten los gastos declarados',
   'Documentos LEGIBLES. Gastos nacionales: comprobantes conforme al Reglamento de Comprobantes de Pago de SUNAT, consignando ÚNICAMENTE a la PERSONA JURÍDICA como adquirente. En ningún caso se aceptan proformas ni presupuestos.',4),
  ('entregable','5.2.5','Presupuesto actualizado y detallado',
   'Según el «Formato de Presupuesto» del MINISTERIO.',5),
  ('entregable','5.3.1','Informe de ejecución del proyecto',
   'Según el formato y lineamientos del MINISTERIO.',6),
  ('entregable','5.3.2','Ficha técnica de la obra documental',
   'Según el formato que indique el MINISTERIO.',7),
  ('entregable','5.3.3','Ficha resumen del proyecto',
   'Según formato que indique el MINISTERIO.',8),
  ('entregable','5.3.4.1','Versión final: copia en 35 mm o DCP',
   'Una (1) copia en cinta de 35 mm., en DCP o en soporte de calidad superior (previa autorización del MINISTERIO), con sonido óptico, 5.1 o monoaural y estéreo I+C+D. En 35 mm: estuche de lata con su núcleo. En DCP: disco duro de PRIMER USO. Va por MESA DE PARTES (cl. 4.6).',9),
  ('entregable','5.3.4.2','Versión final: copia en archivo de datos',
   'Una (1) copia en contenedor .mkv; video en .ffv1, .ProRes, .mov o .avi; audio en .FLAC u otro códec sin pérdida validado previamente con el MINISTERIO. CON subtítulos para personas con discapacidad auditiva NO incrustados, en .srt. Si la obra no es hablada en castellano, además subtítulos en castellano en .srt. En dispositivo de PRIMER USO. Va por MESA DE PARTES (cl. 4.6).',10),
  ('entregable','5.3.5','Copia del tráiler y/o teaser',
   'Mismos formatos que el 5.3.4.2, en dispositivo de PRIMER USO. Si no es en castellano, con subtítulos en castellano en .srt. Va por MESA DE PARTES (cl. 4.6).',11),
  ('entregable','5.3.6','Afiche de la obra, impreso y digital',
   'IMPRESO en tamaño B1 (100 cm × 70.7 cm) en papel Couché 150 gr. DIGITAL del mismo tamaño o superior, resolución mínima 300 ppp, en .tiff o .jpeg2000. Va por MESA DE PARTES (cl. 4.6).',12),
  ('entregable','5.3.7','Material promocional adicional (de ser el caso)',
   'Físico o digital, adicional al 5.3.5 y 5.3.6. Mínimo 300 ppp en .tiff o .jpeg2000; videos en compresión sin pérdida, en dispositivo de PRIMER USO validado con el MINISTERIO. Va por MESA DE PARTES (cl. 4.6).',13),
  ('entregable','5.3.8','Licencia de comunicación pública de la obra',
   'Una (01) licencia según formato aprobado por el MINISTERIO: gratuita, no exclusiva, para exhibiciones presenciales en territorio nacional, vigente DIEZ (10) años desde la notificación del cl. 4.3. Incluye la difusión del material promocional y su adecuación, de manera indefinida, y la autorización de copia en DVD o Blu-ray para proyecciones externas, previa autorización de la PERSONA JURÍDICA.',14),
  ('entregable','5.4','Contratos del personal y seguros contra accidentes',
   'Documentación de contratos, convenios de prácticas, prestación de servicios u otros de todo el personal vinculado. Y OBLIGATORIAMENTE seguros contra accidentes para los trabajadores del audiovisual —o prestaciones equivalentes que permitan atención inmediata frente a emergencias durante el rodaje—.',15),
  ('entregable','5.5','Licencias de la música: sincronización y derechos conexos',
   'Documentación que acredite licencia, autorización y/o cesión de derechos de SINCRONIZACIÓN del autor de la obra musical incluida en la obra; y/o licencia, autorización o cesión de DERECHOS CONEXOS de los artistas intérpretes y ejecutantes de esa obra musical.',16),
  ('entregable','5.6','Acción de devolución a la ciudadanía',
   'Encuentro, conversatorio, taller, charla u otra acción dirigida a la ciudadanía, de forma GRATUITA, en la fecha del cronograma y dentro del plazo máximo. NO SE OTORGAN PRÓRROGAS para esta obligación. Se informa con una ficha según formato del MINISTERIO. Puede organizarla el MINISTERIO (5.6.1) o la PERSONA JURÍDICA previa aprobación, adjuntando certificado o constancia que valide la participación gratuita (5.6.2).',17),
  ('entregable','5.8','Registro del tratamiento en Indecopi',
   'Si el PROYECTO no fue beneficiario antes de un concurso de desarrollo de largometraje, hay que presentar copia del documento que acredite el registro del tratamiento de la obra en Indecopi.',18),
  ('entregable','6.4','Capacitación en acoso y hostigamiento sexual',
   'Una (01) capacitación ANTES de iniciar el rodaje. Debe informar sobre la importancia de combatir el acoso y el hostigamiento sexual, cómo identificar esas situaciones y los canales de atención de quejas o denuncias.',19),
  ('obligacion','5.2.4.3','Tope de declaraciones juradas: 10% del estímulo',
   'PREVIA evaluación y aprobación del MINISTERIO, se permite sustentar gastos con declaración jurada por un MÁXIMO DEL 10% del estímulo otorgado (S/ 34,020 de S/ 340,200), según formato del MINISTERIO y suscrito por la PERSONA JURÍDICA, cuando: (i) el prestador del servicio sea ocasional por la naturaleza de su trabajo; (ii) las actividades sean en zonas alejadas de centros poblados o en situación de informalidad y sea imprescindible contratar o comprar; (iii) otros supuestos excepcionales debidamente justificados que el MINISTERIO acepte.',101),
  ('obligacion','5.2.4.2','Gastos con proveedores extranjeros',
   'Documentos equivalentes a los comprobantes SUNAT. Además pueden presentarse comprobantes de transacciones bancarias acompañados de documentos que sustenten el gasto de manera fehaciente, previa evaluación y aprobación del MINISTERIO. En ningún caso se aceptan proformas ni presupuestos.',102),
  ('obligacion','5.2.4.4','Reserva de regiones: mínimo 30% fuera de Lima y Callao',
   'APLICA SOLO si el PROYECTO accedió a la reserva de regiones — confirmarlo en el expediente. En ese caso, no menos del 30% del presupuesto financiado por el estímulo (S/ 102,060 de S/ 340,200) debe usarse en bienes o servicios de las regiones del país, fuera de Lima Metropolitana y Callao. La cl. 9.4 lo repite para las modificaciones de presupuesto, y añade que los cambios de personal creativo, técnico o artístico y de jefes de área deben estar conformados en su mayoría por personas domiciliadas en regiones, según su DNI.',103),
  ('obligacion','3','Solo cuentan los gastos posteriores a la declaración de beneficiarios',
   'El MINISTERIO solo reconoce los gastos efectuados A PARTIR de la declaración de beneficiarios del CONCURSO (13/11/2024, RD 001211-2024-DGIA-VMPCIC/MC), y que sean necesarios y vinculados a la ejecución del PROYECTO de acuerdo a las actividades del cronograma aprobado.',104),
  ('obligacion','4.6','Cuatro materiales van por MESA DE PARTES, no por la plataforma',
   'Todo se presenta por la Plataforma Virtual de Trámites SALVO los materiales de los numerales 5.3.4, 5.3.5, 5.3.6 y 5.3.7, que se entregan por MESA DE PARTES del MINISTERIO. Mandarlos por la plataforma es no haberlos entregado.',105),
  ('obligacion','5.7','Crédito y logotipo del MINISTERIO',
   'Obligatorio incluir el crédito del MINISTERIO en el material de los numerales 5.3.4, 5.3.5, 5.3.6 y 5.3.7, según indique y apruebe el propio MINISTERIO, usando el archivo digital del logotipo institucional y sus lineamientos de uso.',106),
  ('obligacion','6.1','Cuenta exclusiva, y todo retiro es gasto del proyecto',
   'Una única cuenta corriente o de ahorros en moneda nacional, en cualquier entidad del sistema financiero nacional, a nombre de la PERSONA JURÍDICA, para depósito y uso EXCLUSIVO del estímulo. Prohibido usar el monto para generar intereses (fondos mutuos, plazo fijo o similares). TODO RETIRO de esa cuenta se considera gasto directo del proyecto, salvo supuestos excepcionales comunicados al MINISTERIO. Los intereses que genere la cuenta son ingreso del proyecto y hay que sustentarlos.',107),
  ('obligacion','6.2','Relación del personal creativo, técnico y artístico',
   'Cuando el MINISTERIO lo solicite, remitir la relación del personal creativo, técnico y de ser el caso artístico, y los jefes de área técnica, según su formato, para verificar el cumplimiento del numeral 5.2.2.2 de las BASES.',108),
  ('obligacion','6.3','Delegada contra el hostigamiento sexual',
   'Informar, cuando el MINISTERIO lo requiera, quién es la persona designada como delegada contra el hostigamiento sexual y/o los miembros del Comité de Intervención (Ley N° 27942), y dar cuenta de quejas o denuncias si se presentaron.',109),
  ('obligacion','6.7','Originales por Mesa de Partes cuando los pidan',
   'Cuando el MINISTERIO lo requiera, presentar por MESA DE PARTES los documentos ORIGINALES vinculados a la sustentación del uso del estímulo. Conservarlos es parte de la obligación.',110),
  ('obligacion','6.9','Devolver lo no ejecutado o no acreditado',
   'Si no se ejecuta el total del monto otorgado, o si los gastos no se acreditan de manera fehaciente, hay que DEVOLVER el monto no ejecutado en los términos y condiciones que el MINISTERIO indique.',111),
  ('obligacion','9.2','Todo cambio de actividades o de presupuesto necesita aprobación',
   'Informar al MINISTERIO todo cambio o sustitución de actividades y toda modificación del presupuesto, según su formato. Esas modificaciones REQUIEREN aprobación: no basta con avisar. Se presentan por la PLATAFORMA con los motivos y los documentos que lo sustenten (cl. 9.3).',112),
  ('obligacion','10','Las notificaciones llegan a la casilla de la plataforma',
   'Conforme al numeral 20.4 del art. 20° del T.U.O. de la Ley N° 27444, la PERSONA JURÍDICA será notificada por la casilla electrónica de la PLATAFORMA, y acepta que toda comunicación cursada por ahí se considera válida y debidamente notificada. Lo que no se lee ahí, se dio por notificado igual.',113),
  ('obligacion','12.3','Diez días hábiles para responder un requerimiento',
   'Los requerimientos de documentación o material del MINISTERIO se atienden en un plazo MÁXIMO DE DIEZ (10) DÍAS HÁBILES. Incumplir injustificadamente es sancionable (art. 43° del Reglamento del D.U. 022-2019).',114),
  ('plazo','7.2','Plazo máximo de ejecución: DOS años desde el desembolso',
   'Hasta dos (02) años calendario desde la entrega del estímulo económico. Desembolso 24/12/2024 → vence 24/12/2026. Dentro del plazo se puede modificar el cronograma, previa comunicación al MINISTERIO. OJO: el formato del cronograma habla de dos años desde la DECLARACIÓN DE GANADORES (13/11/2024), pero el acta firmada manda y cuenta desde la entrega del estímulo.',201),
  ('plazo','8.1','Prórroga: hasta dos años más, pero hay que pedirla ANTES',
   'Un plazo adicional de máximo dos (02) años calendario. Se solicita ANTES de cumplirse el plazo del 7.2, con: (i) sustento de los motivos del retraso y documentos que lo acrediten, (ii) informe de actividades realizadas y por realizar, (iii) cronograma actualizado y (iv) documento bancario del monto disponible en la cuenta del 6.1, o haber presentado ya el informe económico del 5.2. Se presenta por el sistema en línea (cl. 4.6). NO ES AUTOMÁTICA.',202),
  ('plazo','8.2','El Ministerio resuelve la prórroga en 30 días hábiles',
   'Máximo treinta (30) días hábiles desde recibida la solicitud. Puede pedir más información, y eso suspende el plazo.',203),
  ('plazo','7.3','Revisión del material: 30 días hábiles',
   'El MINISTERIO revisa la documentación y el material de la cláusula quinta en un máximo de treinta (30) días hábiles posteriores a su presentación, para verificar que esté completo para la evaluación técnica y económica.',204),
  ('plazo','9.3','Modificación de cronograma o presupuesto: 30 días hábiles',
   'El MINISTERIO debe resolver el pedido de modificación en un plazo máximo de treinta (30) días hábiles de recibida la solicitud. Puede requerir más información, suspendiendo el plazo.',205),
  ('plazo','14.2','Cuándo se entiende que hay incumplimiento',
   'Tras dos requerimientos a la casilla de la plataforma sin respuesta: se incurre en incumplimiento del acta a partir del día siguiente de vencido el plazo del SEGUNDO requerimiento, sin haber presentado la documentación de la cláusula quinta.',206)
       ) as v(clase, clausula, titulo, detalle, orden)
on conflict (postulacion_id, clase, clausula, titulo) do nothing;

-- ------------------------------------------------------------
-- 2 · LOS DOS DATOS DEL ACTA QUE NO SON FILAS
--     `tope_dj_pct` = 10 -> S/ 34,020 de S/ 340,200. Si el fondo quedo con el
--     25% de otra acta —o heredando el de la convocatoria— la ficha autoriza
--     mas del doble de lo que el acta permite, y pasarse obliga a devolver.
--     `codigo_acta` alimenta el enlace al PDF en la cabecera de Entregables.
-- ------------------------------------------------------------
update postulaciones
   set tope_dj_pct = 10,
       codigo_acta = '178-2024-DAFO'
 where codigo = 'PO-002';

-- ------------------------------------------------------------
-- 3 · VERIFICAR — 19 entregables · 14 obligaciones · 6 plazos
--     Si devuelve CERO filas, el insert no escribio nada: comprueba que
--     'PO-002' exista con ese codigo exacto.
-- ------------------------------------------------------------
select c.clase, count(*) as cuantos,
       count(*) filter (where c.estado = 'entregado') as entregados
  from compromiso_acta c
  join postulaciones p on p.id = c.postulacion_id
 where p.codigo = 'PO-002'
 group by c.clase order by c.clase;

-- El tope de DJ, que es el numero que obliga a devolver plata si se pasa.
select p.codigo, p.monto_adjudicado, p.tope_dj_pct,
       round(p.monto_adjudicado * p.tope_dj_pct / 100, 2) as tope_dj_soles,
       p.codigo_acta, p.acta_url is not null as tiene_enlace_al_acta
  from postulaciones p
 where p.codigo = 'PO-002';
