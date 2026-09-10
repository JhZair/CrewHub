-- ════════════════════════════════════════════════════════════════════════════
-- 📖 WIKI TÉCNICA DE REALIZACIÓN AUDIOVISUAL — esquema del módulo /wiki
--
-- Idempotente: se puede correr varias veces en el SQL Editor de Supabase.
--
-- REGLAS (de guia-wiki-audiovisual.md, sección 9):
--   · Áreas y secciones son DATOS, no valores fijos en el código: sumar un área
--     nueva es insertar una fila, no reprogramar.
--   · La wiki NO crea una tabla de proyectos. La relación página ↔ proyecto vive
--     en `wiki_pagina_proyecto`, que apunta al id de `proyectos`; los datos del
--     proyecto se leen siempre de su tabla original.
--   · Cada página guarda el encabezado de metadatos (3.1), el contenido en
--     Markdown y su historial de cambios.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. ÁREAS ────────────────────────────────────────────────────────────────
-- El id es el slug de la URL (/wiki/documental). `icono` es el nombre de uno de
-- los íconos del módulo (components/wiki/Iconos.tsx). Dos colores: uno para el
-- tema claro y otro para el oscuro.
create table if not exists wiki_areas (
  id            text primary key,
  nombre        text not null,
  descripcion   text,
  icono         text default 'layers',
  color         text not null default '#56666E',
  color_oscuro  text not null default '#98A9B0',
  estado        text not null default 'por-definir',  -- definida | propuesta | por-definir
  orden         int  not null default 100,
  creado_en     timestamptz default now()
);

-- ── 2. SECCIONES DE CADA ÁREA ──────────────────────────────────────────────
create table if not exists wiki_secciones (
  id          uuid primary key default gen_random_uuid(),
  area_id     text not null references wiki_areas(id) on delete cascade,
  numero      int  not null,
  nombre      text not null,
  descripcion text,
  unique (area_id, numero)
);

-- ── 3. PÁGINAS ─────────────────────────────────────────────────────────────
create table if not exists wiki_paginas (
  id            uuid primary key default gen_random_uuid(),
  area_id       text not null references wiki_areas(id),
  seccion_id    uuid references wiki_secciones(id) on delete set null,
  slug          text not null,                 -- minúsculas, sin tildes, guiones; único en el área
  titulo        text not null,
  tipo          text not null default 'tecnica',
    -- tecnica | concepto | problema | caso | fuente | profesional | herramienta | experiencia
  etiquetas     text[] not null default '{}',
  etapa         text,                          -- según el proceso del área
  nivel         int  not null default 2,       -- 1 | 2 | 3 | 4
  estado        text not null default 'pendiente',
    -- pendiente | investigacion | verificado | probado | recomendado | archivado
  preguntas     text[] not null default '{}',  -- problemas escritos como pregunta
  contenido     text not null default '',      -- Markdown (sección 8 de la guía)
  actualizado   date not null default current_date,
  creado_por    uuid references perfiles(id),
  creado_en     timestamptz default now(),
  editado_en    timestamptz default now(),
  -- Búsqueda: título, preguntas y etiquetas pesan más que el cuerpo.
  -- ⚠ No es columna GENERATED: `array_to_string` es STABLE, no IMMUTABLE, y
  -- Postgres rechaza la expresión (42P17). La mantiene el trigger de abajo.
  busqueda      tsvector,
  unique (area_id, slug)
);
create index if not exists wiki_paginas_busqueda on wiki_paginas using gin (busqueda);
-- Mantiene `busqueda` al insertar o actualizar.
create or replace function wiki_paginas_busqueda() returns trigger language plpgsql as $$
begin
  new.busqueda :=
    setweight(to_tsvector('spanish', coalesce(new.titulo, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(array_to_string(new.preguntas, ' '), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(array_to_string(new.etiquetas, ' '), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(new.contenido, '')), 'C');
  return new;
end $$;
drop trigger if exists wiki_paginas_busqueda_t on wiki_paginas;
create trigger wiki_paginas_busqueda_t
  before insert or update of titulo, preguntas, etiquetas, contenido on wiki_paginas
  for each row execute function wiki_paginas_busqueda();

create index if not exists wiki_paginas_area on wiki_paginas (area_id, seccion_id);

-- ── 4. HISTORIAL DE CAMBIOS POR PÁGINA ─────────────────────────────────────
-- `fecha — qué cambió — por qué — fuente nueva` (sección 7 de la guía).
create table if not exists wiki_historial (
  id         uuid primary key default gen_random_uuid(),
  pagina_id  uuid not null references wiki_paginas(id) on delete cascade,
  fecha      date not null default current_date,
  cambio     text not null,
  motivo     text,
  fuente     text,
  autor_id   uuid references perfiles(id),
  creado_en  timestamptz default now()
);
create index if not exists wiki_historial_pagina on wiki_historial (pagina_id, creado_en desc);

-- ── 5. RELACIÓN PÁGINA ↔ PROYECTO (tabla intermedia) ───────────────────────
-- Se registra UNA sola vez y se ve desde los dos lados: la página muestra
-- «Proyectos donde se aplica» y la ficha del proyecto puede mostrar
-- «Conocimientos de la wiki» consultando esta misma tabla.
create table if not exists wiki_pagina_proyecto (
  id           uuid primary key default gen_random_uuid(),
  pagina_id    uuid not null references wiki_paginas(id) on delete cascade,
  proyecto_id  uuid not null references proyectos(id) on delete cascade,
  uso          text,                           -- para qué se usa en ese proyecto
  estado       text not null default 'evaluando',
    -- evaluando | planificado | aplicado | descartado
  nota         text,
  fecha        date not null default current_date,
  creado_por   uuid references perfiles(id),
  creado_en    timestamptz default now(),
  unique (pagina_id, proyecto_id)
);
create index if not exists wiki_pp_proyecto on wiki_pagina_proyecto (proyecto_id);

-- ── 6. ANOTACIONES PERSONALES ──────────────────────────────────────────────
-- Separadas del conocimiento documentado (3.7). Las escribe cada persona.
create table if not exists wiki_anotaciones (
  id         uuid primary key default gen_random_uuid(),
  pagina_id  uuid not null references wiki_paginas(id) on delete cascade,
  tipo       text not null default 'comentario',
    -- comentario | inspira | referente | visual | narrativo | sonoro | jugabilidad
    -- | investigar | aplicar | evitar
  texto      text not null,
  autor_id   uuid references perfiles(id),
  creado_en  timestamptz default now()
);
create index if not exists wiki_anotaciones_pagina on wiki_anotaciones (pagina_id, creado_en);

-- ── 7. ENLACES [[...]] ENTRE PÁGINAS ───────────────────────────────────────
-- Se recalcula al guardar una página a partir de sus [[enlaces]]. Sirve para
-- «Mencionada en» (enlaces entrantes, también desde otras áreas). El destino se
-- guarda por área + título normalizado, porque [[Título]] enlaza por título y la
-- página destino puede no existir todavía.
create table if not exists wiki_enlaces (
  origen_id     uuid not null references wiki_paginas(id) on delete cascade,
  destino_area  text not null,
  destino_clave text not null,                 -- título o slug normalizado
  primary key (origen_id, destino_area, destino_clave)
);
create index if not exists wiki_enlaces_destino on wiki_enlaces (destino_area, destino_clave);

-- ── 8. SEGURIDAD: cualquier miembro autenticado lee y escribe ──────────────
alter table wiki_areas            enable row level security;
alter table wiki_secciones        enable row level security;
alter table wiki_paginas          enable row level security;
alter table wiki_historial        enable row level security;
alter table wiki_pagina_proyecto  enable row level security;
alter table wiki_anotaciones      enable row level security;
alter table wiki_enlaces          enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wiki_areas','wiki_secciones','wiki_paginas','wiki_historial',
                           'wiki_pagina_proyecto','wiki_anotaciones','wiki_enlaces'] loop
    execute format('drop policy if exists "wiki_leer" on %I', t);
    execute format('create policy "wiki_leer" on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists "wiki_crear" on %I', t);
    execute format('create policy "wiki_crear" on %I for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "wiki_editar" on %I', t);
    execute format('create policy "wiki_editar" on %I for update to authenticated using (true)', t);
    execute format('drop policy if exists "wiki_borrar" on %I', t);
    execute format('create policy "wiki_borrar" on %I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- ── 9. SEMILLA: áreas y secciones de la guía (Anexos A, B y C) ─────────────
insert into wiki_areas (id, nombre, descripcion, icono, color, color_oscuro, estado, orden) values
  ('comun',       'Común',       'Fundamentos que comparten todos los medios',              'layers',       '#56666E', '#98A9B0', 'definida',    1),
  ('documental',  'Documental',  'Realización documental, de la idea a la distribución',    'clapperboard', '#2F6B57', '#62B597', 'definida',    2),
  ('videojuegos', 'Videojuegos', 'Desarrollo de videojuegos, del concepto al postlanzamiento','gamepad',    '#6B4FA0', '#AE93DD', 'propuesta',   3),
  ('ficcion',     'Ficción',     'Arquitectura por definir',                                'film',         '#A1453A', '#E3897A', 'por-definir', 4),
  ('animacion',   'Animación',   'Arquitectura por definir',                                'palette',      '#A8741C', '#DDAA55', 'por-definir', 5),
  ('series',      'Series',      'Arquitectura por definir',                                'tv',           '#2D5C94', '#79A8E0', 'por-definir', 6),
  ('fotografia',  'Fotografía',  'Arquitectura por definir',                                'camera',       '#77694A', '#C2AF87', 'por-definir', 7)
on conflict (id) do nothing;

-- Anexo A — Común
insert into wiki_secciones (area_id, numero, nombre, descripcion) values
  ('comun', 1,  'Cámara, lentes y exposición', 'Fundamentos de cámara, sensores, lentes, exposición, profundidad de campo, movimiento, composición'),
  ('comun', 2,  'Iluminación', 'Luz natural y artificial, esquemas, temperatura de color, equipos'),
  ('comun', 3,  'Sonido', 'Micrófonos (lavalier, shotgun, boom), grabadoras, monitoreo, ruido, sincronización, mezcla'),
  ('comun', 4,  'Música y diseño sonoro', 'Fundamentos de música original y de librería, efectos, diseño sonoro'),
  ('comun', 5,  'Color y postproducción de imagen', 'Flujos de color, formatos, códecs, gestión de medios, entregables técnicos'),
  ('comun', 6,  'Producción, presupuesto y financiamiento', 'Presupuesto, cronograma, contrataciones, seguros, fondos y concursos públicos, coproducción'),
  ('comun', 7,  'Derechos y contratos', 'Derechos de autor, cesión de imagen, licencias de música, software, motores y recursos, contratos'),
  ('comun', 8,  'Representación cultural y comunidades', 'Consentimiento, representación de culturas y territorios, trabajo con comunidades, patrimonio'),
  ('comun', 9,  'Profesionales y autores', 'Fichas centradas en métodos y aportes técnicos'),
  ('comun', 10, 'Fuentes y bibliografía', 'Fichas de libros, artículos, charlas, videos, documentación oficial'),
  ('comun', 11, 'Herramientas, software y equipos', 'Conocimiento técnico sobre programas, motores y equipos (el inventario del equipo vive en su módulo de CrewHUB+)')
on conflict (area_id, numero) do nothing;

-- Anexo B — Documental
insert into wiki_secciones (area_id, numero, nombre, descripcion) values
  ('documental', 1,  'Idea y desarrollo', 'Idea, tema, pregunta documental, motivación, hipótesis, punto de vista, logline, sinopsis, tratamiento, nota de dirección, viabilidad'),
  ('documental', 2,  'Investigación', 'Histórica, periodística, de campo, territorial, social, de personajes y de archivos; fuentes primarias y secundarias; verificación; entrevistas de investigación'),
  ('documental', 3,  'Narrativa documental', 'Historia y argumento, conflicto, objetivos, obstáculos, transformación, estructura, tensión, revelación, manejo de información, tiempo, ritmo, final, estructuras no tradicionales'),
  ('documental', 4,  'Personajes y acceso', 'Selección de protagonistas, acceso, confianza, relación director-personaje, seguimiento en el tiempo, situaciones espontáneas'),
  ('documental', 5,  'Ética y relación con la realidad', 'Consentimiento, vulnerabilidad, privacidad, relaciones de poder, intervención vs. observación'),
  ('documental', 6,  'Preproducción', 'Planificación, equipo, locaciones, permisos, calendario, plan de rodaje'),
  ('documental', 7,  'Dirección', 'Dirigir personas reales; cuándo observar, preguntar o intervenir; provocar situaciones sin falsearlas; decisiones ante lo impredecible'),
  ('documental', 8,  'Entrevistas', 'Preparación, diseño de preguntas; entrevista abierta, estructurada, emocional, de investigación, caminada, en locación y grupal; composición, luz, sonido'),
  ('documental', 9,  'Rodaje', 'Registro observacional, cobertura, continuidad, timecode, metadatos, copias de seguridad, organización del material, diario de rodaje'),
  ('documental', 10, 'Fotografía documental', 'Cámara en mano, observación, baja luz, luz disponible, drone, composición en situaciones no controladas'),
  ('documental', 11, 'Sonido documental', 'Entrevistas, exteriores, viento, ambientes, wild tracks, room tone en locaciones reales'),
  ('documental', 12, 'Archivo', 'Fotos, video histórico, prensa, audio, documentos, cartas, material familiar, redes sociales, archivos institucionales. Flujo: encontrar → verificar → obtener → documentar → usar → derechos'),
  ('documental', 13, 'Animación y recreación', 'Animación, motion graphics, mapas, infografías, ilustración, recreación, dramatización: diferencias e implicaciones narrativas y éticas'),
  ('documental', 14, 'Montaje', 'Organización, transcripción, selección, assembly, rough cut, fine cut, estructura, escenas y secuencias, voz en off, silencio, construcción de significado'),
  ('documental', 15, 'Diseño sonoro y música', 'Aplicación documental del diseño sonoro, la música y el silencio'),
  ('documental', 16, 'Postproducción', 'Color, gráficos, subtítulos, master, entregables documentales'),
  ('documental', 17, 'Producción documental', 'Producción en comunidades y territorios remotos, logística, alimentación, alojamiento, seguridad, permisos de rodaje'),
  ('documental', 18, 'Derechos y autorizaciones', 'Cesión de imagen, archivo, material de terceros, locaciones, menores de edad, personas vulnerables en documental'),
  ('documental', 19, 'Festivales y distribución', 'Estrategia de festivales, estreno, distribución, plataformas, exhibición, material promocional'),
  ('documental', 20, 'Difusión y audiencias', 'Audiencias, impacto, difusión'),
  ('documental', 21, 'Casos de estudio', 'Organizados por lo que enseñan: entrevista, observacional, uso creativo de archivo, protagonistas no profesionales, rodajes de larga duración')
on conflict (area_id, numero) do nothing;

-- Anexo C — Videojuegos (propuesta inicial, por validar)
insert into wiki_secciones (area_id, numero, nombre, descripcion) values
  ('videojuegos', 1,  'Concepto y desarrollo', 'Idea, pilares de diseño, público, referencias, pitch, documento de diseño (GDD), viabilidad'),
  ('videojuegos', 2,  'Investigación', 'Juegos de referencia, investigación cultural, histórica y territorial, investigación con jugadores'),
  ('videojuegos', 3,  'Diseño de juego', 'Mecánicas, core loop, sistemas, progresión, dificultad, balance, economía'),
  ('videojuegos', 4,  'Diseño de niveles', 'Estructura de niveles, flujo, ritmo, guía del jugador, espacios'),
  ('videojuegos', 5,  'Narrativa interactiva', 'Narrativa ambiental, guion y diálogos, ramificaciones, personajes, construcción de mundo'),
  ('videojuegos', 6,  'Arte y dirección visual', 'Dirección de arte, concept art, 2D y 3D, animación de personajes, efectos visuales'),
  ('videojuegos', 7,  'Interfaz y experiencia de usuario', 'UI, UX, onboarding, tutoriales, accesibilidad'),
  ('videojuegos', 8,  'Programación y motor', 'Motores, arquitectura, herramientas, rendimiento, control de versiones'),
  ('videojuegos', 9,  'Audio para videojuegos', 'Música adaptativa, efectos, voces, middleware de audio, implementación'),
  ('videojuegos', 10, 'Prototipado', 'Prototipos rápidos, prototipos de mecánica, vertical slice'),
  ('videojuegos', 11, 'Pruebas y QA', 'Playtesting, registro de errores, métricas, pruebas de usabilidad'),
  ('videojuegos', 12, 'Producción de videojuegos', 'Metodologías, hitos (prototipo, vertical slice, alpha, beta, lanzamiento), planificación, equipo, presupuesto específico'),
  ('videojuegos', 13, 'Localización', 'Traducción, adaptación cultural, flujos de localización'),
  ('videojuegos', 14, 'Plataformas y publicación', 'PC, consolas, móviles, requisitos de tiendas y certificación, publishers'),
  ('videojuegos', 15, 'Marketing, comunidad y lanzamiento', 'Página de tienda, tráiler, prensa, festivales y ferias, comunidad'),
  ('videojuegos', 16, 'Postlanzamiento', 'Actualizaciones, parches, soporte, análisis de datos'),
  ('videojuegos', 17, 'Derechos y aspectos legales', 'Propiedad intelectual, licencias de motor y recursos, contratos, clasificación por edades'),
  ('videojuegos', 18, 'Casos de estudio', 'Organizados por lo que enseñan, a partir de postmortems, charlas y entrevistas documentadas')
on conflict (area_id, numero) do nothing;

-- Tiempo real (opcional): para que una página abierta se refresque al editarla.
-- alter publication supabase_realtime add table wiki_paginas;
