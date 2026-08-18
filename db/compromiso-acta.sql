-- ============================================================
--  db/compromiso-acta.sql — LO QUE EL ACTA OBLIGA, EN FILAS
--
--  El acta de compromiso es un PDF de once páginas escaneado que nadie abre, y
--  dentro están las reglas que deciden si el fondo se cierra bien o se pierde:
--  qué entregar, cuándo, con qué se puede sustentar y qué pasa si no.
--
--  ── EL EXTRACTO INDEXA EL ACTA, NO LA SUSTITUYE ──
--  Cada fila cita su CLÁUSULA (`5.3.4`, `7.2`, `6.1`…) y eso no es un adorno:
--  es lo que convierte una nota nuestra en una cita verificable. Un compromiso
--  escrito sin su número es una opinión de quien lo apuntó, y dentro de un año
--  nadie sabrá si dice lo mismo que el documento firmado. Con el número, se
--  comprueba en diez segundos.
--  Por eso `acta_url` sigue siendo el enlace visible al lado: esto es un índice
--  para llegar rápido al párrafo, no una segunda versión del acta.
--
--  ── DOS NATURALEZAS QUE NO SE MEZCLAN ──
--  · ENTREGABLE — una cosa que se entrega y se tacha. Tiene estado y fecha.
--  · OBLIGACIÓN — una regla que se cumple mientras se ejecuta y se consulta
--    antes de decidir (cuenta exclusiva, tope de DJ, créditos, capacitación).
--    No se tacha: no «se termina» de tener una cuenta exclusiva.
--  · PLAZO — las fechas que el acta impone.
--  Meterlas en una sola lista haría que la mitad tuviera un estado que no
--  significa nada, y un estado que no significa nada se rellena al azar.
--
--  Idempotente. Al final verifica.
-- ============================================================

create table if not exists compromiso_acta (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  /* entregable | obligacion | plazo */
  clase          text not null default 'entregable',
  /* El número de cláusula, tal como está en el acta. Es la llave para volver
     al documento, así que se guarda como TEXTO: «5.2.4.3» no es un número. */
  clausula       text,
  titulo         text not null,
  /* El extracto. Se guarda pegado a la letra del acta —no un resumen libre—
     porque lo que se consulta aquí se va a usar para decidir, y un resumen
     bienintencionado pierde justo el matiz que importaba. */
  detalle        text,
  /* Solo para entregables y plazos. */
  fecha_limite   date,
  /* pendiente | en_proceso | entregado | no_aplica */
  estado         text not null default 'pendiente',
  entregado_en   date,
  /* La prueba de lo entregado: el enlace a lo que se mandó. */
  url            text,
  nota           text,
  orden          int default 0,
  creado_en      timestamptz default now(),
  creado_por     uuid references perfiles(id),
  /* Una cláusula, una fila por fondo. Sin esto, correr este archivo dos veces
     duplica el checklist entero y el «3 de 8 entregado» pasa a ser mentira. */
  unique (postulacion_id, clase, clausula, titulo)
);

/* ── EL CASO QUE SE ABRIÓ DESDE ESTA CLÁUSULA ──
   Un entregable NO es una tarea: es una obligación del acta, y estará ahí
   pendiente aunque nadie se ocupe. La tarea es la decisión de que alguien se
   ocupe AHORA, con responsable y plazo — y eso lo decide una persona, no el
   sistema al importar el acta.
   Guardarlo aquí es lo que evita los duplicados: sin esta columna, el segundo
   clic en «＋ caso» abre un caso gemelo y el tablero se llena de pares. Misma
   lección que `dafo_comunicaciones.caso_id`.
   `on delete set null`: borrar el caso no borra el compromiso. La obligación
   sigue existiendo; lo que desaparece es la decisión de atenderla. */
alter table compromiso_acta add column if not exists caso_id uuid
  references publicaciones(id) on delete set null;

create index if not exists idx_compromiso_post on compromiso_acta(postulacion_id, clase, orden);

alter table compromiso_acta enable row level security;
drop policy if exists "leer_comp"   on compromiso_acta;
drop policy if exists "crear_comp"  on compromiso_acta;
drop policy if exists "editar_comp" on compromiso_acta;
drop policy if exists "borrar_comp" on compromiso_acta;
create policy "leer_comp"   on compromiso_acta for select to authenticated using (true);
create policy "crear_comp"  on compromiso_acta for insert to authenticated with check (true);
create policy "editar_comp" on compromiso_acta for update to authenticated using (true) with check (true);
create policy "borrar_comp" on compromiso_acta for delete to authenticated using (true);


-- ============================================================
--  EL EXTRACTO DE 042-2024-DAFO (PO-003 · Chaccu)
--
--  Leído del PDF por OCR y revisado a mano. El escaneo no tiene capa de texto
--  y el OCR disponible es en inglés, así que confunde tildes y ñ: los textos
--  de abajo se corrigieron leyendo el documento, pero cualquier duda se
--  resuelve en el PDF — que es justo para lo que está la cláusula al lado.
--
--  Solo va a ESTE fondo. Otro concurso tiene otra acta, y copiar este
--  checklist a los demás sería inventarles obligaciones que quizá no tienen.
-- ============================================================
drop table if exists comp_042_2024;
create table comp_042_2024(clase text, clausula text, titulo text, detalle text, orden int);

insert into comp_042_2024(clase, clausula, titulo, detalle, orden) values
-- ── ENTREGABLES (cláusula 5.3): el material final ─────────────────────────
('entregable','5.3.1','Informe de ejecución del proyecto',
 'Debe incluir los procesos de formación y creación colectiva, según el formato y lineamientos del MINISTERIO.',1),
('entregable','5.3.2','Ficha técnica de la obra',
 'Según el formato que indique el MINISTERIO.',2),
('entregable','5.3.3','Ficha resumen del proyecto',
 'Según formato que indique el MINISTERIO.',3),
('entregable','5.3.4','Copia de la obra en archivo de datos',
 'Una (1) copia: contenedor .mkv; video en .ffv1, ProRes, .mov o .avi; audio en .FLAC u otro códec sin pérdida validado previamente con el MINISTERIO, en un disco duro de PRIMER USO. Se entrega por MESA DE PARTES, no por la plataforma (cl. 4.6).',4),
('entregable','5.3.5','Subtítulos en castellano (si la obra no es en castellano)',
 'En formato .srt. Esta obra es en quechua, así que aplica.',5),
('entregable','5.3.6','Registro audiovisual del proceso de realización',
 'Mismos formatos que el 5.3.4, en dispositivo de almacenamiento de PRIMER USO. Se entrega por MESA DE PARTES (cl. 4.6).',6),
('entregable','5.3.7','Material promocional (de ser el caso)',
 'Físico o digital. Imágenes a 300 ppp mínimo en .tiff o jpeg2000; videos en compresión sin pérdida, en dispositivo de almacenamiento validado con el MINISTERIO. Si la obra es en lengua originaria, se recomienda que el material también lo esté.',7),
('entregable','5.3.8','Licencia de comunicación pública de la obra',
 'Una (01) licencia según formato aprobado por el MINISTERIO: gratuita, no exclusiva, para exhibiciones presenciales en territorio nacional, vigente DIEZ (10) años desde la notificación del cl. 4.3. Incluye la difusión del material promocional y su adecuación, de manera indefinida, y la autorización para copia en DVD/Blu-Ray para proyecciones externas, con autorización previa de la asociación.',8),

-- ── EL INFORME ECONÓMICO (cláusula 5.2): la rendición ─────────────────────
('entregable','5.2.1','Resumen de gastos (Excel y PDF)',
 'Según el «Formato de Informe Económico» del MINISTERIO. El PDF va con firma del representante legal Y con sello y firma de un CONTADOR PÚBLICO COLEGIADO.',10),
('entregable','5.2.2','Consolidado de gastos (Excel y PDF)',
 'Según el «Formato de Informe Económico» del MINISTERIO.',11),
('entregable','5.2.3','Estados mensuales de la cuenta exclusiva',
 'Desde el depósito o transferencia del estímulo hasta la ejecución total del mismo. Cargados en el sistema: 15 estados, del 19/08/2024 al 31/10/2025.',12),
('entregable','5.2.4','Documentos que acrediten los gastos declarados',
 'Comprobantes conforme al Reglamento de Comprobantes de Pago de SUNAT, consignando ÚNICAMENTE a la asociación como adquirente. En ningún caso se aceptan proformas ni presupuestos.',13),
('entregable','5.2.5','Presupuesto actualizado y detallado',
 'Según el «Formato de Presupuesto» del MINISTERIO.',14),
('entregable','5.4','Contratos del personal y seguros contra accidentes',
 'Documentación de contratos, convenios de prácticas o prestación de servicios de todo el personal vinculado. Y OBLIGATORIAMENTE seguros contra accidentes para quienes participen —o prestaciones equivalentes que permitan atención inmediata durante el rodaje—. Se presenta como parte de esta cláusula.',15),
('entregable','5.5','Acción de devolución a la ciudadanía',
 'Encuentro, conversatorio, taller o charla, GRATUITA, en la fecha del cronograma y dentro del plazo máximo. Se informa con una ficha según formato del MINISTERIO. NO SE OTORGAN PRÓRROGAS para esta obligación.',16),
('entregable','6.3','Capacitación en acoso y hostigamiento sexual',
 'Una (01) capacitación ANTES de iniciar el rodaje, informando previamente al MINISTERIO. Debe cubrir la importancia de combatir el acoso, cómo identificar esas situaciones y los canales de queja o denuncia.',17),

-- ── OBLIGACIONES: reglas que se cumplen, no se tachan ─────────────────────
('obligacion','5.2.4.3','Tope de declaraciones juradas: 25% del estímulo',
 'Se permite sustentar gastos con declaración jurada por un MÁXIMO DEL 25% del estímulo (S/ 50,000 de S/ 200,000), según formato del MINISTERIO y suscrito por el representante legal, y PREVIA evaluación y aprobación, solo cuando: (i) el prestador del servicio sea ocasional por la naturaleza de su trabajo; (ii) las actividades sean en zonas alejadas de centros poblados o en situación de informalidad y sea imprescindible contratar o comprar; (iii) otros supuestos excepcionales debidamente justificados que el MINISTERIO acepte.',20),
('obligacion','6.1','Cuenta exclusiva, y todo retiro es gasto del proyecto',
 'Una única cuenta corriente o de ahorros en moneda nacional, a nombre de la asociación, para depósito y uso EXCLUSIVO del estímulo. Prohibido usar el monto para generar intereses (fondos mutuos, plazo fijo o similares). TODO RETIRO de esa cuenta se considera gasto directo del proyecto, salvo supuestos excepcionales comunicados al MINISTERIO. Los intereses que genere la cuenta son ingreso del proyecto y hay que sustentarlos.',21),
('obligacion','3','Solo cuentan los gastos posteriores a la declaración de beneficiarios',
 'El MINISTERIO solo reconoce los gastos efectuados A PARTIR de la declaración de beneficiarios del concurso, y que sean necesarios y vinculados al proyecto según el cronograma aprobado.',22),
('obligacion','5.6','Crédito y logotipo del MINISTERIO',
 'Obligatorio incluir el crédito del MINISTERIO en el material de los numerales 5.3.4, 5.3.5 y 5.3.6, según indique y apruebe el propio MINISTERIO, usando el archivo digital del logotipo institucional y sus lineamientos de uso.',23),
('obligacion','6.2','Delegada contra el hostigamiento sexual',
 'Informar, cuando el MINISTERIO lo requiera, quién es la persona designada como delegada contra el hostigamiento sexual y/o los miembros del Comité de Intervención (Ley N° 27942), y dar cuenta de quejas o denuncias si se presentaron.',24),
('obligacion','6.8','Devolver lo no ejecutado o no acreditado',
 'Si no se ejecuta el total del monto otorgado, o si los gastos no se acreditan de manera fehaciente, hay que DEVOLVER el monto no ejecutado en los términos que el MINISTERIO indique.',25),
('obligacion','9.2','Todo cambio de actividades o de presupuesto necesita aprobación',
 'Informar al MINISTERIO cualquier cambio o sustitución de actividades y toda modificación del presupuesto, según su formato. Esas modificaciones REQUIEREN aprobación: no basta con avisar. El Ministerio resuelve en 30 días hábiles.',26),
('obligacion','12.3','Diez días hábiles para responder un requerimiento',
 'Los requerimientos de documentación o material del MINISTERIO se atienden en un plazo MÁXIMO DE DIEZ (10) DÍAS HÁBILES. Incumplir injustificadamente es sancionable (art. 43° del Reglamento del D.U. 022-2019).',27),
('obligacion','10','Las notificaciones llegan a la casilla de la plataforma',
 'La asociación acepta ser notificada por la casilla electrónica de la Plataforma Virtual de Trámites: toda comunicación cursada por ahí se considera válida y debidamente notificada. Por eso la Casilla DAFO importa: lo que no se lee ahí, se dio por notificado igual.',28),

-- ── PLAZOS ────────────────────────────────────────────────────────────────
('plazo','7.2','Plazo máximo de ejecución: UN año desde el desembolso',
 'Hasta un (01) año calendario desde la entrega del estímulo. Desembolso 11/09/2024 → vence 11/09/2025. Dentro del plazo se puede modificar el cronograma, comunicándolo al MINISTERIO.',30),
('plazo','8.1','Prórroga: un año más, pero hay que pedirla ANTES',
 'Un plazo adicional de máximo un (01) año, y se solicita ANTES de cumplirse el plazo del 7.2, con: (i) sustento de los motivos del retraso y documentos que lo acrediten, (ii) informe de actividades realizadas y por realizar, (iii) cronograma actualizado y (iv) documento bancario del monto disponible en la cuenta del 6.1, o haber presentado ya el informe económico del 5.2. Se presenta por el sistema en línea. NO ES AUTOMÁTICA.',31),
('plazo','8.2','El Ministerio resuelve la prórroga en 30 días hábiles',
 'Puede pedir más información, y eso suspende el plazo.',32),
('plazo','7.3','Revisión del material: 30 días hábiles',
 'El MINISTERIO revisa la documentación y el material de la cláusula quinta en un máximo de treinta (30) días hábiles desde su presentación, para verificar que esté completo para la evaluación técnica y económica.',33),
('plazo','14.2','Cuándo se entiende que hay incumplimiento',
 'Tras dos requerimientos a la casilla de la plataforma sin respuesta: se incurre en incumplimiento del acta a partir del día siguiente de vencido el plazo del SEGUNDO requerimiento, sin haber presentado lo de la cláusula quinta.',34)
;

-- ------------------------------------------------------------
-- 1 · MIRAR — qué se va a crear
-- ------------------------------------------------------------
select c.clase, c.clausula, c.titulo,
       case when x.id is null then 'nueva' else 'ya existe' end as que_pasa
  from comp_042_2024 c
  left join compromiso_acta x
    on x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and x.clase = c.clase and x.clausula = c.clausula and x.titulo = c.titulo
 order by c.orden;

-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     Descomenta y corre. `do nothing` y no `do update`: si alguien ya editó
--     un detalle o marcó un entregable como entregado, este archivo no tiene
--     por qué pisarlo — el extracto es el punto de partida, no la autoridad.
-- ------------------------------------------------------------
-- insert into compromiso_acta (postulacion_id, clase, clausula, titulo, detalle, orden)
-- select 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad', c.clase, c.clausula, c.titulo, c.detalle, c.orden
--   from comp_042_2024 c
-- on conflict (postulacion_id, clase, clausula, titulo) do nothing;

-- ------------------------------------------------------------
-- 3 · VERIFICAR — cuántos quedaron por naturaleza
-- ------------------------------------------------------------
select clase, count(*) as cuantos,
       count(*) filter (where estado = 'entregado') as entregados
  from compromiso_acta
 where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
 group by clase order by clase;

-- ------------------------------------------------------------
-- 4 · LIMPIAR
-- ------------------------------------------------------------
-- drop table if exists comp_042_2024;
