-- ============================================================
--  PRESUPUESTO POSTULADO — PO-001 · Mujeres del Ande: Voces que Transforman
--
--  Fuente: Temporal/ExpedienteMujeresDelAndeDAFO.htm, la página guardada de la
--  Plataforma Virtual de Trámites del Ministerio. Se leyó la tabla
--  `tbl_presupuesto` y se generó este archivo: nada se transcribió a mano.
--
--  83 ítems · S/ 525,735.00 · tipo de cambio 3.65
--  Financiado: S/ 400,000.00 del Ministerio + S/ 125,735.00 de la empresa.
--
--  ── LAS CUATRO COMPROBACIONES QUE YA PASARON ──
--  1. La suma de los 83 ítems da S/ 525,735.00.
--  2. Coincide con el total impreso por la plataforma.
--  3. Y con la suma de las 4 CATEGORÍAS (40,150 + 52,500 + 258,425 + 174,660).
--  4. Y con la suma de los 32 RUBROS por separado.
--  Además, en las 148 filas del formulario, cantidad × costo unitario da
--  exactamente el total impreso: ni un redondeo suelto. Y la columna en moneda
--  extranjera dividida entre soles da 3.65, el tipo de cambio del formulario.
--
--  ── LOS 65 ÍTEMS VACÍOS NO SE CARGAN ──
--  El formulario de DAFO trae su plantilla entera y deja en blanco lo que no se
--  usó («Secretaria(s)», «Telefonía fija», «Director de casting»…): salen con
--  cantidad 0 y costo 0. Cargarlos llenaría la conciliación de líneas que no
--  significan nada. Nueve rubros quedan así en cero y desaparecen: 1.4, 2.4,
--  2.5, 3.3, 3.5, 3.9, 3.10 y 4.2. Mismo criterio que db/presupuesto-po003.sql.
--
--  ── DE DÓNDE SALEN LAS CIFRAS DEL FINANCIAMIENTO (no del formulario) ──
--  El expediente guardado NO sirve para esto, y hay que decirlo porque leerlo
--  literal lleva a dos cifras equivocadas:
--    · Declara «Monto a financiar con el Estímulo Económico = 0» y «con otras
--      fuentes = el importe íntegro» en las 148 filas, y el campo «Monto en
--      soles solicitado al Ministerio de Cultura» también en 0.00. Es la
--      distribución sin llenar, no un dato.
--    · Y en la tabla de fuentes teclea S/ 525,735 —el total del presupuesto—
--      en la casilla del Ministerio, con lo que las fuentes suman S/ 651,470
--      contra un presupuesto de S/ 525,735.
--
--  Lo que manda es la CARTA que la empresa envió al Ministerio: costo total
--  S/ 525,735.00, apoyo máximo del Ministerio para esta etapa S/ 400,000.00 y
--  compromiso formal de Pacha Apus Plus de cubrir la diferencia de
--  S/ 125,735.00. Coincide con el `monto_adjudicado = 400,000` que ya está en
--  la base, y 400,000 + 125,735 = 525,735 exacto — el total del presupuesto por
--  un tercer camino. Eso es lo que va en `fuentes`, las dos «Confirmada».
--
--  ── EL REPARTO DE LA CONTRAPARTIDA QUEDA PENDIENTE, Y A PROPÓSITO ──
--  `otras` va en 0 en los 83 ítems. No es que la empresa no ponga nada: es que
--  la carta compromete el AGREGADO (125,735) y no dice qué gastos concretos
--  paga la empresa. Repartirlo a ojo aquí sería inventar el dato que después
--  se rinde ante DAFO.
--  Consecuencia mientras tanto: la pantalla deriva estímulo = total − otras
--  (`estimuloDe` en components/Presupuesto.tsx) y dará S/ 525,735, que sobra
--  125,735 sobre lo adjudicado. El paso 3b lo mide y lo dice en una cifra. Se
--  arregla asignando `otras` ítem por ítem desde /fondo —la columna es
--  editable— hasta que sumen 125,735; ahí el estímulo cae a 400,000 solo.
--  La categoría es Documental → tope de estímulo 100% (`topeEstimuloDe`), así
--  que el medidor NO va a dar una alarma falsa por esto mientras tanto.
--
--  ── DOS AJUSTES DE VOCABULARIO EN `fuentes`, NINGUNO DE CIFRA ──
--  El estado «Confirmado» del formulario se guarda como «Confirmada» y el país
--  «PERU» como «Perú»: son los valores del catálogo de la aplicación
--  (ESTADOS_FUENTE en lib/rubros.ts). Con el texto crudo el desplegable no
--  engancha y la fila se ve rota.
--
--  ── ANTES DE CORRER ESTO: EL CATÁLOGO DE RUBROS ──
--  Los 32 rubros de este formulario NO existían en lib/rubros.ts. Sin el preset
--  nuevo, `components/Presupuesto.tsx` filtra por `i.rubro === r.clave` y los
--  83 ítems se cargan INVISIBLES: la pantalla sale vacía y parece que no se
--  cargó nada — y no da error.
--  Ya está hecho: `RUBROS_FICCION_DOC` en lib/rubros.ts, registrado para
--  «Producción audiovisual» y «Documental». La convocatoria de PO-001 es
--  Documental (verificado en el paso 1 el 21/08/2026), así que engancha.
--  Despliega ese cambio antes o a la vez que esta carga.
--
--  ── SOBRESCRIBE ──
--  `presupuesto` es una sola columna jsonb: esto la reemplaza entera. Al correr
--  el paso 1 el 21/08/2026 había 0 ítems y 0 versiones guardadas: no se pisa
--  nada. Si lo corres de nuevo más adelante, el paso 1 vuelve a decírtelo, y si
--  hubiera una versión vigente fijada sigue viva en `version_fondo`, que es
--  justo para lo que existe.
--
--  Correr en: Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · QUÉ HAY AHORA (antes de sobrescribir)
--     Si `items_actuales` no es nulo y no es 0, PARA y mira qué había.
--     `categoria` decide si el preset de rubros engancha: tiene que ser
--     «Documental» o «Producción audiovisual». Si sale NULL, cárgasela a la
--     convocatoria primero — sin ella `rubrosDe()` cae a los 4 rubros
--     genéricos y estos 32 no se pintan.
-- ------------------------------------------------------------
select p.codigo,
       pr.nombre  as proyecto,
       e.nombre   as empresa,
       c.nombre   as convocatoria,
       c.anio,
       c.categoria,
       p.estado,
       p.monto_adjudicado,
       jsonb_array_length(coalesce(p.presupuesto->'items', '[]'::jsonb)) as items_actuales,
       (select coalesce(sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric), 0)
          from jsonb_array_elements(coalesce(p.presupuesto->'items','[]'::jsonb)) i) as total_actual,
       (select count(*) from version_fondo v
         where v.postulacion_id = p.id and v.tipo = 'presupuesto') as versiones_guardadas
  from postulaciones p
  join proyectos     pr on pr.id = p.proyecto_id
  join convocatorias c  on c.id  = p.convocatoria_id
  join empresas      e  on e.id  = p.empresa_id
 where p.codigo = 'PO-001';

-- Si esta consulta no devuelve exactamente UNA fila, PARA. No sigas.

-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     Descomenta las tres líneas y corre. Resuelto por código, nunca por UUID
--     pegado a mano: si 'PO-001' no existiera, no escribe nada en vez de
--     escribirle el presupuesto a un fondo ajeno.
-- ------------------------------------------------------------
-- update postulaciones
--    set presupuesto = '{"tipo_cambio": 3.65, "items": [{"id": "1.1.1", "rubro": "gen_seguros_juridicos", "concepto": "Asesoría legal y gastos legales", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "1.1.2", "rubro": "gen_seguros_juridicos", "concepto": "Gastos de timbre y notaría", "unidad": "Paquete", "cantidad": 1, "costo_unit": 2000, "otras": 0}, {"id": "1.1.3", "rubro": "gen_seguros_juridicos", "concepto": "Gastos de transacciones, transferencias bancarias y otras", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1000, "otras": 0}, {"id": "1.1.4", "rubro": "gen_seguros_juridicos", "concepto": "Seguros contra accidentes para los trabajadores del audiovisual", "unidad": "Paquete", "cantidad": 21, "costo_unit": 250, "otras": 0}, {"id": "1.2.1", "rubro": "gen_contables", "concepto": "Asesoría Contable del Proyecto", "unidad": "Paquete", "cantidad": 1, "costo_unit": 2500, "otras": 0}, {"id": "1.2.3", "rubro": "gen_contables", "concepto": "Contador(es) y asistente contable", "unidad": "Meses", "cantidad": 24, "costo_unit": 300, "otras": 0}, {"id": "1.3.1", "rubro": "gen_admin_oficina", "concepto": "Alquiler oficina", "unidad": "Paquete", "cantidad": 24, "costo_unit": 300, "otras": 0}, {"id": "1.3.2", "rubro": "gen_admin_oficina", "concepto": "Servicios públicos (luz, agua, gas)", "unidad": "Meses", "cantidad": 24, "costo_unit": 250, "otras": 0}, {"id": "1.3.5", "rubro": "gen_admin_oficina", "concepto": "Gastos de conexión a internet", "unidad": "Meses", "cantidad": 24, "costo_unit": 150, "otras": 0}, {"id": "1.3.6", "rubro": "gen_admin_oficina", "concepto": "Insumos de oficina", "unidad": "Meses", "cantidad": 24, "costo_unit": 100, "otras": 0}, {"id": "2.1.1", "rubro": "pre_produccion", "concepto": "Productora", "unidad": "Meses", "cantidad": 2, "costo_unit": 3000, "otras": 0}, {"id": "2.1.4", "rubro": "pre_produccion", "concepto": "Asistente(s) de producción", "unidad": "Meses", "cantidad": 2, "costo_unit": 2000, "otras": 0}, {"id": "2.2.1", "rubro": "pre_direccion", "concepto": "Directora Responsable", "unidad": "Meses", "cantidad": 2, "costo_unit": 3000, "otras": 0}, {"id": "2.2.2", "rubro": "pre_direccion", "concepto": "Asistente de Dirección", "unidad": "Meses", "cantidad": 2, "costo_unit": 2000, "otras": 0}, {"id": "2.2.4", "rubro": "pre_direccion", "concepto": "Investigador", "unidad": "Paquete", "cantidad": 1, "costo_unit": 4000, "otras": 0}, {"id": "2.3.1", "rubro": "pre_scouting", "concepto": "Scout de locación", "unidad": "Paquete", "cantidad": 3, "costo_unit": 2000, "otras": 0}, {"id": "2.6.1", "rubro": "pre_pruebas_camara", "concepto": "Pruebas cámara", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "2.7.1", "rubro": "pre_logistica", "concepto": "Transporte personas y carga terrestre", "unidad": "Paquete", "cantidad": 3, "costo_unit": 1000, "otras": 0}, {"id": "2.7.4", "rubro": "pre_logistica", "concepto": "Alimentación", "unidad": "Paquete", "cantidad": 3, "costo_unit": 1000, "otras": 0}, {"id": "2.7.5", "rubro": "pre_logistica", "concepto": "Alojamiento", "unidad": "Paquete", "cantidad": 3, "costo_unit": 2000, "otras": 0}, {"id": "2.7.6", "rubro": "pre_logistica", "concepto": "Gastos de viaje", "unidad": "Paquete", "cantidad": 3, "costo_unit": 1000, "otras": 0}, {"id": "2.8.1", "rubro": "pre_permisos", "concepto": "Trámites y Permisos", "unidad": "Paquete", "cantidad": 3, "costo_unit": 1500, "otras": 0}, {"id": "3.1.1", "rubro": "prod_direccion", "concepto": "Directora Responsable", "unidad": "Meses", "cantidad": 8, "costo_unit": 3500, "otras": 0}, {"id": "3.1.2", "rubro": "prod_direccion", "concepto": "Asistente de dirección", "unidad": "Meses", "cantidad": 5, "costo_unit": 2000, "otras": 0}, {"id": "3.1.4", "rubro": "prod_direccion", "concepto": "Técnico de Datos", "unidad": "Días", "cantidad": 29, "costo_unit": 100, "otras": 0}, {"id": "3.2.1", "rubro": "prod_produccion", "concepto": "Productora", "unidad": "Meses", "cantidad": 8, "costo_unit": 3000, "otras": 0}, {"id": "3.2.2", "rubro": "prod_produccion", "concepto": "Coordinador de Logística", "unidad": "Paquete", "cantidad": 3, "costo_unit": 2000, "otras": 0}, {"id": "3.2.4", "rubro": "prod_produccion", "concepto": "Asistente(s) de producción", "unidad": "Meses", "cantidad": 5, "costo_unit": 2000, "otras": 0}, {"id": "3.4.1", "rubro": "prod_fotografia", "concepto": "Director de fotografía", "unidad": "Paquete", "cantidad": 1, "costo_unit": 10000, "otras": 0}, {"id": "3.4.2", "rubro": "prod_fotografia", "concepto": "Operador de cámara 01", "unidad": "Días", "cantidad": 29, "costo_unit": 300, "otras": 0}, {"id": "3.4.3", "rubro": "prod_fotografia", "concepto": "Operador de Drone", "unidad": "Días", "cantidad": 7, "costo_unit": 350, "otras": 0}, {"id": "3.4.4", "rubro": "prod_fotografia", "concepto": "Asistente de cámara II", "unidad": "Días", "cantidad": 29, "costo_unit": 100, "otras": 0}, {"id": "3.4.5", "rubro": "prod_fotografia", "concepto": "Operador de Cámara 02", "unidad": "Días", "cantidad": 29, "costo_unit": 300, "otras": 0}, {"id": "3.6.1", "rubro": "prod_sonido", "concepto": "Sonidista", "unidad": "Días", "cantidad": 29, "costo_unit": 200, "otras": 0}, {"id": "3.6.3", "rubro": "prod_sonido", "concepto": "Microfonista", "unidad": "Días", "cantidad": 29, "costo_unit": 100, "otras": 0}, {"id": "3.7.1", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Cámara Sony FX30", "unidad": "Días", "cantidad": 29, "costo_unit": 300, "otras": 0}, {"id": "3.7.2", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Sony a6700", "unidad": "Días", "cantidad": 29, "costo_unit": 250, "otras": 0}, {"id": "3.7.3", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Lentes para Sony FX30 (Sigma 18-50mm f/2.8 DC DN - Sigma 56mm f/1.4 DC DN)", "unidad": "Días", "cantidad": 29, "costo_unit": 180, "otras": 0}, {"id": "3.7.4", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Lente para Sony a6700 (Sony 10-20mm f/4 PZ G - ony 35mm f/1.8 OSS)", "unidad": "Días", "cantidad": 29, "costo_unit": 150, "otras": 0}, {"id": "3.7.5", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Røde NTG3", "unidad": "Días", "cantidad": 29, "costo_unit": 70, "otras": 0}, {"id": "3.7.6", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler DJI Mic", "unidad": "Días", "cantidad": 29, "costo_unit": 70, "otras": 0}, {"id": "3.7.7", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Røde VideoMic NTG + Kit de Boompole, Pértiga, Deadcat, Shockmount", "unidad": "Días", "cantidad": 29, "costo_unit": 150, "otras": 0}, {"id": "3.7.8", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Sony MDR-7506", "unidad": "Días", "cantidad": 29, "costo_unit": 15, "otras": 0}, {"id": "3.7.9", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Manfrotto Befree Live", "unidad": "Días", "cantidad": 29, "costo_unit": 50, "otras": 0}, {"id": "3.7.10", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler DJI RS 3 Mini", "unidad": "Días", "cantidad": 29, "costo_unit": 200, "otras": 0}, {"id": "3.7.11", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Drone DJI Mini 3", "unidad": "Días", "cantidad": 7, "costo_unit": 250, "otras": 0}, {"id": "3.7.12", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Iluminación Luz Godox SL60W con Softbox Octagonal", "unidad": "Días", "cantidad": 29, "costo_unit": 110, "otras": 0}, {"id": "3.7.13", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler EcoFlow RIVER 2", "unidad": "Días", "cantidad": 29, "costo_unit": 250, "otras": 0}, {"id": "3.7.14", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler 6 tarjetas SD V90 de 128GB", "unidad": "Días", "cantidad": 29, "costo_unit": 200, "otras": 0}, {"id": "3.7.15", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler 8 Sony NP-FZ100", "unidad": "Días", "cantidad": 29, "costo_unit": 100, "otras": 0}, {"id": "3.7.16", "rubro": "prod_equipo_rodaje", "concepto": "Alquiler Laptop", "unidad": "Días", "cantidad": 29, "costo_unit": 250, "otras": 0}, {"id": "3.8.1", "rubro": "prod_materiales_arte", "concepto": "Compra Pequeños Consumibles de Producción (Cinta gaffer, clamps, plumones, bolsas de basura, etc.)", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1000, "otras": 0}, {"id": "3.11.1", "rubro": "prod_logistica", "concepto": "Transporte personas (5 viajes)", "unidad": "Paquete", "cantidad": 5, "costo_unit": 2000, "otras": 0}, {"id": "3.11.2", "rubro": "prod_logistica", "concepto": "Alquiler Radios", "unidad": "Días", "cantidad": 29, "costo_unit": 300, "otras": 0}, {"id": "3.11.3", "rubro": "prod_logistica", "concepto": "Enfermería y primeros auxilios", "unidad": "Paquete", "cantidad": 3, "costo_unit": 2500, "otras": 0}, {"id": "3.11.4", "rubro": "prod_logistica", "concepto": "Seguridad", "unidad": "Paquete", "cantidad": 3, "costo_unit": 2500, "otras": 0}, {"id": "3.11.5", "rubro": "prod_logistica", "concepto": "Alimentación *12 aprox.", "unidad": "Días", "cantidad": 29, "costo_unit": 360, "otras": 0}, {"id": "3.11.6", "rubro": "prod_logistica", "concepto": "Alojamiento equipo de rodaje y actores *12 aprox.", "unidad": "Días", "cantidad": 29, "costo_unit": 420, "otras": 0}, {"id": "3.11.7", "rubro": "prod_logistica", "concepto": "Imprevistos", "unidad": "Paquete", "cantidad": 3, "costo_unit": 3000, "otras": 0}, {"id": "4.1.1", "rubro": "post_edicion", "concepto": "Montaje", "unidad": "Meses", "cantidad": 11, "costo_unit": 2000, "otras": 0}, {"id": "4.1.2", "rubro": "post_edicion", "concepto": "Asistente de edición I", "unidad": "Meses", "cantidad": 11, "costo_unit": 1600, "otras": 0}, {"id": "4.1.4", "rubro": "post_edicion", "concepto": "Alquiler de equipos de edición", "unidad": "Meses", "cantidad": 11, "costo_unit": 500, "otras": 0}, {"id": "4.1.5", "rubro": "post_edicion", "concepto": "Licencia DaVinci Resolve Studio", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1060, "otras": 0}, {"id": "4.3.1", "rubro": "post_finalizacion", "concepto": "Conformación", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1500, "otras": 0}, {"id": "4.3.3", "rubro": "post_finalizacion", "concepto": "Etalonaje o dosificado", "unidad": "Paquete", "cantidad": 1, "costo_unit": 5000, "otras": 0}, {"id": "4.3.5", "rubro": "post_finalizacion", "concepto": "Colorización", "unidad": "Paquete", "cantidad": 1, "costo_unit": 10000, "otras": 0}, {"id": "4.3.6", "rubro": "post_finalizacion", "concepto": "Elaboración de piezas gráficas", "unidad": "Paquete", "cantidad": 1, "costo_unit": 2500, "otras": 0}, {"id": "4.3.7", "rubro": "post_finalizacion", "concepto": "Subtitulación (subtitulación, subtitulación DCP, spotting list, traducciones)", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "4.3.8", "rubro": "post_finalizacion", "concepto": "Subtítulos para personas con discapacidad auditiva (no incrustados) en formato .srt", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "4.3.9", "rubro": "post_finalizacion", "concepto": "Composición (diseño de títulos y créditos)", "unidad": "Paquete", "cantidad": 1, "costo_unit": 2000, "otras": 0}, {"id": "4.4.2", "rubro": "post_entrega", "concepto": "Copia 0 y posteriores", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1500, "otras": 0}, {"id": "4.4.3", "rubro": "post_entrega", "concepto": "Codificación DCP - DCI", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "4.4.4", "rubro": "post_entrega", "concepto": "Master DCP", "unidad": "Paquete", "cantidad": 1, "costo_unit": 2000, "otras": 0}, {"id": "4.4.5", "rubro": "post_entrega", "concepto": "Archivo master (HDCamSR u otros)", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1500, "otras": 0}, {"id": "4.4.6", "rubro": "post_entrega", "concepto": "Formatos varios", "unidad": "Paquete", "cantidad": 1, "costo_unit": 1000, "otras": 0}, {"id": "4.5.1", "rubro": "post_sonido", "concepto": "Edición de sonido", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "4.5.4", "rubro": "post_sonido", "concepto": "Mezcla final y codificación", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "4.6.1", "rubro": "post_musica", "concepto": "Composición de música original (composición y producción temas originales y música incidental)", "unidad": "Paquete", "cantidad": 3, "costo_unit": 10000, "otras": 0}, {"id": "4.7.1", "rubro": "post_trailer", "concepto": "Elaboración trailer", "unidad": "Paquete", "cantidad": 1, "costo_unit": 5000, "otras": 0}, {"id": "4.8.2", "rubro": "post_logistica", "concepto": "Proyecciones locales en las 3 comunidades", "unidad": "Paquete", "cantidad": 3, "costo_unit": 1500, "otras": 0}, {"id": "4.8.3", "rubro": "post_logistica", "concepto": "Imprevistos", "unidad": "Paquete", "cantidad": 1, "costo_unit": 3000, "otras": 0}, {"id": "4.8.4", "rubro": "post_logistica", "concepto": "Gastos de viaje para entrega de Material Final", "unidad": "Paquete", "cantidad": 2, "costo_unit": 1000, "otras": 0}, {"id": "4.9.1", "rubro": "post_responsable", "concepto": "Directora", "unidad": "Meses", "cantidad": 14, "costo_unit": 3000, "otras": 0}], "fuentes": [{"id": "f1", "fuente": "MINISTERIO DE CULTURA", "pais": "Perú", "estado": "Confirmada", "importe": 400000}, {"id": "f2", "fuente": "PACHA APUS PLUS E.I.R.L.", "pais": "Perú", "estado": "Confirmada", "importe": 125735}]}'::jsonb
--  where codigo = 'PO-001';

-- ------------------------------------------------------------
-- 3 · VERIFICAR — 83 ítems, S/ 525,735.00, tipo de cambio 3.65
--     `financiamiento` debe dar 525,735.00 y cuadrar con `total_soles`.
--     `contrapartida` dará 0.00: es el reparto pendiente, ver la cabecera.
-- ------------------------------------------------------------
select jsonb_array_length(presupuesto->'items') as items,
       (presupuesto->>'tipo_cambio')::numeric   as tipo_cambio,
       (select sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric)
          from jsonb_array_elements(presupuesto->'items') i) as total_soles,
       (select sum((i->>'otras')::numeric)
          from jsonb_array_elements(presupuesto->'items') i) as contrapartida,
       (select sum((f->>'importe')::numeric)
          from jsonb_array_elements(presupuesto->'fuentes') f) as financiamiento
  from postulaciones
 where codigo = 'PO-001';

-- ------------------------------------------------------------
-- 3b · EL ESTÍMULO DERIVADO CONTRA LO ADJUDICADO
--      `por_asignar` es cuánta contrapartida falta repartir entre los ítems.
--      Hoy tiene que dar 125,735.00. El día que alguien termine de asignar
--      `otras` desde /fondo tiene que dar 0.00 — y cualquier otra cifra
--      significa que se asignó de más o de menos.
--      Esta es la consulta que hay que volver a correr después de tocar la
--      columna `otras`, y la única forma barata de saber que quedó bien.
-- ------------------------------------------------------------
select p.monto_adjudicado,
       x.total,
       x.otras                                as contrapartida_asignada,
       x.total - x.otras                      as estimulo_derivado,
       x.total - x.otras - p.monto_adjudicado as por_asignar
  from postulaciones p
 cross join lateral (
   select sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric) as total,
          sum((i->>'otras')::numeric)                                  as otras
     from jsonb_array_elements(p.presupuesto->'items') i) x
 where p.codigo = 'PO-001';

-- ------------------------------------------------------------
-- 3c · TODOS LOS RUBROS CARGADOS TIENEN CLAVE CONOCIDA
--      Tiene que devolver los 23 rubros con monto, y ninguna clave que no esté
--      en RUBROS_FICCION_DOC. Una clave suelta = ítems invisibles en la
--      pantalla, que no falla con un error: enseña menos y convence.
-- ------------------------------------------------------------
select i->>'rubro' as rubro,
       count(*)    as items,
       sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric) as monto
  from postulaciones p, jsonb_array_elements(p.presupuesto->'items') i
 where p.codigo = 'PO-001'
 group by 1
 order by 3 desc;

-- ------------------------------------------------------------
-- 4 · EL PRESUPUESTO CONTRA LO YA GASTADO
--     La consulta por la que todo lo anterior valía la pena: lo presupuestado
--     por rubro al lado de lo que se lleva girado en recibos. Los RHE sin
--     `rubro_item` asignado caen en su propia fila — asignarlos desde /fondo es
--     lo que hará que esta tabla hable rubro por rubro.
-- ------------------------------------------------------------
select coalesce(r.rubro, g.rubro_item, '(sin rubro)') as rubro,
       coalesce(r.presupuestado, 0) as presupuestado,
       coalesce(g.girado, 0)        as girado_rhe,
       coalesce(r.presupuestado, 0) - coalesce(g.girado, 0) as saldo
  from (
    select i->>'rubro' as rubro,
           sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric) as presupuestado
      from postulaciones p, jsonb_array_elements(p.presupuesto->'items') i
     where p.codigo = 'PO-001'
     group by 1) r
  full join (
    select rhe.rubro_item, sum(rhe.monto) as girado
      from rhe join postulaciones p on p.id = rhe.postulacion_id
     where p.codigo = 'PO-001'
     group by 1) g on g.rubro_item = r.rubro
 order by presupuestado desc;

-- ------------------------------------------------------------
--  APÉNDICE · las 32 claves de rubro de este presupuesto
--  (RUBROS_FICCION_DOC en lib/rubros.ts — sin ese preset no se pintan)
--
--    cod   clave                    nombre en el formulario DAFO
--   1.1   gen_seguros_juridicos    SEGUROS, ASPECTOS JURÍDICOS Y FINANCIEROS
--   1.2   gen_contables            ASPECTOS CONTABLES
--   1.3   gen_admin_oficina        GASTOS ADMINISTRATIVOS Y DE OFICINA
--   1.4   gen_personal_admin       PERSONAL ADMINISTRATIVO Y SERVICIOS
--   2.1   pre_produccion           PRODUCCIÓN
--   2.2   pre_direccion            DIRECCIÓN Y JEFES DE ÁREA
--   2.3   pre_scouting             SCOUTING DE LOCACIONES
--   2.4   pre_casting              CASTING
--   2.5   pre_ensayos              ENSAYOS
--   2.6   pre_pruebas_camara       PRUEBAS DE CÁMARA
--   2.7   pre_logistica            LOGÍSTICA
--   2.8   pre_permisos             Permisos
--   3.1   prod_direccion           PERSONAL DIRECCIÓN
--   3.2   prod_produccion          PERSONAL PRODUCCIÓN
--   3.3   prod_personajes          PERSONAJES
--   3.4   prod_fotografia          PERSONAL DEPARTAMENTO DE FOTOGRAFÍA
--   3.5   prod_arte                PERSONAL DEPARTAMENTO DE ARTE
--   3.6   prod_sonido              PERSONAL DEPARTAMENTO DE SONIDO
--   3.7   prod_equipo_rodaje       EQUIPO DE RODAJE, ACCESORIOS Y MATERIALES
--   3.8   prod_materiales_arte     MATERIALES DE ARTE, ESCENOGRAFÍA, UTILERÍA, MAQUILLAJE Y VESTUARIO
--   3.9   prod_materiales_sonido   MATERIALES DE SONIDO
--   3.10  prod_locaciones          LOCACIONES
--   3.11  prod_logistica           LOGÍSTICA
--   4.1   post_edicion             EDICIÓN
--   4.2   post_laboratorio         LABORATORIO
--   4.3   post_finalizacion        FINALIZACIÓN
--   4.4   post_entrega             ENTREGA (incluye película y tráiler)
--   4.5   post_sonido              SONIDO (incluye película y tráiler)
--   4.6   post_musica              MÚSICA
--   4.7   post_trailer             TRAILER
--   4.8   post_logistica           LOGÍSTICA
--   4.9   post_responsable         Directora responsable del Proyecto
-- ------------------------------------------------------------
