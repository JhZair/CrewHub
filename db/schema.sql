-- ============================================================
-- CrewHub+ by KAWSAY — Esquema de base de datos (Supabase/PostgreSQL)
-- Paradigma: la PUBLICACIÓN es el objeto central del sistema.
-- Todo lo demás (proyectos, empresas, personas, equipamiento,
-- vehículos, lugares, etiquetas...) se vincula a ella mediante
-- una relación polimórfica (tabla publicacion_vinculos).
--
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- 1. PERFILES (extiende auth.users de Supabase) ----------
-- El login con Google lo maneja Supabase Auth; aquí solo guardamos
-- los datos visibles del miembro del equipo.
create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         text,                          -- Productor, Sonidista, Editor...
  avatar_url  text,
  color       text default '#7c5cff',
  activo      boolean default true,
  creado_en   timestamptz default now()
);

-- Crear perfil automáticamente al registrarse con Google
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.email),
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil();

-- ---------- 2. ENTIDADES DE NEGOCIO ----------
-- Cada una es un catálogo simple. Se agregan campos según necesidad.

-- Campos tomados de la tabla PROYECTOS del Seatable (BD Productora
-- Cine Kawsay). Los folios existentes (P-038...) se conservan.
create table proyectos (
  id               uuid primary key default gen_random_uuid(),
  folio            text unique,              -- "P-038" (nunca renumerar)
  nombre           text not null,            -- nombre oficial
  nombre_corto     text,                     -- "Linderaje"
  tipo             text,                     -- documental | animacion | videojuego
                                             -- | ficcion | experimental
  etapa            text default 'idea',      -- idea | en_carpeta | desarrollo
                                             -- | preproduccion | produccion
                                             -- | postproduccion | finalizado
  estado_actividad text default 'activo',    -- activo | bloqueado | en_pausa | completado
  descripcion      text,
  imagen_url       text,
  color            text default '#a78bfa',
  creado_en        timestamptz default now()
);

-- Campos de _EQUIPO-Empresas: las 15+ empresas E-### vinculadas.
create table empresas (
  id           uuid primary key default gen_random_uuid(),
  codigo       text unique,                  -- "E-010-A-Wilkakalle"
  nombre       text not null,                -- nombre corto
  razon_social text,                         -- nombre legal completo
  tipo      text,                            -- eirl | sac | asociacion | ong | municipalidad
  ruc       text,
  estado    text default 'activa',
  creado_en timestamptz default now()
);

-- Cargos de personas en empresas (de _EQUIPO-Empresas):
-- representante legal, presidente/a, secretario/a... con vigencia.
create table empresa_miembros (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  persona_id   uuid not null,                -- references personas(id); se crea después
  cargo        text,                         -- "Representante Legal", "Presidente/a",
                                             -- "Socio/a", "Asociado/a", "Secretario/a",
                                             -- "Vicepresidente/a", "Gerente General"
  fecha_inicio date,
  fecha_fin    date,
  estado       text default 'activo',        -- activo | inactivo
  creado_en    timestamptz default now()
);

-- Convocatorias / fondos concursables. Campos tomados de
-- FondosYCompromisos y F_ConcursosDAFO del Seatable.
-- IMPORTANTE: los montos EJECUTADOS y saldos siguen calculándose
-- en Seatable (una sola verdad financiera); aquí viven los datos
-- maestros del compromiso.
create table convocatorias (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null,      -- "042-2024-DAFO-P-031-Chaccu"
  codigo_acta            text,               -- código de acta de compromiso
  nombre                 text not null,      -- "DAFO Cine Indígena 2024"
  institucion            text default 'DAFO',
  proyecto_id            uuid references proyectos(id),
  empresa_id             uuid references empresas(id),  -- empresa beneficiada
  monto_adjudicado       numeric(12,2),      -- S/ 200,000.00
  aporte_propio          numeric(12,2),      -- S/ 53,900.00
  limite_dj_monto        numeric(12,2),      -- S/ 50,000.00
  limite_dj_pct          numeric(5,2),       -- 25.00
  fecha_firma_acta       date,
  fecha_entrega_estimulo date,
  fecha_limite_rendicion date,
  fecha_prorroga         date,
  estado                 text default 'abierta',
    -- planificada | abierta | en_evaluacion | con_resultados | finalizada | cancelada
  anio                   int,
  cuenta_bancaria        text,
  eventos_concurso       jsonb default '{}',
    -- fechas de eventos ancla a medida que ocurren; al registrarse
    -- una, Qhaway dispara las actividades ancladas a ese evento:
    -- {"cierre_postulacion": "2026-05-27",
    --  "declaracion_beneficiarios": "2026-09-29",
    --  "notificacion_rd": "2026-10-01"}
  creado_en              timestamptz default now()
);

-- PERSONAS: entidad ÚNICA para todos los humanos relacionados con
-- la productora. La relación evoluciona sin cambiar de tabla:
-- alguien empieza como contacto, luego es cliente, después trabaja
-- como sonidista freelance y más adelante se integra al equipo.
-- La persona es permanente; la relación es un atributo que cambia.
--
-- Escala sin problema: los 128 registros actuales de Seatable se
-- importan por CSV (Table Editor > Import data), y los 1000+
-- contactos dispersos pueden entrar después a la misma tabla.
-- Campos tomados de la tabla Proveedores del Seatable, que ya
-- funciona como directorio universal (incluye hasta bancos).
create table personas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,            -- "Wilfredo Perez Diaz"
  alias            text,                     -- nombre corto: "WilfredoP"
  tipo             text default 'contacto',
    -- personal | colaborador | independiente | entidad_financiera | contacto
  equipo           text,                     -- creativo | tecnico | administrativo
  estado           text default 'activo',
    -- activo | potencial | vetado (No Usar) | inactivo
  relaciones       text[] default '{contacto}',
    -- varias a la vez; evolucionan sin cambiar de tabla:
    -- contacto | cliente | proveedor | freelance | entrevistado
    -- | comunidad | institucion | equipo
  rol              text,                     -- especialidades / cargo principal
  es_comunero      boolean default false,
  region           text,                     -- Cusco, Puno, Lima...
  genero           text,
  fecha_nacimiento date,
  suspension_4ta   boolean default false,    -- suspensión de renta de 4ta
  credenciales     jsonb default '{}',
    -- {"clave_sol": true, "telefono": "...", "email": "..."}
    -- (las contraseñas reales NUNCA van aquí: usar un gestor)
  organizacion     text,
  ruc_dni          text,
  telefono         text,
  email            text,
  notas            text,
  usuario_id       uuid references perfiles(id),
    -- si se integra al equipo interno se enlaza a su cuenta con
    -- login; todo su historial previo se conserva
  origen           text default 'manual',    -- manual | seatable | whatsapp | google
  creado_en        timestamptz default now()
);
create index idx_personas_nombre on personas using gin (to_tsvector('spanish', nombre));
create index idx_personas_rel    on personas using gin (relaciones);

-- FK diferida: empresa_miembros se declara antes que personas
alter table empresa_miembros
  add constraint fk_em_persona foreign key (persona_id)
  references personas(id) on delete cascade;

-- Campos de AudiovisualesEquipos (inventario A-###).
create table equipamiento (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique,                 -- "A-090"
  nombre        text not null,               -- "Micro Comica VM10 PRO"
  categoria     text,                        -- cámara | micrófono | iluminación
                                             -- | energía | producción | pc_accesorios
  subcategoria  text,                        -- supercardioide, eléctrica...
  numero_serie  text,
  estado        text default 'disponible',   -- disponible | en_uso | en_reparacion
                                             -- | perdido | de_baja
  valor_compra  numeric(10,2),
  fecha_compra  date,
  comprado_en   text,
  descripcion   text,
  link          text,
  creado_en     timestamptz default now()
);

-- Kits preconfigurados (de AudiovisualesKIT): "Entrevista — En
-- espacio controlado PRO", "En Movimiento S24"... Al publicar desde
-- rodaje se vincula el kit completo en un clic.
create table kits (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                 -- "En espacio Controlado PRO"
  uso         text,                          -- ENTREVISTA, RODAJE...
  descripcion text
);

create table kit_equipos (
  id              uuid primary key default gen_random_uuid(),
  kit_id          uuid not null references kits(id) on delete cascade,
  equipamiento_id uuid not null references equipamiento(id) on delete cascade,
  rol             text default 'equipo',     -- equipo | accesorio_a | accesorio_b
  unique (kit_id, equipamiento_id)
);

create table vehiculos (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,                   -- "Van H1 blanca"
  placa     text,
  propio    boolean default false,
  creado_en timestamptz default now()
);

create table lugares (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,                   -- "Chinchero"
  direccion text,
  lat       double precision,
  lng       double precision,
  creado_en timestamptz default now()
);

create table etiquetas (
  id     uuid primary key default gen_random_uuid(),
  nombre text unique not null,               -- "Sonido", "Urgente"...
  color  text default '#f4b400'
);

-- ---------- 3. PUBLICACIONES (el nodo central) ----------
create table publicaciones (
  id           uuid primary key default gen_random_uuid(),
  autor_id     uuid not null references perfiles(id),
  tipo         text not null default 'conversacion',
    -- conversacion | problema | tarea | idea | aviso | archivo
    -- | pago | postulacion | avance | aprobacion | reporte
    -- (agregar tipos nuevos no requiere migrar nada)
  titulo       text not null,
  cuerpo       text,
  prioridad    text,                         -- alta | media | baja | null
  estado       text default 'abierta',       -- abierta | en_progreso | resuelta | archivada
  responsable  uuid references perfiles(id), -- asignado principal (opcional)
  fecha_limite date,
  datos_extra  jsonb default '{}',
    -- Campos específicos por tipo SIN crear tablas nuevas:
    --   pago:        {"monto": 4800.00, "moneda": "PEN",
    --                 "justificacion": "pendiente|observado|justificado",
    --                 "tipo_comprobante": "factura|rh|dj|boleta",
    --                 "folio_egreso": "F-00234",       <- puente a Seatable
    --                 "folio_transaccion": "ECT-0021"} <- puente a Seatable
    --   postulacion: {"cierre": "2025-08-30", "requisitos": [...]}
    --   tarea:       {"checklist": [...]}
    --   reporte:     {"clima": "lluvia", "hora_inicio": "10:00"}
  creado_en    timestamptz default now(),
  editado_en   timestamptz
);

create index idx_pub_tipo    on publicaciones(tipo);
create index idx_pub_estado  on publicaciones(estado);
create index idx_pub_creado  on publicaciones(creado_en desc);

-- ---------- 4. VÍNCULOS POLIMÓRFICOS (el corazón del paradigma) ----------
-- Una fila = "esta publicación está relacionada con esta entidad".
-- Permite 0..n vínculos de cualquier tipo por publicación.
create table publicacion_vinculos (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones(id) on delete cascade,
  entidad_tipo   text not null,
    -- 'proyecto' | 'empresa' | 'persona' (tabla personas: cubre
    --   internos y externos por igual) | 'convocatoria'
    -- | 'equipamiento' | 'vehiculo' | 'lugar' | 'etiqueta'
    -- | 'evento_calendario' ...
  entidad_id     uuid not null,              -- id en la tabla correspondiente
  creado_en      timestamptz default now(),
  unique (publicacion_id, entidad_tipo, entidad_id)
);

create index idx_vinc_pub     on publicacion_vinculos(publicacion_id);
create index idx_vinc_entidad on publicacion_vinculos(entidad_tipo, entidad_id);
-- Con idx_vinc_entidad respondes al instante:
-- "todas las publicaciones de la Sony FX3 #02" o "todo lo de Chinchero".

-- ---------- 5. INTERACCIÓN SOCIAL ----------
create table comentarios (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones(id) on delete cascade,
  autor_id       uuid not null references perfiles(id),
  cuerpo         text not null,
  responde_a     uuid references comentarios(id),  -- hilos (opcional)
  creado_en      timestamptz default now()
);
create index idx_com_pub on comentarios(publicacion_id);

create table reacciones (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid references publicaciones(id) on delete cascade,
  comentario_id  uuid references comentarios(id) on delete cascade,
  -- Quién reaccionó. (La columna se llama usuario_id en la BD desplegada; el
  -- código usa usuario_id en todos lados. Antes se llamó autor_id.)
  usuario_id     uuid not null references perfiles(id),
  emoji          text not null default '👍',
  unique (publicacion_id, comentario_id, usuario_id, emoji),
  check (publicacion_id is not null or comentario_id is not null)
);

-- ADJUNTOS = REFERENCIAS A GOOGLE DRIVE (decisión de equipo):
-- los archivos NO se suben a CrewHub+; viven en el Drive del
-- equipo, que ya está ordenado y con permisos. Al adjuntar se usa
-- el Google Picker (mismo login de Google del usuario) y aquí solo
-- se guarda la referencia. Cero duplicación, cero costo de storage.
create table adjuntos (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid references publicaciones(id) on delete cascade,
  comentario_id  uuid references comentarios(id) on delete cascade,
  autor_id       uuid not null references perfiles(id),
  origen         text default 'gdrive',      -- gdrive | url_externa
  drive_file_id  text,                       -- id del archivo en Drive
  url            text not null,              -- enlace para abrir/incrustar
  nombre         text not null,
  mime           text,                       -- image/jpeg, video/mp4, application/pdf...
  miniatura_url  text,                       -- thumbnail que da la API de Drive
  creado_en      timestamptz default now()
);
-- Nota de implementación: scope OAuth 'drive.file' + Google Picker
-- API en el frontend. Los permisos de acceso al archivo los sigue
-- gobernando Drive (si alguien no puede verlo ahí, tampoco aquí).

-- =====================================================================
-- POSTULACIONES — cada año Kawsay postula a varias categorías
-- (documental, cortometraje, gestión, cine en construcción,
-- animación, videojuegos) y CADA proyecto postula con una empresa
-- distinta, con su propio equipo. La postulación es el nexo:
-- concurso (convocatoria) + proyecto + empresa postulante + equipo.
-- =====================================================================
create table postulaciones (
  id               uuid primary key default gen_random_uuid(),
  codigo           text unique,        -- "CDO-P-00094-26-P-074-Solischa"
  convocatoria_id  uuid not null references convocatorias(id),  -- el concurso/categoría
  proyecto_id      uuid not null references proyectos(id),
  empresa_id       uuid not null references empresas(id),       -- empresa postulante
  representante_id uuid references personas(id),                -- rep. legal que firma
  estado           text default 'en_preparacion',
    -- Valores reales (ver ESTADOS_POST en app/actions.ts):
    -- en_preparacion | enviada | en_subsanacion | apta | no_apta
    -- | finalista | ganadora | finalista_no_ganadora | no_seleccionada | retirada
  monto_solicitado numeric(12,2),
  avance_pct       int default 0,      -- % de la carpeta lista
  documentos       jsonb default '{}',
    -- referencias a Drive: {"ficha_tecnica": "url", "tratamiento":
    --  "url", "presupuesto": "url", "plan_rodaje": "url", ...}
  -- ---- RESULTADO: la memoria que alimenta el siguiente intento ----
  -- Los proyectos que no ganan vuelven a postular al año siguiente
  -- con el feedback del jurado. Ese feedback es un activo: queda
  -- aquí, vinculado al proyecto, y Qhaway lo presenta
  -- automáticamente al abrir la carpeta del intento siguiente.
  puntaje          numeric(5,2),       -- puntaje del Acta de Evaluación
  feedback_jurado  text,               -- comentarios del jurado
  acta_evaluacion_url text,            -- referencia a Drive
  creado_en        timestamptz default now()
);
create index idx_post_conv on postulaciones(convocatoria_id, estado);
create index idx_post_proy on postulaciones(proyecto_id, creado_en);
-- idx_post_proy = el "historial de intentos" del proyecto:
--   supabase.from('postulaciones')
--     .select('*, convocatoria:convocatorias(codigo, anio),
--              equipo:postulacion_equipo(cargo, persona:personas(nombre))')
--     .eq('proyecto_id', idSolischa).order('creado_en')
-- → cada intento con su año, empresa, equipo de ese año, puntaje
--   y feedback. La biografía competitiva completa del proyecto.

-- Equipo de cada postulación (el F_EQUIPO-Postulaciones del
-- Seatable): personas REFERENCIADAS, nunca copiadas — el DNI y la
-- hoja de vida viven en la persona, no en la postulación.
create table postulacion_equipo (
  id              uuid primary key default gen_random_uuid(),
  postulacion_id  uuid not null references postulaciones(id) on delete cascade,
  persona_id      uuid not null references personas(id),
  cargo           text not null,       -- Director/a, Productor/a, DF, Sonido...
  remuneracion    numeric(12,2),
  precontrato_url text,                -- referencia a Drive
  unique (postulacion_id, persona_id, cargo)
);
create index idx_pe_persona on postulacion_equipo(persona_id);
-- idx_pe_persona responde al instante la pregunta de cumplimiento:
-- "¿en qué postulaciones/empresas participa esta persona?" — clave
-- porque las bases DAFO restringen a postulantes cuyos
-- representantes estén vinculados a beneficiarios en incumplimiento.

-- =====================================================================
-- CRONOGRAMA GENERADOR — el plan produce el trabajo operativo.
-- Paradigma: nadie crea 200 tareas a mano. Una plantilla por tipo
-- de proyecto se instancia al ganar un fondo; el bot materializa
-- cada actividad como caso (publicación tipo tarea) SOLO cuando se
-- acerca su fecha (just-in-time), y al cerrarse el caso la
-- actividad se marca finalizada sola. El desfase alerta, nunca
-- replanifica en cascada: esa decisión es humana.
-- =====================================================================

-- Plantillas por tipo de proyecto (documental DAFO, animación...)
create table plantillas_cronograma (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,               -- "Documental DAFO — Producción"
  tipo_proyecto text,                        -- documental | animacion | videojuego
  descripcion   text,
  creado_en     timestamptz default now()
);

create table plantilla_actividades (
  id             uuid primary key default gen_random_uuid(),
  plantilla_id   uuid not null references plantillas_cronograma(id) on delete cascade,
  orden          int not null,
  nombre         text not null,              -- "Obtención de permisos de filmación"
  etapa          text,                       -- preproduccion | produccion | postpro...
  offset_dias    int default 0,              -- días desde el inicio del proyecto
  duracion_dias  int default 7,
  rol_sugerido   text                        -- "Coordinación de Logística"
);

-- Cronograma instanciado de cada proyecto/fondo (equivale a la
-- tabla P_Cronograma del Seatable, pero viva).
create table cronograma_actividades (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid references proyectos(id),
  convocatoria_id uuid references convocatorias(id),
  plantilla_act   uuid references plantilla_actividades(id),  -- de qué plantilla nació (opcional)
  nombre          text not null,
  etapa           text,
  fecha_inicio    date,
  fecha_fin       date,
  responsable     uuid references perfiles(id),
  estado          text default 'planificada',
    -- planificada | materializada | en_progreso | finalizada | cancelada
  publicacion_id  uuid references publicaciones(id),
    -- el caso operativo generado; null mientras solo es plan
  dias_anticipacion int default 7,           -- cuándo materializar
  -- ---- CRONOGRAMA DEL CONCURSO (bases DAFO) ----
  clase           text default 'trabajo',
    -- 'trabajo':      ventana interna de trabajo → materializa una Tarea
    -- 'hito_externo': fecha fijada por el Ministerio (cierre de
    --                 postulación, evaluación, finalistas, beneficiarios)
    --                 → genera Aviso con cuenta regresiva, no Tarea
  fuente          text default 'interno',    -- interno | bases_concurso | seatable
  ancla_evento    text,
    -- plazos RELATIVOS de las bases: la actividad no tiene fecha fija
    -- sino que se dispara cuando ocurre un evento en la convocatoria:
    -- 'declaracion_beneficiarios' | 'cierre_postulacion'
    -- | 'notificacion_ficha' | 'firma_acta' ...
    -- Ej. bases CDO 2026: Ficha Declarativa ≤ 7 días hábiles desde la
    -- RD de beneficiarios; documentación de pago ≤ 10 días hábiles;
    -- expediente a DGIA a los 15 días hábiles.
  offset_dias_habiles int,
    -- plazo en DÍAS HÁBILES desde el ancla (¡no calendario!);
    -- Qhaway calcula la fecha real con el calendario de feriados
    -- de Perú al registrarse el evento ancla, y materializa la
    -- cascada completa con sus cuentas regresivas.
  creado_en       timestamptz default now()
);
-- Nota: un cronograma de concurso se vincula por convocatoria_id
-- (proyecto_id null) y sirve a TODAS las postulaciones de ese
-- concurso a la vez (Kawsay suele postular varios proyectos al
-- mismo concurso). Se carga una vez por edición de bases y, en
-- fase 2, Qhaway puede extraerlo directamente del PDF de las
-- bases para revisión humana.
create index idx_crono_proy  on cronograma_actividades(proyecto_id, fecha_inicio);
create index idx_crono_madura on cronograma_actividades(estado, fecha_inicio)
  where publicacion_id is null;

-- MATERIALIZACIÓN (job diario con pg_cron o Supabase Edge Function):
--   Para cada actividad 'planificada' sin publicacion_id cuya
--   fecha_inicio - dias_anticipacion <= hoy:
--     1. insert into publicaciones (tipo='tarea', titulo=nombre,
--        responsable, fecha_limite=fecha_fin, ...)
--     2. vincular proyecto/convocatoria en publicacion_vinculos
--     3. update cronograma_actividades set estado='materializada',
--        publicacion_id=<nueva>
--     (los triggers de actividad registran todo con actor null=bot)
--   Alerta de desfase: actividad con fecha_inicio pasada y caso
--   inexistente o abierto → el bot publica un Aviso.
--   Cierre de ida y vuelta: cuando el caso pasa a 'resuelta', la
--   capa de aplicación marca la actividad 'finalizada'.

-- =====================================================================
-- ACTIVIDAD — la bitácora universal de "entidades vivas".
-- Principio del sistema: NINGÚN CAMBIO DE ESTADO SIN SU EVENTO.
-- Una sola tabla registra la línea de vida de TODAS las entidades:
-- publicaciones (modelo GitHub Issues), pero también proyectos,
-- empresas, personas, convocatorias, equipamiento...
-- El estado actual vive como columna en cada tabla (consultas
-- rápidas); esta bitácora lo EXPLICA siempre (append-only).
-- El "perfil de entidad" (la biografía de la Sony FX3, de una
-- empresa o de una persona) = sus eventos aquí + sus publicaciones
-- vinculadas en publicacion_vinculos.
-- =====================================================================
create table actividad (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,
    -- 'publicacion' | 'proyecto' | 'empresa' | 'empresa_miembro'
    -- | 'convocatoria' | 'persona' | 'equipamiento' | 'vehiculo' | 'lugar'
  entidad_id   uuid not null,
  actor_id     uuid references perfiles(id),  -- null = evento automático (bot/trigger sin sesión)
  tipo         text not null,
    -- creado | estado | asignacion | comentario | archivo
    -- | prioridad | tarea | vinculo | relacion | bot | cierre | edicion
  detalle      jsonb default '{}',
    -- estado:     {"campo": "estado", "de": "abierta", "a": "en_progreso"}
    -- asignacion: {"responsable": "uuid-persona"}
    -- comentario: {"comentario_id": "uuid"}
    -- archivo:    {"adjunto_id": "uuid", "drive_file_id": "..."}
    -- bot:        {"mensaje": "vence el 15 jul", "regla": "recordatorio_vencimiento"}
  creado_en    timestamptz default now()
);
create index idx_actividad_entidad on actividad(entidad_tipo, entidad_id, creado_en);
create index idx_actividad_reciente on actividad(creado_en desc);

-- ---- TRIGGERS DE GARANTÍA ------------------------------------------
-- Garantizan el invariante a nivel de base de datos: aunque el
-- frontend olvide registrar el evento, la base lo escribe sola.

-- (a) Todo INSERT deja su evento 'creado'
create or replace function public.registrar_evento_creacion()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.actividad (entidad_tipo, entidad_id, actor_id, tipo, detalle)
  values (tg_table_name, new.id, auth.uid(), 'creado', '{}');
  return new;
end $$;

-- (b) Todo UPDATE que cambie un campo de estado deja su evento,
--     con el valor anterior y el nuevo ("de" → "a").
create or replace function public.registrar_evento_estado()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  k     text;
  claves text[] := array['estado','etapa','estado_actividad','prioridad','responsable'];
  vold  jsonb := to_jsonb(old);
  vnew  jsonb := to_jsonb(new);
begin
  foreach k in array claves loop
    if (vold ? k) and (vnew->>k) is distinct from (vold->>k) then
      insert into public.actividad (entidad_tipo, entidad_id, actor_id, tipo, detalle)
      values (tg_table_name, new.id, auth.uid(), 'estado',
              jsonb_build_object('campo', k, 'de', vold->>k, 'a', vnew->>k));
    end if;
  end loop;
  return new;
end $$;

-- (c) Se instalan en todas las entidades vivas de una sola vez
do $$
declare t text;
begin
  foreach t in array array[
    'publicaciones','proyectos','empresas','empresa_miembros',
    'convocatorias','personas','equipamiento','vehiculos','lugares',
    'cronograma_actividades','postulaciones'
  ] loop
    execute format('create trigger trg_creado_%I after insert on %I
                    for each row execute function registrar_evento_creacion()', t, t);
    execute format('create trigger trg_estado_%I after update on %I
                    for each row execute function registrar_evento_estado()', t, t);
  end loop;
end $$;

-- Vistas guardadas: el "foco estacional" del equipo.
-- Mismo feed, distintos lentes: "Rendición DAFO", "Rodaje",
-- "Postulaciones 2026"... Cada vista es un conjunto de filtros.
create table vistas_guardadas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,                  -- "Rendición DAFO"
  icono      text default '🌐',
  filtros    jsonb not null default '{}',
    -- {"tipos": ["pago"], "etiquetas": ["Rendición"],
    --  "convocatorias": ["uuid..."], "estados": ["abierta"]}
  usuario_id uuid references perfiles(id),   -- null = compartida con todos
  orden      int default 0,
  creado_en  timestamptz default now()
);

create table notificaciones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references perfiles(id) on delete cascade,
  publicacion_id uuid references publicaciones(id) on delete cascade,
  tipo           text not null,   -- mencion | comentario | asignacion | cambio_estado | reaccion
  mensaje        text,
  leida          boolean default false,
  creado_en      timestamptz default now()
);
create index idx_notif_usuario on notificaciones(usuario_id, leida);

-- ---------- 6. SEGURIDAD (Row Level Security) ----------
-- Modelo simple para equipo de ≤10 personas: todo miembro autenticado
-- ve todo; solo el autor edita/borra lo suyo.
-- IMPORTANTE: en Supabase Auth > Providers, activar Google y
-- restringir el acceso invitando solo los correos del equipo
-- (o validando dominio en un hook).

alter table perfiles              enable row level security;
alter table proyectos             enable row level security;
alter table empresas              enable row level security;
alter table equipamiento          enable row level security;
alter table vehiculos             enable row level security;
alter table lugares               enable row level security;
alter table etiquetas             enable row level security;
alter table publicaciones         enable row level security;
alter table publicacion_vinculos  enable row level security;
alter table comentarios           enable row level security;
alter table reacciones            enable row level security;
alter table adjuntos              enable row level security;
alter table notificaciones        enable row level security;
alter table convocatorias         enable row level security;
alter table personas              enable row level security;
alter table vistas_guardadas      enable row level security;
alter table empresa_miembros      enable row level security;
alter table kits                  enable row level security;
alter table kit_equipos           enable row level security;
alter table actividad             enable row level security;
alter table plantillas_cronograma enable row level security;
alter table plantilla_actividades enable row level security;
alter table cronograma_actividades enable row level security;
alter table postulaciones         enable row level security;
alter table postulacion_equipo    enable row level security;

-- Lectura: cualquier miembro autenticado
create policy "leer_todo" on publicaciones        for select to authenticated using (true);
create policy "leer_vinc" on publicacion_vinculos for select to authenticated using (true);
create policy "leer_com"  on comentarios          for select to authenticated using (true);
create policy "leer_reac" on reacciones           for select to authenticated using (true);
create policy "leer_adj"  on adjuntos             for select to authenticated using (true);
create policy "leer_perf" on perfiles             for select to authenticated using (true);
create policy "leer_proy" on proyectos            for select to authenticated using (true);
create policy "leer_emp"  on empresas             for select to authenticated using (true);
create policy "leer_eq"   on equipamiento         for select to authenticated using (true);
create policy "leer_veh"  on vehiculos            for select to authenticated using (true);
create policy "leer_lug"  on lugares              for select to authenticated using (true);
create policy "leer_etq"  on etiquetas            for select to authenticated using (true);
create policy "leer_conv" on convocatorias        for select to authenticated using (true);
create policy "leer_pers" on personas             for select to authenticated using (true);
create policy "leer_em"   on empresa_miembros     for select to authenticated using (true);
create policy "leer_kit"  on kits                 for select to authenticated using (true);
create policy "leer_ke"   on kit_equipos          for select to authenticated using (true);
create policy "crear_em"  on empresa_miembros     for insert to authenticated with check (true);
create policy "crear_kit" on kits                 for insert to authenticated with check (true);
create policy "crear_ke"  on kit_equipos          for insert to authenticated with check (true);
create policy "leer_actv" on actividad for select to authenticated using (true);
create policy "leer_ptc"  on plantillas_cronograma  for select to authenticated using (true);
create policy "crear_ptc" on plantillas_cronograma  for insert to authenticated with check (true);
create policy "leer_pta"  on plantilla_actividades  for select to authenticated using (true);
create policy "crear_pta" on plantilla_actividades  for insert to authenticated with check (true);
create policy "leer_cra"  on cronograma_actividades for select to authenticated using (true);
create policy "crear_cra" on cronograma_actividades for insert to authenticated with check (true);
create policy "editar_cra" on cronograma_actividades for update to authenticated using (true);
create policy "leer_pos"  on postulaciones      for select to authenticated using (true);
create policy "crear_pos" on postulaciones      for insert to authenticated with check (true);
create policy "editar_pos" on postulaciones     for update to authenticated using (true);
create policy "leer_pe"   on postulacion_equipo for select to authenticated using (true);
create policy "crear_pe"  on postulacion_equipo for insert to authenticated with check (true);
create policy "editar_pe" on postulacion_equipo for update to authenticated using (true);
create policy "crear_actv" on actividad for insert to authenticated with check (true);
-- Nota: la actividad es de solo-anexado (append-only): sin
-