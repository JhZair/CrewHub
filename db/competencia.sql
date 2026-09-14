-- ============================================================
--  db/competencia.sql
--
--  CON QUIÉN SE COMPITE EN CADA CONVOCATORIA.
--
--  El sistema tiene cargadas NUESTRAS empresas, proyectos y personas.
--  De los otros postulantes no había nada, y son justo la mitad que
--  falta para leer un resultado: veinte aptas de las que salen nueve
--  finalistas no dicen lo mismo si esas veinte son de Lima que si la
--  mitad son de regiones, ni si compiten en ópera prima o en segunda
--  obra. Eso está publicado —DAFO saca cuatro listas por concurso— y
--  hasta hoy solo se podía leer abriendo PDFs de cuarenta páginas.
--
--  ── POR QUÉ NO SON EMPRESAS NI PROYECTOS DE VERDAD ──
--  Lo primero que se piensa es dar de alta cada competidor en
--  `empresas` y cada proyecto en `proyectos`, y sería un error caro:
--  esas tablas son de las entidades CON LAS QUE TRABAJAMOS. Tienen
--  ficha, repositorio, muro, cronograma, historial y salen en todos
--  los buscadores y combos del sistema. Meter ahí doscientas empresas
--  ajenas por concurso significa que al elegir la empresa de una
--  postulación aparezcan doscientos nombres que no son nuestros, y
--  que el sistema pase de decir «estas son las nuestras» a decir
--  «estas son todas las del país, revísalas tú».
--
--  Y hay una razón mayor: lo de aquí es lo que DIJO UN DOCUMENTO en
--  una fecha. No se mantiene, no se corrige, no se enriquece; se
--  vuelve a leer si sale una fe de erratas. Una empresa de `empresas`
--  es lo contrario: algo vivo que alguien cuida. Son dos naturalezas
--  distintas y por eso son dos tablas distintas.
--
--  Esta es una TABLA DE LECTURA, atada a su convocatoria: se borra
--  con ella (`on delete cascade`) porque fuera de su concurso no
--  significa nada.
--
--  ── UNA FILA POR COMPETIDOR, NO POR DOCUMENTO ──
--  La misma empresa sale en las cuatro listas del concurso: recibida,
--  apta, finalista y beneficiaria. Guardar las cuatro apariciones
--  obligaría a agrupar en cada consulta para responder lo único que
--  se pregunta —«¿hasta dónde llegó?»—, así que se guarda UNA fila
--  por competidor y `etapa` avanza. Nunca retrocede: cargar la
--  relación de recibidas después del fallo no puede desganar a nadie
--  (ver `cargarCompetencia`).
--
--  ── LOS TRES NOMBRES QUE HACEN LA MATRIZ ──
--  Empresa, proyecto y director. Con los dos primeros ya se sabe quién
--  compite; con el tercero se puede cruzar de verdad, que es lo que se
--  quiere de esto: el mismo director aparece con dos productoras
--  distintas en dos concursos, y sin su nombre eso no se ve.
--
--  Es dato de terceros, así que conviene decir qué es y qué no: son
--  documentos PÚBLICOS del Ministerio, se guardan tal como el papel los
--  escribe y no se enriquecen con nada de fuera. Y no se dan de alta en
--  `personas`, igual que las empresas no se dan de alta en `empresas`:
--  esto es lo que dijo un documento en una fecha, no una ficha que
--  alguien mantenga.
--
--  ⚠ Donde el PDF no permite separar el nombre del título del proyecto,
--  `personas` queda vacío y los nombres se quedan dentro de `titulo`
--  —lo dice su aviso—. Se recortan en la pantalla de confirmar.
-- ============================================================

create table if not exists convocatoria_competencia (
  id              uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references convocatorias(id) on delete cascade,

  -- El RUC es el identificador legal y no cambia aunque escriban el
  -- nombre de tres maneras entre un año y otro. Va nulo en las
  -- relaciones de recibidas, que son la única lista donde DAFO no lo
  -- publica: hasta que salgan las aptas, esos competidores solo se
  -- pueden casar por nombre.
  ruc             text,
  empresa         text not null,
  region          text,

  -- Hasta dónde llegó: recibida → apta → finalista → beneficiaria.
  etapa           text not null default 'recibida',
  -- Categoría y modalidad de SU postulación, no las de la
  -- convocatoria: en un mismo concurso compiten ópera prima y segunda
  -- obra, y saber en cuál está cada uno es media pregunta resuelta.
  categoria       text,
  modalidad       text,
  titulo          text,
  -- Quien dirige o responde por el proyecto, tal como lo escribe el
  -- documento. Puede traer varios nombres separados por «/».
  personas        text,
  -- Solo lo tienen las beneficiarias, y solo lo dice el fallo.
  monto           numeric(12,2),
  -- El N° de orden que traía la relación de recibidas, si venía de ahí.
  n_orden         integer,

  -- ⚠ LO QUE EL LECTOR NO PUDO ASEGURAR DE ESTA FILA, y el texto tal
  -- cual venía. Se guardan los dos porque una lista leída de un PDF
  -- sin columnas no es un dato limpio y fingir que sí lo es se paga
  -- en la primera duda: con esto, cualquiera puede comprobar una fila
  -- rara contra lo que decía el documento sin volver a abrirlo.
  avisos          text[] not null default '{}',
  crudo           text,
  -- De qué documento salió, para saber a quién creerle si dos listas
  -- se contradicen.
  fuente          text,

  creado_en       timestamptz not null default now(),
  creado_por      uuid references perfiles(id),
  visto_en        timestamptz not null default now()
);

-- ── QUIÉN ES EL MISMO COMPETIDOR ──
-- Con RUC, el RUC manda: es único y no se escribe de dos formas. Sin
-- RUC —las recibidas—, el nombre normalizado. Son dos índices únicos
-- PARCIALES y no uno solo sobre `coalesce(ruc, empresa)`, porque eso
-- último impediría que una empresa aparezca primero sin RUC y luego
-- con él, que es exactamente la secuencia normal de un concurso.
--
-- ⚠ Y VA EL TÍTULO DENTRO DE LA LLAVE. Estos índices decían «una fila
-- por empresa y concurso», que suena razonable y es falso: en las
-- aptas de Documental 2025, HUACA RAJADA CINE presenta «Inmigrantes» y
-- «MAMA QOCHAQ, caminos del agua», y ÑAWINCHIK otros dos. Son dos
-- rivales en la carrera, con dos directores distintos. Con la llave
-- vieja la carga entera se caía —«duplicate key value violates
-- idx_competencia_ruc»— y no entraba ni una fila.
-- Lo que identifica a una fila de aquí es una POSTULACIÓN: empresa +
-- proyecto. Para contar cuántas veces lo ha intentado alguien se
-- cuentan convocatorias distintas, no filas (ver `lib/rivales.ts`).
drop index if exists idx_competencia_ruc;
drop index if exists idx_competencia_nombre;
create unique index if not exists idx_competencia_ruc
  on convocatoria_competencia (convocatoria_id, ruc, lower(coalesce(titulo, '')))
  where ruc is not null;
create unique index if not exists idx_competencia_nombre
  on convocatoria_competencia (convocatoria_id, lower(empresa), lower(coalesce(titulo, '')))
  where ruc is null;

create index if not exists idx_competencia_conv
  on convocatoria_competencia (convocatoria_id, etapa);

-- Las mismas reglas que el resto de las tablas del sistema: lo ve y lo
-- escribe quien tiene sesión. Aquí no hay dato sensible —es lo que el
-- Ministerio publica en su web— pero la tabla no debe quedar abierta.
alter table convocatoria_competencia enable row level security;

drop policy if exists competencia_lee on convocatoria_competencia;
create policy competencia_lee on convocatoria_competencia
  for select to authenticated using (true);

drop policy if exists competencia_escribe on convocatoria_competencia;
create policy competencia_escribe on convocatoria_competencia
  for all to authenticated using (true) with check (true);

comment on table convocatoria_competencia is
  'Los otros postulantes de una convocatoria, leídos de las listas que publica DAFO. Solo lectura del exterior: no son entidades del sistema.';

-- ── Añadido después: los nombres de quienes dirigen ──
-- Va aparte para que quien ya haya creado la tabla solo tenga que
-- volver a ejecutar este archivo.
alter table convocatoria_competencia add column if not exists personas text;

comment on column convocatoria_competencia.personas is
  'Director(es) o responsable(s) del proyecto, tal como los publica el documento. No son personas del sistema.';
