-- ============================================================
--  db/entidad-foto.sql — LAS FOTOS DE UNA COSA, NO SU CARTEL
--
--  Un equipo tenía UNA imagen: el cartel de 84×84 de su cabecera. Sirve para
--  reconocerlo en una lista de trescientos, y para nada más. Lo que hace falta
--  saber de un «Soporte De Pecho Para Cámara» no cabe en una miniatura: cómo
--  se monta, qué trae en la caja, dónde está el número de serie, cuál de los
--  dos cables es el bueno.
--
--  ── POR QUÉ NO VALE `entidad_media` ──
--  Esa tabla tiene `unique (entidad_tipo, entidad_id)` y dos columnas de URL
--  con nombre propio: `portada_url` y `cartel_url`. Son DOS RANURAS, no una
--  lista — y es correcto que lo sean: la portada y el cartel no son «dos fotos
--  de las muchas que hay», son dos sitios de la pantalla. Meter aquí una
--  galería obligaría a quitarle la unicidad, y con ella se va la garantía de
--  que una entidad tiene un solo cartel.
--
--  ── POR QUÉ UNA TABLA Y NO UN `jsonb` EN `equipamiento` ──
--  Es lo que hacen `proyecto_actores.imagenes` y `estado_cuenta.imagenes`, y
--  para lo suyo está bien: son listas de URLs y nada más. Aquí hace falta el
--  PIE DE FOTO, que es lo que convierte una foto en información —«así va
--  montado el arnés», «el cable corto es el bueno»—. Una foto de la que nadie
--  sabe qué enseña acaba siendo una foto que nadie mira.
--  Y con `creado_por` y `creado_en`: el día que aparece una foto que
--  contradice a otra, la pregunta es quién y cuándo.
--
--  Polimórfica como `entidad_media`, `objetos` y `publicacion_vinculos`: hoy la
--  usan 🎥 equipos, 👤 personas y 🎬 proyectos —quién la pinta lo dice
--  `CON_GALERIA` en la ficha—, pero nada de aquí es de un tipo concreto. El día
--  que un lugar o una empresa necesiten fotos, ya está: la tabla no se toca.
--
--  Idempotente y sin transacción (pgBouncer). Al final verifica.
-- ============================================================

create table if not exists entidad_foto (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,          -- 'equipamiento' | 'proyecto' | 'empresa' | 'lugar' | …
  entidad_id   uuid not null,
  url          text not null,
  -- QUÉ ENSEÑA. Sin esto la galería es un montón de fotos parecidas.
  pie          text,
  -- El orden lo pone quien las mira, no la fecha de subida: la foto que
  -- explica cómo se monta algo tiene que ir primero aunque se subiera última.
  orden        int  not null default 0,
  creado_por   uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);

-- La consulta que se hace siempre: las fotos de ESTA cosa, en su orden.
create index if not exists idx_entidad_foto_de
  on entidad_foto(entidad_tipo, entidad_id, orden);

alter table entidad_foto enable row level security;
drop policy if exists "ef_sel" on entidad_foto;
drop policy if exists "ef_ins" on entidad_foto;
drop policy if exists "ef_upd" on entidad_foto;
drop policy if exists "ef_del" on entidad_foto;
create policy "ef_sel" on entidad_foto for select to authenticated using (true);
create policy "ef_ins" on entidad_foto for insert to authenticated with check (true);
create policy "ef_upd" on entidad_foto for update to authenticated using (true) with check (true);
create policy "ef_del" on entidad_foto for delete to authenticated using (true);

-- ── VERIFICACIÓN ──
select 'tabla entidad_foto' as que, count(*) as ok
  from information_schema.tables where table_name = 'entidad_foto'
union all
select 'columna pie', count(*) from information_schema.columns
 where table_name = 'entidad_foto' and column_name = 'pie'
union all
select 'indice por entidad y orden', count(*) from pg_indexes
 where indexname = 'idx_entidad_foto_de'
union all
select 'politicas RLS (deben ser 4)', count(*) from pg_policies
 where tablename = 'entidad_foto'
union all
select 'fotos guardadas', count(*) from entidad_foto;
