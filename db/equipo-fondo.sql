-- ============================================================
--  db/equipo-fondo.sql — EL PERSONAL DEL FONDO EN EJECUCIÓN
--
--  Un fondo ganado arranca con el equipo que se presentó a concurso, y a ese
--  equipo se le va sumando gente durante los dos años de ejecución: el
--  sonidista de una semana, la traductora de tres jornadas, el chofer del
--  viaje a Pomacanchi. Esa lista no existía en ninguna parte, y es justo la
--  que DAFO va a cotejar contra los recibos.
--
--  ── LO QUE ESTA TABLA NO GUARDA ──
--  No guarda a quien ya tiene RHE girado en este fondo. Eso es un HECHO y ya
--  está escrito en `rhe`: se deriva leyéndolo, no se copia. Una segunda lista
--  con los mismos nombres es una lista que se desincroniza el primer día —y
--  entonces hay dos respuestas a «¿quién trabajó aquí?» y ninguna manda.
--
--  Lo que sí guarda es lo que NO se puede deducir de ningún hecho: a quién
--  pensamos convocar y todavía no. Una intención no deja rastro en la
--  contabilidad, así que si no se escribe, no existe.
--
--  ── POR QUÉ `cargo` Y NO UN ROL DEL CATÁLOGO ──
--  Mismo texto libre con sugerencias que el equipo de postulación: aquí entra
--  gente para la que no hay rol formal («apoyo de producción en Pomacanchi»),
--  y un desplegable cerrado obligaría a mentir eligiendo el más parecido.
--
--  Idempotente. Al final verifica.
-- ============================================================

create table if not exists equipo_fondo (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  persona_id     uuid not null references personas(id) on delete cascade,
  cargo          text,
  /* Por qué está en la lista. Sirve para la conversación de dentro de un año:
     «¿este quién era?» se contesta mucho mejor con «traductora de las
     entrevistas de Pomacanchi» que con un nombre suelto. */
  nota           text,
  creado_por     uuid references perfiles(id),
  creado_en      timestamptz default now(),
  /* Una persona, una vez por fondo. Puede tener dos cargos en la vida real,
     pero para la coherencia de los recibos lo que importa es si está o no —y
     dos filas de la misma persona harían que el descuadre la contara dos
     veces. */
  unique (postulacion_id, persona_id)
);

create index if not exists idx_equipo_fondo_post on equipo_fondo(postulacion_id);

alter table equipo_fondo enable row level security;

-- `drop ... if exists` antes de cada `create`: create policy no tiene
-- «if not exists» y estos archivos se corren dos veces por definición.
drop policy if exists "leer_eqf"   on equipo_fondo;
drop policy if exists "crear_eqf"  on equipo_fondo;
drop policy if exists "editar_eqf" on equipo_fondo;
drop policy if exists "borrar_eqf" on equipo_fondo;

/* Leer, todo el equipo: saber quién trabaja en un fondo no es información
   reservada, y esconderla obligaría a preguntar por WhatsApp lo que la
   pantalla puede contestar.
   Escribir, también: esta lista la mantiene quien está en el rodaje —quien
   sabe a quién se convocó— y no administración. Pedir permisos de finanzas
   para apuntar un nombre habría hecho que no se apuntara ninguno, que es
   exactamente el estado del que venimos. Lo que sí está protegido es el
   dinero (`rhe`, ver db/rhe-permisos.sql); esto es la nómina prevista. */
create policy "leer_eqf"   on equipo_fondo for select to authenticated using (true);
create policy "crear_eqf"  on equipo_fondo for insert to authenticated with check (true);
create policy "editar_eqf" on equipo_fondo for update to authenticated using (true) with check (true);
create policy "borrar_eqf" on equipo_fondo for delete to authenticated using (true);

-- ── VERIFICAR ──
select case when exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'equipo_fondo')
  then '✅ equipo_fondo existe'
  else '❌ no se creó' end as estado;

-- Cuántas políticas tiene. Con RLS activo y cero políticas, la tabla existe y
-- no deja hacer nada — y eso no falla con un error: devuelve cero filas.
select count(*) as politicas from pg_policies
 where schemaname = 'public' and tablename = 'equipo_fondo';
