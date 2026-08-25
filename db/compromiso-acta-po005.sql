-- ============================================================
--  db/compromiso-acta-po005.sql — EL EXTRACTO DEL ACTA 060-2023-DAFO
--  PO-005 · Mujunakuy · 2023
--  Asoc. de Productores Agropecuarios y Artesanos Huaynas de Pumapata
--  Concurso Nacional de Video y Cine Indigena Comunitario 2023
--
--  37 filas: 17 entregables · 14 obligaciones · 6 plazos.
--  UNA SOLA SENTENCIA para el extracto: el `values` viaja dentro del insert y
--  el id se resuelve por codigo en la misma sentencia.
--
--  ── DE DONDE SALE ──
--  Del PDF del acta firmada (10 paginas, escaneo sin capa de texto). Se paso a
--  300 ppp y se leyo con OCR en espaniol, clausula por clausula. Los `detalle`
--  estan pegados a la letra del acta.
--
--  ── ES LA MAS DISTINTA DE LAS CUATRO, Y POR ESO NO SE COPIO NINGUNA ──
--  Copiar el extracto de otro fondo aqui habria citado clausulas que en esta
--  acta dicen otra cosa — o que ni existen. Lo que cambia, verificado:
--
--    NUMERACION DISTINTA. La novena aqui es «DE LA FISCALIZACION» (en las de
--    2024/2025 es «MODIFICACIONES»); las modificaciones estan en la DECIMO
--    PRIMERA y la notificacion por casilla en la DECIMO TERCERA. Citar «9.2» o
--    «10» como en las otras apuntaria al parrafo equivocado.
--
--    TOPE DE DJ: 25% (S/ 50,000 de S/ 200,000). Las actas de 2024 y 2025 lo
--    bajaron al 10%. Es el numero que obliga a devolver plata si se pasa.
--
--    PLAZO: UN anio (7.2) y prorroga de UN anio (8.1) — como la 042-2024, y a
--    diferencia de la 139-2025 y la 178-2024, que dan dos de cada.
--
--    DIAS HABILES: la revision del material (7.3), la prorroga (8.2) y las
--    modificaciones (cl. 11) se resuelven en VEINTE dias habiles, no treinta.
--
--    MATERIAL FINAL: DVD + Blu-ray + archivo .mkv (5.3.4.1/2/3) y REGISTRO
--    AUDIOVISUAL DEL PROCESO (5.3.5). No hay 35mm/DCP, ni trailer, ni afiche
--    B1, ni licencias de musica, ni registro en Indecopi, ni reserva de
--    regiones: todo eso llego despues.
--
--    CERTIFICADO DE CUMPLIMIENTO: existe solo aqui (4.3 y 12.2). El acta vive
--    hasta que se emite, y desde ahi corren los diez anios de la licencia del
--    5.3.7. Las actas posteriores lo sustituyeron por una comunicacion.
--
--    5.3.1: el informe de ejecucion debe incluir los PROCESOS DE FORMACION Y
--    CREACION COLECTIVA. Es propio de este concurso.
--
--  ── UNA REDUNDANCIA DEL PROPIO DOCUMENTO ──
--  El acta dice dos veces que hay que devolver lo no ejecutado: en 6.7 (con
--  «o no se acrediten los gastos») y en 6.8 (solo «no se ejecute»). Se carga
--  UNA fila, la del 6.7, que es la mas amplia, y se deja dicho en su detalle
--  que el 6.8 la repite. Dos filas identicas harian dudar de la lectura.
--
--  ── LO QUE NO ENTRA ──
--  La clausula decima (infracciones y sanciones) y de la decimo cuarta en
--  adelante (resolucion de pleno derecho, mutuo acuerdo, legislacion
--  aplicable, acciones judiciales): regimen sancionador y contractual general.
--  De la cuarta solo entra el 4.6, porque decide POR DONDE se entrega cada
--  material.
--
--  Idempotente: `on conflict do nothing`. Correr en Supabase -> SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · EL EXTRACTO
-- ------------------------------------------------------------
insert into compromiso_acta (postulacion_id, clase, clausula, titulo, detalle, orden)
select po.id, v.clase, v.clausula, v.titulo, v.detalle, v.orden
  from (select id from postulaciones where codigo = 'PO-005') po,
       (values
  ('entregable','5.2.1','Resumen de gastos (PDF y Excel)',
   'Según el «Formato de Informe Económico» del MINISTERIO, con firma del representante legal Y con sello y firma de un CONTADOR PÚBLICO COLEGIADO.',1),
  ('entregable','5.2.2','Consolidado de gastos (PDF y Excel)',
   'Según el «Formato de Informe Económico» del MINISTERIO.',2),
  ('entregable','5.2.3','Estados mensuales de la cuenta exclusiva',
   'Desde el depósito hasta la ejecución total del estímulo.',3),
  ('entregable','5.2.4','Documentos que acrediten los gastos declarados',
   'Gastos nacionales: comprobantes conforme al Reglamento de Comprobantes de Pago de SUNAT, consignando ÚNICAMENTE a la PERSONA JURÍDICA como adquirente. En ningún caso se aceptan proformas ni presupuestos.',4),
  ('entregable','5.2.5','Presupuesto actualizado y detallado',
   'Según el «Formato de Presupuesto» del MINISTERIO.',5),
  ('entregable','5.3.1','Informe de ejecución del proyecto',
   'Debe incluir los PROCESOS DE FORMACIÓN Y CREACIÓN COLECTIVA, según el formato y lineamientos del MINISTERIO. Es propio de este concurso: las actas de ficción y documental no lo piden.',6),
  ('entregable','5.3.2','Ficha técnica de la obra',
   'Según el formato que indique el MINISTERIO.',7),
  ('entregable','5.3.3','Ficha resumen del proyecto',
   'Según formato que indique el MINISTERIO.',8),
  ('entregable','5.3.4.1','Versión final: copia en DVD',
   'Una (1) copia en DVD, con estuche y carátula, según indique el MINISTERIO. Va por MESA DE PARTES (cl. 4.6).',9),
  ('entregable','5.3.4.2','Versión final: copia en Blu-ray',
   'Una (1) copia en Blu-ray, con estuche y carátula, según indique el MINISTERIO. Va por MESA DE PARTES (cl. 4.6).',10),
  ('entregable','5.3.4.3','Versión final: copia en archivo de datos',
   'Una (1) copia en contenedor .mkv; video en .ffv1, .ProRes, .mov o .avi; audio en .FLAC u otro códec sin pérdida validado previamente con el MINISTERIO. Si la obra no es hablada en castellano, incluir subtítulos en castellano en .srt — esta obra es en quechua, así que aplica. Va por MESA DE PARTES (cl. 4.6).',11),
  ('entregable','5.3.5','Registro audiovisual del proceso de realización',
   'En contenedor .mkv; video en .ffv1, .ProRes, .mov o .avi; audio en .FLAC u otro códec sin pérdida validado con el MINISTERIO. Va por MESA DE PARTES (cl. 4.6).',12),
  ('entregable','5.3.6','Material promocional (de ser el caso)',
   'Físico o digital. Si la obra es en lenguas indígenas u originarias se RECOMIENDA que el material también lo esté. Imágenes a 300 ppp mínimo en .tiff o .jpeg2000; videos en compresión sin pérdida, en dispositivo validado con el MINISTERIO. Va por MESA DE PARTES (cl. 4.6).',13),
  ('entregable','5.3.7','Licencia de comunicación pública de la obra',
   'Una (01) licencia según formato aprobado por el MINISTERIO: gratuita, no exclusiva, para exhibiciones presenciales en territorio nacional, vigente DIEZ (10) años contados desde la emisión del CERTIFICADO DE CUMPLIMIENTO (no desde una notificación, como en las actas posteriores). Incluye la difusión del material promocional y su adecuación de manera indefinida, y la autorización de una copia de reemplazo si el material falla por desgaste ordinario.',14),
  ('entregable','5.4','Contratos del personal y seguros contra accidentes',
   'Documentación de contratos, convenios de prácticas, términos de servicio u otros de todo el personal vinculado. Y OBLIGATORIAMENTE seguros contra accidentes para los trabajadores del audiovisual DURANTE EL RODAJE. Se presenta como parte de esta cláusula.',15),
  ('entregable','5.5','Acción de devolución a la ciudadanía',
   'Encuentro, conversatorio, taller, charla u otra acción dirigida a la ciudadanía, de forma GRATUITA, en la fecha del cronograma y dentro del plazo máximo. NO SE OTORGAN PRÓRROGAS para esta obligación. Se informa con una ficha según formato del MINISTERIO. Puede organizarla el MINISTERIO (5.5.1) o la PERSONA JURÍDICA previa aprobación, adjuntando certificado o constancia que valide la participación gratuita (5.5.2).',16),
  ('entregable','6.3','Capacitación en acoso y hostigamiento sexual',
   'Una (01) capacitación ANTES de iniciar el rodaje, INFORMANDO PREVIAMENTE AL MINISTERIO. Debe cubrir la importancia de combatir el acoso y el hostigamiento sexual, cómo identificar esas situaciones y los canales de atención de quejas o denuncias.',17),
  ('obligacion','5.2.4.3','Tope de declaraciones juradas: 25% del estímulo',
   'PREVIA evaluación y aprobación del MINISTERIO, se permite sustentar gastos con declaración jurada por un MÁXIMO DEL 25% del estímulo (S/ 50,000 de S/ 200,000), según formato del MINISTERIO y suscrito por el representante legal, cuando: (i) el prestador del servicio sea ocasional por la naturaleza de su trabajo; (ii) las actividades sean en zonas alejadas de centros poblados o en situación de informalidad y sea imprescindible contratar o comprar; (iii) otros supuestos excepcionales debidamente justificados que el MINISTERIO acepte. OJO: las actas de 2024 y 2025 bajaron este tope al 10%. Aquí son 25%.',101),
  ('obligacion','5.2.4.2','Gastos con proveedores extranjeros',
   'Documentos equivalentes a los comprobantes SUNAT. Además pueden presentarse comprobantes de transacciones bancarias acompañados de documentos que sustenten el gasto de manera fehaciente, previa evaluación y aprobación del MINISTERIO. En ningún caso se aceptan proformas ni presupuestos.',102),
  ('obligacion','3','Solo cuentan los gastos posteriores a la declaración de beneficiarios',
   'El MINISTERIO solo reconoce los gastos efectuados A PARTIR de la declaración de beneficiarios del CONCURSO (25/07/2023, RD 000793-2023-DGIA/MC), y que sean necesarios y vinculados a la ejecución del PROYECTO.',103),
  ('obligacion','4.6','Tres materiales van por MESA DE PARTES, no por la plataforma',
   'Todo se presenta por la Plataforma Virtual de Trámites SALVO los materiales de los numerales 5.3.4, 5.3.5 y 5.3.6, que se entregan por MESA DE PARTES del MINISTERIO. Mandarlos por la plataforma es no haberlos entregado.',104),
  ('obligacion','5.6','Crédito y logotipo del MINISTERIO',
   'Obligatorio incluir el crédito del MINISTERIO en el material de los numerales 5.3.4 y 5.3.6, según indique y apruebe el propio MINISTERIO, usando el archivo digital del logotipo institucional y sus lineamientos de uso.',105),
  ('obligacion','6.1','Cuenta exclusiva, y todo retiro es gasto del proyecto',
   'Una única cuenta corriente o de ahorros en moneda nacional, a nombre de la PERSONA JURÍDICA, para depósito y uso EXCLUSIVO del estímulo. Prohibido usar el monto para generar intereses (fondos mutuos, plazo fijo o similares). TODO RETIRO de esa cuenta se considera gasto directo del proyecto, salvo supuestos excepcionales comunicados al MINISTERIO. Los intereses que genere la cuenta son ingreso del proyecto y hay que sustentarlos.',106),
  ('obligacion','6.2','Delegada contra el hostigamiento sexual',
   'Informar al MINISTERIO, cuando lo requiera, quién es la persona designada como delegada contra el hostigamiento sexual y/o los miembros del Comité de Intervención frente al Hostigamiento Sexual en Centros de Trabajo (Ley N° 27942).',107),
  ('obligacion','6.4','Estados de cuenta cuando los pidan',
   'Presentar copia simple de los estados mensuales de la cuenta del 6.1 cuando el MINISTERIO lo requiera. Es aparte del 5.2.3, que los pide todos junto al informe económico.',108),
  ('obligacion','6.5','Atender los requerimientos de información',
   'Obligación de atender los requerimientos de información del MINISTERIO vinculados al PROYECTO; puede pedir información de las actividades ejecutadas, entre otros.',109),
  ('obligacion','6.6','Originales por Mesa de Partes cuando los pidan',
   'Cuando el MINISTERIO lo requiera, presentar por MESA DE PARTES los documentos ORIGINALES vinculados a la sustentación del uso del estímulo. Conservarlos es parte de la obligación.',110),
  ('obligacion','6.7','Devolver lo no ejecutado o no acreditado',
   'Si no se ejecuta el total del monto otorgado, o si los gastos no se acreditan de manera fehaciente, hay que DEVOLVER el monto no ejecutado en los términos y condiciones que el MINISTERIO indique. El acta repite esta obligación en el 6.8 en versión más corta —solo «no se ejecute»—: es una redundancia del propio documento, no un error de lectura.',111),
  ('obligacion','9.3','Diez días hábiles para responder un requerimiento',
   'Los requerimientos de documentación o material del MINISTERIO se atienden en un plazo MÁXIMO DE DIEZ (10) DÍAS HÁBILES. Incumplir injustificadamente es sancionable (art. 43° del Reglamento del D.U. 022-2019).',112),
  ('obligacion','11','Todo cambio de cronograma o de actividades necesita aprobación',
   'Los cambios de datos de contacto se comunican y se entienden aprobados (el domicilio, a los 5 días calendario). Pero la modificación de CRONOGRAMA y de ACTIVIDADES debe ser APROBADA por el MINISTERIO: se presenta por la Plataforma con los motivos y los documentos que lo sustenten.',113),
  ('obligacion','13','Las notificaciones llegan a la casilla de la plataforma',
   'Conforme al numeral 20.4 del art. 20° del T.U.O. de la Ley N° 27444, la PERSONA JURÍDICA será notificada por la casilla electrónica de la Plataforma, y acepta que toda comunicación cursada por ahí se considera válida y debidamente notificada. Lo que no se lee ahí, se dio por notificado igual.',114),
  ('plazo','7.2','Plazo máximo de ejecución: UN año desde el desembolso',
   'Hasta un (01) año calendario desde la entrega del estímulo económico. Dentro del plazo se puede modificar el cronograma, previa comunicación al MINISTERIO. OJO: esta acta da UN año, igual que la 042-2024; las de 2025 (139) y la 178-2024 dan DOS. El plazo depende del acta, no del año.',201),
  ('plazo','8.1','Prórroga: un año más, pero hay que pedirla ANTES',
   'Un plazo adicional de máximo un (01) año calendario. Se solicita ANTES de cumplirse el plazo del 7.2, con: (i) sustento de los motivos del retraso y documentos que lo acrediten, (ii) informe de actividades realizadas y por realizar, (iii) cronograma actualizado y (iv) documento bancario del monto disponible en la cuenta del 6.1, o haber presentado ya el informe económico del 5.2. Se presenta por el sistema en línea (cl. 4.6). NO ES AUTOMÁTICA.',202),
  ('plazo','8.2','El Ministerio resuelve la prórroga en 20 días hábiles',
   'Máximo VEINTE (20) días hábiles desde recibida la solicitud — no treinta, como en las actas posteriores. Puede pedir más información, y eso suspende el plazo.',203),
  ('plazo','7.3','Revisión del material: 20 días hábiles',
   'El MINISTERIO revisa la documentación y el material de la cláusula quinta en un máximo de VEINTE (20) días hábiles posteriores a su presentación, dejándose constancia de la entrega. Si la entrega está incompleta puede observar y dar plazo de subsanación (cl. 7.4).',204),
  ('plazo','11','Modificación de cronograma o actividades: 20 días hábiles',
   'El MINISTERIO debe resolver el pedido de modificación en un plazo máximo de VEINTE (20) días hábiles de recibida la solicitud. Puede requerir más información, suspendiendo el plazo.',205),
  ('plazo','12.2','El acta vive hasta el Certificado de Cumplimiento',
   'La vigencia del acta llega hasta la emisión del CERTIFICADO DE CUMPLIMIENTO, una vez emitidos los informes que acrediten el cumplimiento adecuado de las obligaciones. Ese certificado es la única señal formal de que el fondo cerró — y es también desde donde corren los diez años de la licencia del 5.3.7. Las actas de 2024 y 2025 ya no lo usan.',206)
       ) as v(clase, clausula, titulo, detalle, orden)
on conflict (postulacion_id, clase, clausula, titulo) do nothing;

-- ------------------------------------------------------------
-- 2 · LOS DOS DATOS DEL ACTA QUE NO SON FILAS
--     `tope_dj_pct` = 25 -> S/ 50,000 de S/ 200,000. Aqui el riesgo es el
--     CONTRARIO al de los otros fondos: si alguien copio el 10% de las actas
--     nuevas, la ficha estaria negando un margen que este acta si concede.
-- ------------------------------------------------------------
update postulaciones
   set tope_dj_pct = 25,
       codigo_acta = '060-2023-DAFO'
 where codigo = 'PO-005';

-- ------------------------------------------------------------
-- 3 · VERIFICAR — 17 entregables · 14 obligaciones · 6 plazos
--     Si devuelve CERO filas, el insert no escribio nada: comprueba que
--     'PO-005' exista con ese codigo exacto.
-- ------------------------------------------------------------
select c.clase, count(*) as cuantos,
       count(*) filter (where c.estado = 'entregado') as entregados
  from compromiso_acta c
  join postulaciones p on p.id = c.postulacion_id
 where p.codigo = 'PO-005'
 group by c.clase order by c.clase;

select p.codigo, p.monto_adjudicado, p.tope_dj_pct,
       round(p.monto_adjudicado * p.tope_dj_pct / 100, 2) as tope_dj_soles,
       p.codigo_acta, p.acta_url is not null as tiene_enlace_al_acta,
       p.fecha_desembolso,
       p.fecha_limite_rendicion
  from postulaciones p
 where p.codigo = 'PO-005';
