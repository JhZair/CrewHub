-- ============================================================
--  PRESUPUESTO POSTULADO — PO-003 · Chaccu: Entre Lana y Tradición
--
--  Fuente: PresupuestoChaccuDAFO-Plataforma.htm, la página guardada de la
--  Plataforma Virtual de Trámites del Ministerio. Se leyó la tabla
--  `tbl_presupuesto` y se generó este archivo: nada se transcribió a mano.
--
--  67 ítems · S/ 200,000.00 — que es exactamente el estímulo otorgado.
--
--  ── LAS TRES COMPROBACIONES QUE YA PASARON ──
--  1. La suma de los 67 ítems da S/ 200,000.00.
--  2. Coincide con el total de las dos CATEGORÍAS que imprime la plataforma
--     (1 · S/ 8,050.00 + 2 · S/ 191,950.00).
--  3. Y con la suma de los nueve RUBROS por separado.
--  Además, en los 67 ítems, cantidad × costo unitario da exactamente el
--  total impreso: ni un redondeo suelto.
--
--  Tres comprobaciones que cuadran desde ángulos distintos es lo que separa
--  «lo copié bien» de «creo que lo copié bien».
--
--  ── LOS 8 ÍTEMS VACÍOS NO SE CARGAN ──
--  El formulario de DAFO trae su plantilla entera y deja en blanco lo que no
--  se usó («Telefonía fija», «Secretaria(s)»…): salen con cantidad 0 y costo
--  0. Cargarlos llenaría la conciliación de líneas que no significan nada y
--  harían parecer que faltan gastos donde nunca los hubo.
--
--  ── SOBRESCRIBE ──
--  `presupuesto` es una sola columna jsonb: esto la reemplaza entera. Si ya
--  había algo cargado a mano, el paso 1 lo enseña ANTES de pisarlo — y si
--  había una versión vigente fijada, sigue viva en `version_fondo`, que es
--  justo para lo que existe.
--
--  Correr en: Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · QUÉ HAY AHORA (antes de sobrescribir)
--     Si `items_actuales` no es nulo y no es 0, PARA y mira qué había.
-- ------------------------------------------------------------
select p.codigo,
       jsonb_array_length(coalesce(p.presupuesto->'items', '[]'::jsonb)) as items_actuales,
       (select coalesce(sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric), 0)
          from jsonb_array_elements(coalesce(p.presupuesto->'items','[]'::jsonb)) i) as total_actual,
       (select count(*) from version_fondo v
         where v.postulacion_id = p.id and v.tipo = 'presupuesto') as versiones_guardadas
  from postulaciones p
 where p.id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad' and p.codigo = 'PO-003';

-- ------------------------------------------------------------
-- 2 · ESCRIBIR
--     Descomenta y corre. El `and codigo` no es adorno: si el id fuera de otro
--     fondo, escribiría un presupuesto ajeno sin una sola queja.
-- ------------------------------------------------------------
-- update postulaciones
--    set presupuesto = '{"tipo_cambio": 3.6, "items": [{"id": "i1", "rubro": "juridicos_financieros", "concepto": "Asesoría legal y gastos legales", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1000.0, "otras": 0}, {"id": "i2", "rubro": "contables_admin", "concepto": "Asesoría Contable del Proyecto", "unidad": "Meses", "cantidad": 9.0, "costo_unit": 250.0, "otras": 0}, {"id": "i3", "rubro": "contables_admin", "concepto": "Contador(es) y asistente contable", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 3000.0, "otras": 0}, {"id": "i4", "rubro": "admin_oficina", "concepto": "Servicios públicos (luz, agua, gas)", "unidad": "Meses", "cantidad": 9.0, "costo_unit": 150.0, "otras": 0}, {"id": "i5", "rubro": "admin_oficina", "concepto": "Gastos de conexión a internet", "unidad": "Meses", "cantidad": 9.0, "costo_unit": 50.0, "otras": 0}, {"id": "i6", "rubro": "formativo", "concepto": "Acompañante del Área Formativa", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 12000.0, "otras": 0}, {"id": "i7", "rubro": "formativo", "concepto": "Asistente del Acompañante del Área Formativa - Audiovisual", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 7000.0, "otras": 0}, {"id": "i8", "rubro": "formativo", "concepto": "Equipamiento Taller - Fotocopias / impresiones.", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 300.0, "otras": 0}, {"id": "i9", "rubro": "formativo", "concepto": "Alquiler local para Capacitación Audiovisual", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1500.0, "otras": 0}, {"id": "i10", "rubro": "formativo", "concepto": "Asistente del Acompañante del Área Formativa - Narrativa", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 7000.0, "otras": 0}, {"id": "i11", "rubro": "recursos_tecnicos", "concepto": "Microfono para cámara Rode VideoMic NTG", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 1100.0, "otras": 0}, {"id": "i12", "rubro": "recursos_tecnicos", "concepto": "Estabilizador Zhiyun Crane M3S", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1500.0, "otras": 0}, {"id": "i13", "rubro": "recursos_tecnicos", "concepto": "Iluminación (SmallRig Pix M160)", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 800.0, "otras": 0}, {"id": "i14", "rubro": "recursos_tecnicos", "concepto": "Cortavientos para VideoMic NTG RODE WS11", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 200.0, "otras": 0}, {"id": "i15", "rubro": "recursos_tecnicos", "concepto": "Rebotador de luz (Neewer 5en1 150x200cm)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 200.0, "otras": 0}, {"id": "i16", "rubro": "recursos_tecnicos", "concepto": "Audífonos (JBL Quantum 50)", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 100.0, "otras": 0}, {"id": "i17", "rubro": "recursos_tecnicos", "concepto": "Power Bank 20000 (Xiaomi 50w)", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 250.0, "otras": 0}, {"id": "i18", "rubro": "recursos_tecnicos", "concepto": "SmallRig Jaula universal para Móvil", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 600.0, "otras": 0}, {"id": "i19", "rubro": "recursos_tecnicos", "concepto": "Kit de sujetadores, tensores, Adaptadores Tornillos1/4", "unidad": "Paquete", "cantidad": 4.0, "costo_unit": 50.0, "otras": 0}, {"id": "i20", "rubro": "recursos_tecnicos", "concepto": "Grabadora portátil Zoom H4n", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 800.0, "otras": 0}, {"id": "i21", "rubro": "recursos_tecnicos", "concepto": "Micrófono de condensador (RODE NT55)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1400.0, "otras": 0}, {"id": "i22", "rubro": "recursos_tecnicos", "concepto": "Cortavientos de suspensión para micrófonos shotgun Rode BLIMP", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1250.0, "otras": 0}, {"id": "i23", "rubro": "recursos_tecnicos", "concepto": "Boom para Micrófono Shotgun RODE Micro Boompole", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 200.0, "otras": 0}, {"id": "i24", "rubro": "recursos_tecnicos", "concepto": "Cable XLR 6m", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 80.0, "otras": 0}, {"id": "i25", "rubro": "recursos_tecnicos", "concepto": "Tarjeta de memoria SanDisk Extreme PRO SDXC UHS-I de 128 GB", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 150.0, "otras": 0}, {"id": "i26", "rubro": "recursos_tecnicos", "concepto": "Pilas Recargables Duracell De 2500 Mah", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 140.0, "otras": 0}, {"id": "i27", "rubro": "recursos_tecnicos", "concepto": "Audífonos JBL Tune 770NC", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 400.0, "otras": 0}, {"id": "i28", "rubro": "recursos_tecnicos", "concepto": "Drone - DJI Mini 4 Pro", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 5300.0, "otras": 0}, {"id": "i29", "rubro": "recursos_tecnicos", "concepto": "Batería DJI Mini 4 Pro", "unidad": "Paquete", "cantidad": 2.0, "costo_unit": 400.0, "otras": 0}, {"id": "i30", "rubro": "recursos_tecnicos", "concepto": "Trípode (SmallRig CT-20)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 400.0, "otras": 0}, {"id": "i31", "rubro": "recursos_tecnicos", "concepto": "Micrófono para Entrevistas (DJI MIC Microphone)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1200.0, "otras": 0}, {"id": "i32", "rubro": "recursos_tecnicos", "concepto": "Sistema de Intercomunicador (Hollyland Solidcom C1-6S)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 8000.0, "otras": 0}, {"id": "i33", "rubro": "recursos_tecnicos", "concepto": "Barra de Sonido JBL BAR 1000", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 3500.0, "otras": 0}, {"id": "i34", "rubro": "recursos_tecnicos", "concepto": "Proyector - Optoma UHD506 3400L 4K", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 5000.0, "otras": 0}, {"id": "i35", "rubro": "recursos_tecnicos", "concepto": "Cámara Protagonista Principal (Móvil S24 Ultra) 1Tb Almacenamiento", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 6200.0, "otras": 0}, {"id": "i36", "rubro": "recursos_tecnicos", "concepto": "Cámara Personaje 02 (Móvil S24 Ultra) 1Tb Almacenamiento", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 6200.0, "otras": 0}, {"id": "i37", "rubro": "recursos_tecnicos", "concepto": "Cámara Personaje 03 (Móvil S24 Ultra) 1Tb Almacenamiento", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 6200.0, "otras": 0}, {"id": "i38", "rubro": "recursos_tecnicos", "concepto": "Cámara Planos Generales y Tomas de Apoyo (Móvil S24 Ultra) 1Tb Almacenamiento", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 6200.0, "otras": 0}, {"id": "i39", "rubro": "recursos_tecnicos", "concepto": "DJI Lavalier Mic (para las 3 cámaras y sus respectivos Personajes)", "unidad": "Paquete", "cantidad": 3.0, "costo_unit": 220.0, "otras": 0}, {"id": "i40", "rubro": "equipo_proyecto", "concepto": "Responsable del proyecto", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 15000.0, "otras": 0}, {"id": "i41", "rubro": "equipo_proyecto", "concepto": "Productor", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 9000.0, "otras": 0}, {"id": "i42", "rubro": "equipo_proyecto", "concepto": "Camarógrafos de 03 Personajes", "unidad": "Paquete", "cantidad": 3.0, "costo_unit": 2500.0, "otras": 0}, {"id": "i43", "rubro": "equipo_proyecto", "concepto": "Operador de Drone", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i44", "rubro": "equipo_proyecto", "concepto": "Sonidista", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1500.0, "otras": 0}, {"id": "i45", "rubro": "equipo_proyecto", "concepto": "Narrador  (Voz en Off)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1200.0, "otras": 0}, {"id": "i46", "rubro": "equipo_proyecto", "concepto": "Encargado de Distribución y Difusión", "unidad": "Meses", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i47", "rubro": "equipo_proyecto", "concepto": "Traductora / Interprete", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1500.0, "otras": 0}, {"id": "i48", "rubro": "equipo_proyecto", "concepto": "Investigadora / Consultora local", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 6000.0, "otras": 0}, {"id": "i49", "rubro": "equipo_proyecto", "concepto": "Entrevistadora", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1500.0, "otras": 0}, {"id": "i50", "rubro": "equipo_proyecto", "concepto": "Editor", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i51", "rubro": "equipo_proyecto", "concepto": "Agente de Seguridad para Equipos", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 1000.0, "otras": 0}, {"id": "i52", "rubro": "equipo_proyecto", "concepto": "Colorista", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i53", "rubro": "equipo_proyecto", "concepto": "Coordinador de Logística", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 7000.0, "otras": 0}, {"id": "i54", "rubro": "equipo_proyecto", "concepto": "Banda de Músicos \"Instrumental Kuntury\"", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 4000.0, "otras": 0}, {"id": "i55", "rubro": "equipo_proyecto", "concepto": "Camarografo Registro Continuo (Planos Generales, Tomas de Apoyo)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i56", "rubro": "equipo_proyecto", "concepto": "Asistente de Equipo del Proyecto", "unidad": "Paquete", "cantidad": 2.0, "costo_unit": 1000.0, "otras": 0}, {"id": "i57", "rubro": "diseno", "concepto": "Elaboración de  piezas gráficas", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i58", "rubro": "logistica", "concepto": "Transporte personas y carga terrestre", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 3000.0, "otras": 0}, {"id": "i59", "rubro": "logistica", "concepto": "Alimentación del Equipo Técnico", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 6000.0, "otras": 0}, {"id": "i60", "rubro": "logistica", "concepto": "Alojamiento del Acompañante y asistentes del área formativa", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 3000.0, "otras": 0}, {"id": "i61", "rubro": "logistica", "concepto": "Gastos de viaje (Para Acompañante y Asistentes)", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i62", "rubro": "logistica", "concepto": "Seguro", "unidad": "Paquete", "cantidad": 22.0, "costo_unit": 150.0, "otras": 0}, {"id": "i63", "rubro": "logistica", "concepto": "Enfermería y Primeros Auxilios", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 2000.0, "otras": 0}, {"id": "i64", "rubro": "logistica", "concepto": "Imprevistos", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 3570.0, "otras": 0}, {"id": "i65", "rubro": "socializacion", "concepto": "Alquiler de auditorio", "unidad": "Días", "cantidad": 1.0, "costo_unit": 400.0, "otras": 0}, {"id": "i66", "rubro": "socializacion", "concepto": "Transporte y Logística", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 3000.0, "otras": 0}, {"id": "i67", "rubro": "socializacion", "concepto": "Catering", "unidad": "Paquete", "cantidad": 1.0, "costo_unit": 500.0, "otras": 0}], "fuentes": [{"id": "f1", "fuente": "Ministerio de Cultura", "pais": "Perú", "estado": "Por confirmar", "importe": 200000}]}'::jsonb
--  where id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
--    and codigo = 'PO-003';

-- ------------------------------------------------------------
-- 3 · VERIFICAR — debe dar 67 ítems y S/ 200,000.00
-- ------------------------------------------------------------
select jsonb_array_length(presupuesto->'items') as items,
       (select sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric)
          from jsonb_array_elements(presupuesto->'items') i) as total_soles,
       (select sum((f->>'importe')::numeric)
          from jsonb_array_elements(presupuesto->'fuentes') f) as financiamiento
  from postulaciones
 where id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad';

-- ------------------------------------------------------------
-- 4 · EL PRESUPUESTO CONTRA LO YA GASTADO
--     Esta es la consulta por la que todo lo anterior valía la pena: pone lo
--     presupuestado por rubro al lado de lo que se lleva girado en recibos.
--     Los RHE no tienen `rubro_item` asignado todavía, así que de momento el
--     cruce sale por el total — asignarlos desde /fondo es lo que hará que
--     esta tabla hable rubro por rubro.
-- ------------------------------------------------------------
select r.rubro,
       r.presupuestado,
       coalesce(g.girado, 0) as girado_rhe,
       r.presupuestado - coalesce(g.girado, 0) as saldo
  from (
    select i->>'rubro' as rubro,
           sum((i->>'cantidad')::numeric * (i->>'costo_unit')::numeric) as presupuestado
      from postulaciones p, jsonb_array_elements(p.presupuesto->'items') i
     where p.id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
     group by 1) r
  left join (
    select rubro_item, sum(monto) as girado
      from rhe where postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
     group by 1) g on g.rubro_item = r.rubro
 order by r.presupuestado desc;
