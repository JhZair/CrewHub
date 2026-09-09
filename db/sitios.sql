-- ============================================================
--  db/sitios.sql
--
--  DÓNDE SE GUARDA CADA COSA — el cuarto eje del inventario.
--
--  Hasta hoy se anotaba en la descripción del kit, a mano: «Se
--  encuentra en el Cajón 07», «Se encuentra en el Bolso Maleta Tenba».
--  Funcionaba para catorce kits y no escala a quinientos equipos: no se
--  puede preguntar «¿qué hay en el Cajón 07?», renombrar un cajón es
--  editar catorce textos, y «Cajón 7» y «cajon 07» son dos cajones
--  distintos para cualquier búsqueda.
--
--  ── LAS DOS COSAS QUE ESAS NOTAS MEZCLABAN ──
--  Al leerlas se ve que hay DOS tipos de respuesta, y no son la misma:
--
--    · «Cajón 07», «Cajón 08», «el Depósito»  → son SITIOS. Muebles,
--      estantes, habitaciones. No están en el inventario, no tienen
--      folio, no se prestan.
--    · «el Bolso Maleta Tenba», «la Mochila Rígida BKANO», «la maleta
--      principal del Drone» → son EQUIPOS. Tienen folio, valen dinero,
--      se prestan, y además contienen a otros.
--
--  Por eso son dos punteros y no uno: `guardado_sitio` y
--  `guardado_en_equipo`. Excluyentes —una cosa se guarda en un sitio O
--  dentro de otra cosa, no en los dos— y encadenables: la cámara está
--  en el Bolso Tenba, el Bolso Tenba está en el Cajón 08. La respuesta
--  completa se lee «Cajón 08 › Bolso Tenba» y sale de subir la cadena,
--  no de un texto que alguien mantiene al día.
--
--  ── Y LA TERCERA COSA, QUE NO ES ESTA ──
--  ⚠ ESTO ES DÓNDE SE GUARDA, NO DÓNDE ESTÁ. Si Katy se llevó la
--  cámara, está en su mochila; su sitio sigue siendo el Cajón 08,
--  porque es adonde vuelve. Dónde está AHORA ya lo contesta
--  `equipo_prestamos`, y mezclarlas obligaría a reescribir el sitio de
--  veinte equipos cada vez que alguien sale a grabar — que es
--  exactamente la razón por la que nadie lo mantendría.
--
--  ── LA HERENCIA ──
--  Una pieza ATORNILLADA dentro de otra no tiene sitio propio: está
--  donde esté su anfitrión. Se guarda así —con los dos punteros en
--  null— para que el dato viva en un solo lugar; si tuviera el suyo,
--  nada impediría que el tornillo dijera «Cajón 07» y el rig que lo
--  lleva dijera «Cajón 08», y las dos filas serían igual de creíbles.
--  El check de abajo lo impide en la base, no solo en el código.
--
--  ── POR QUÉ `sitios` Y NO `lugares` ──
--  `lugares` ya existe y es otra cosa: locaciones de rodaje, con
--  dirección, latitud y longitud. Chinchero es un lugar; el Cajón 07 no.
--  Meterlos en la misma tabla habría hecho que el selector de locación
--  de un rodaje ofreciera «Cajón 07».
-- ============================================================

-- ------------------------------------------------------------
-- 1 · LOS SITIOS
-- ------------------------------------------------------------
create table if not exists sitios (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  /* Un sitio dentro de otro: el Cajón 07 está en el Depósito. Opcional
     —hoy son cajones sueltos— pero es la misma cadena que ya hay que
     recorrer, así que no cuesta nada dejarla abierta. `set null` y no
     `cascade`: borrar el Depósito no puede borrar sus cajones y con
     ellos el sitio de doscientos equipos. */
  dentro_de uuid references sitios(id) on delete set null,
  nota      text,
  creado_en timestamptz default now(),
  creado_por uuid references perfiles(id)
);

/* Sin `unique` en `nombre` a secas: «Cajón 07» del Depósito y «Cajón 07»
   de la oficina son dos, y una restricción global obligaría a bautizarlos
   «Cajón 07 depósito», que es meter la jerarquía dentro del nombre justo
   cuando la columna de al lado existe para eso. Único DENTRO de su padre,
   que es donde de verdad confunde. */
create unique index if not exists idx_sitio_nombre_en_padre
  on sitios(dentro_de, lower(nombre)) where dentro_de is not null;
create unique index if not exists idx_sitio_nombre_raiz
  on sitios(lower(nombre)) where dentro_de is null;

alter table sitios drop constraint if exists sitio_no_dentro_de_si_mismo;
alter table sitios add constraint sitio_no_dentro_de_si_mismo
  check (dentro_de is null or dentro_de <> id);

-- ------------------------------------------------------------
-- 2 · DÓNDE SE GUARDA CADA EQUIPO
-- ------------------------------------------------------------
alter table equipamiento add column if not exists guardado_sitio uuid
  references sitios(id) on delete set null;
/* ⚠ NO es `ensamblado_en`. Son dos relaciones equipo→equipo que parecen
   la misma y se comportan al revés:
     · `ensamblado_en`  — atornillado. La pieza NO se presta suelta.
     · `guardado_en_equipo` — metido en su bolso. Se presta perfectamente
       solo; sacarlo del bolso no es desarmar nada.
   Con una sola columna, guardar una cámara en su maletín la habría
   sacado del escogedor de entrega. */
alter table equipamiento add column if not exists guardado_en_equipo uuid
  references equipamiento(id) on delete set null;

create index if not exists idx_eq_guardado_sitio on equipamiento(guardado_sitio);
create index if not exists idx_eq_guardado_equipo on equipamiento(guardado_en_equipo);

alter table equipamiento drop constraint if exists eq_no_se_guarda_en_si_mismo;
alter table equipamiento add constraint eq_no_se_guarda_en_si_mismo
  check (guardado_en_equipo is null or guardado_en_equipo <> id);

/* UN solo sitio, y ninguno si está atornillado dentro de otra cosa.
   Las tres reglas en un check, porque las tres dicen lo mismo: la
   respuesta a «¿dónde se guarda?» tiene que ser una. */
alter table equipamiento drop constraint if exists eq_un_solo_guardado;
alter table equipamiento add constraint eq_un_solo_guardado check (
  num_nonnulls(guardado_sitio, guardado_en_equipo) <= 1
  and (ensamblado_en is null
       or (guardado_sitio is null and guardado_en_equipo is null))
);

-- ------------------------------------------------------------
-- 3 · Y DÓNDE SE GUARDA CADA KIT
-- ------------------------------------------------------------
/* Un kit es una LISTA, no una cosa — pero la lista vive en un bolso, y
   ese bolso está en un cajón. Los mismos dos punteros, por lo mismo:
   «Bolso Kit de Grabación Portátil» se guarda EN el Bolso Maleta Tenba
   (un equipo), y «Centro De Carga» en la Mochila Rígida BKANO. */
alter table kits add column if not exists guardado_sitio uuid
  references sitios(id) on delete set null;
alter table kits add column if not exists guardado_en_equipo uuid
  references equipamiento(id) on delete set null;

alter table kits drop constraint if exists kit_un_solo_guardado;
alter table kits add constraint kit_un_solo_guardado
  check (num_nonnulls(guardado_sitio, guardado_en_equipo) <= 1);

-- ------------------------------------------------------------
-- 4 · PERMISOS
-- ------------------------------------------------------------
alter table sitios enable row level security;
drop policy if exists "leer_sitio"   on sitios;
drop policy if exists "crear_sitio"  on sitios;
drop policy if exists "editar_sitio" on sitios;
drop policy if exists "borrar_sitio" on sitios;
create policy "leer_sitio"   on sitios for select to authenticated using (true);
create policy "crear_sitio"  on sitios for insert to authenticated with check (true);
create policy "editar_sitio" on sitios for update to authenticated using (true);
create policy "borrar_sitio" on sitios for delete to authenticated using (true);

-- ------------------------------------------------------------
-- 5 · LO QUE YA ESTABA ESCRITO A MANO
--
--  Catorce kits llevan su sitio en la descripción. NO se borra ese
--  texto: se LEE para crear los sitios y colgar los kits, y la
--  descripción se queda como estaba hasta que alguien la revise. Un
--  traslado automático que además borra el original no se puede
--  comprobar después.
--
--  Se reconocen dos formas, que son las dos que hay:
--    «Se encuentra en el Cajón 07»   → un SITIO llamado «Cajón 07»
--    «Se encuentra en el Bolso Maleta Tenba» → un EQUIPO, si el nombre
--                                    casa con uno del inventario
--  Lo que no case con ninguna de las dos se queda sin tocar y sale
--  listado al final, para revisarlo a mano.
-- ------------------------------------------------------------

/* El trozo útil de la nota: lo que va después de «se encuentra en»,
   sin el artículo. `Falta definir donde se encuentra` no casa, que es
   lo correcto — es una nota que dice que NO se sabe. */
create or replace function _sitio_de_nota(txt text) returns text as $$
  select nullif(trim(regexp_replace(
    substring(txt from '(?i)se encuentra en\s+(.*)$'),
    '(?i)^(el|la|los|las)\s+', '')), '');
$$ language sql immutable;

-- 5a · Los que apuntan a un EQUIPO del inventario (el bolso, la maleta)
update kits k
   set guardado_en_equipo = e.id
  from equipamiento e
 where k.guardado_en_equipo is null and k.guardado_sitio is null
   and _sitio_de_nota(k.descripcion) is not null
   and lower(e.nombre) = lower(_sitio_de_nota(k.descripcion));

-- 5b · Los que quedan: se crean como SITIO y se cuelgan
insert into sitios (nombre)
select distinct _sitio_de_nota(k.descripcion)
  from kits k
 where k.guardado_en_equipo is null and k.guardado_sitio is null
   and _sitio_de_nota(k.descripcion) is not null
   and not exists (
     select 1 from sitios s
      where lower(s.nombre) = lower(_sitio_de_nota(k.descripcion))
        and s.dentro_de is null)
on conflict do nothing;

update kits k
   set guardado_sitio = s.id
  from sitios s
 where k.guardado_en_equipo is null and k.guardado_sitio is null
   and s.dentro_de is null
   and _sitio_de_nota(k.descripcion) is not null
   and lower(s.nombre) = lower(_sitio_de_nota(k.descripcion));

-- ── COMPROBAR ──
select 'sitios' as tabla,
       case when count(*) >= 0 then 'si' else 'NO' end as existe,
       count(*) as filas
from sitios;

select k.nombre as kit,
       coalesce(s.nombre, e.nombre) as se_guarda_en,
       case when s.id is not null then 'sitio'
            when e.id is not null then 'equipo'
            else '⚠ SIN TRASLADAR — revisar a mano' end as tipo,
       k.descripcion as nota_original
  from kits k
  left join sitios s on s.id = k.guardado_sitio
  left join equipamiento e on e.id = k.guardado_en_equipo
 order by tipo, kit;

drop function if exists _sitio_de_nota(text);
