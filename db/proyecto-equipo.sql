-- ============================================================
--  El lado que le faltaba al triángulo
--
--  «Para una convocatoria se comprometen la directora + su proyecto con la
--   empresa postulante. Esa relación pasa a matrimonio cuando ganan, y se
--   divorcian cuando el documental llega a los festivales y cines — NO cuando
--   reportan a DAFO.»   — John, 16/07/2026
--
--  El sistema tenía dos de las tres aristas:
--
--      proyecto ──postulación── empresa      ✔
--      postulación ── personas (equipo)      ✔
--      proyecto ── su directora              ✘
--
--  `proyectos` guardaba folio, tipo, etapa, color, RENCA… y ninguna persona.
--  O sea que, según el sistema, una directora NACÍA AL POSTULAR. Y es al revés:
--
--      «Los directores nuevos nacen junto a sus proyectos. Nosotros no ponemos
--       directores; los directores nacen con sus proyectos, y como productor me
--       encargo de abrirles el camino.»
--
--  Un proyecto en «idea» ya tiene directora, un año antes de postular. Ese año
--  —el más importante, el del matrimonio que empieza— era invisible.
--
--  ⚠ HONESTIDAD: esta es la TERCERA tabla que hace lo mismo, junto a
--  `empresa_miembros` y `postulacion_equipo`. Las tres son persona + cargo +
--  vigencia colgada de otra cosa. Unificarlas sería lo correcto y hoy no toca:
--  las otras dos están en producción y con datos. Al menos que la tercera se
--  parezca a las dos, para que el día que se unifiquen sea un solo trabajo.
-- ============================================================

create table if not exists proyecto_equipo (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  persona_id  uuid not null references personas(id),
  cargo       text not null,          -- Directora, Codirector/a, Productor/a…
  /* El matrimonio tiene fechas: empieza cuando la directora trae su proyecto y
     termina cuando la película llega a los festivales. `hasta` vacío = vigente,
     igual que en `empresa_miembros`. */
  desde       date default current_date,
  hasta       date,
  notas       text,
  creado_en   timestamptz default now(),
  -- La misma persona puede ser Directora y Guionista del mismo proyecto
  unique (proyecto_id, persona_id, cargo)
);
create index if not exists proy_equipo_proy on proyecto_equipo (proyecto_id);
create index if not exists proy_equipo_per  on proyecto_equipo (persona_id);

alter table proyecto_equipo enable row level security;

-- `create policy` no tiene «if not exists»: sin estos drop, el archivo revienta
-- la segunda vez que se corre. Y siempre hay una segunda vez.
drop policy if exists "leer_pe"   on proyecto_equipo;
drop policy if exists "crear_pe"  on proyecto_equipo;
drop policy if exists "editar_pe" on proyecto_equipo;
drop policy if exists "borrar_pe" on proyecto_equipo;

create policy "leer_pe"   on proyecto_equipo for select to authenticated using (true);
create policy "crear_pe"  on proyecto_equipo for insert to authenticated with check (true);
create policy "editar_pe" on proyecto_equipo for update to authenticated using (true);
create policy "borrar_pe" on proyecto_equipo for delete to authenticated using (true);

comment on table proyecto_equipo is
  'Quién hace este proyecto, desde antes de postular. La directora nace con el proyecto, no con la postulación. `postulacion_equipo` es otra cosa: el equipo que se presentó a UN concurso.';

-- ── Las etapas que faltaban ─────────────────────────────────
--
--  Eran: idea → en_carpeta → desarrollo → preproduccion → produccion
--        → postproduccion → finalizado
--
--  El sistema terminaba donde termina DAFO. Pero el divorcio no es la
--  rendición: es cuando la película llega a los festivales y los cines. Sin
--  esas dos etapas, un documental que ya rindió y todavía no se estrenó
--  figuraba «finalizado» — y no lo está ni de lejos.
--
--  No hay `check` en la columna, así que no hace falta migrar nada: las
--  opciones nuevas viven en lib/entidades.ts y entran solas.
--
--  Orden propuesto (revísalo): el documental estrena en festival, recorre el
--  circuito, y recién después va a cines y plataformas.
--
--      … → postproduccion → festivales → distribucion → finalizado
--
--  Si en su recorrido real distribución va antes que festivales, se cambia el
--  orden en lib/entidades.ts y ya.

comment on column proyectos.etapa is
  'idea | en_carpeta | desarrollo | preproduccion | produccion | postproduccion | festivales | distribucion | finalizado. «finalizado» = ya circuló, no «ya rindió a DAFO».';

-- 👀 Qué proyectos están en la etapa final hoy — para revisar si de verdad
--    circularon o si solo se les acabó el trámite.
select folio, nombre, etapa, estado_actividad
  from proyectos
 where etapa in ('postproduccion', 'finalizado')
 order by etapa, folio;
