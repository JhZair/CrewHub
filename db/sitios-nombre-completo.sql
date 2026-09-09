-- ============================================================
--  db/sitios-nombre-completo.sql
--
--  EL SITIO QUE SE LLAMA «08».
--
--  Creando los cajones de un mueble desde la pantalla se escribe el
--  número y ya —«01», «02»…— porque el tipo ya está elegido en el
--  desplegable de al lado y repetir «Cajón» doce veces es trabajo
--  tonto. La clave sale bien (C01) y la pantalla los pinta con su
--  ícono, así que dentro del mueble se leen perfectamente.
--
--  ⚠ FUERA DEL MUEBLE, NO. El nombre es lo que sale en la bitácora de
--  un equipo —«guardado en «08»»—, en la ficha, en la actividad y en
--  el buscador global, donde no hay mueble alrededor que lo explique.
--  «08» ahí no es un sitio: es un número suelto.
--
--  Esto le pone delante la etiqueta de su propio tipo: «08» → «Cajón
--  08». No inventa nada —el tipo ya estaba puesto— y no toca ni la
--  clave ni la posición, que siguen siendo las mismas.
--
--  ── SOLO LOS QUE SON NÚMERO PELADO ──
--  `^\d{1,3}$` y nada más. «Cajón 08» ya está bien y quedaría «Cajón
--  Cajón 08»; «Bandeja 3 del fondo» tiene nombre propio y no es esto
--  lo que le pasa. Correrlo dos veces no hace nada la segunda vez,
--  porque después del primero ya ninguno es número pelado.
-- ============================================================

-- ------------------------------------------------------------
--  LAS ETIQUETAS
--
--  ⚠ TIENEN QUE DECIR LO MISMO que `TIPOS_SITIO` en lib/sitios.ts.
--  Es el tercer sitio donde vive esta tabla —el `case` de las claves
--  en db/sitios-detalle.sql es el segundo— y si aquí un cajón se
--  llamara «Gaveta», el mismo sitio se llamaría de dos formas según
--  quién lo escribiera.
-- ------------------------------------------------------------
create or replace function _etiqueta_de_tipo(tipo text) returns text as $$
  select case tipo
    when 'oficina'        then 'Oficina'
    when 'almacen'        then 'Almacén'
    when 'mueble'         then 'Mueble'
    when 'estante'        then 'Estante'
    when 'cajon'          then 'Cajón'
    when 'compartimiento' then 'Compartimiento'
    when 'espacio'        then 'Espacio'
    else null
  end;
$$ language sql immutable;

/* ── EL RENOMBRADO, SALTÁNDOSE LO QUE CHOCA ──
   ⚠ La misma lección que costó db/sitios-detalle.sql: `idx_sitio_nombre_en_padre`
   es único por padre, así que un «08» que convive con un «Cajón 08» de
   su mismo mueble reventaría el `update` ENTERO y dejaría sin renombrar
   también a los once que no chocaban con nadie. Se renombra solo donde
   el nombre nuevo está libre, y lo demás sale listado abajo. */
update sitios s
   set nombre = c.propuesto
  from (
    select id, dentro_de, _etiqueta_de_tipo(tipo) || ' ' || nombre as propuesto
      from sitios
     where tipo is not null
       and nombre ~ '^\d{1,3}$'
       and _etiqueta_de_tipo(tipo) is not null
  ) c
 where s.id = c.id
   and not exists (
     select 1 from sitios o
      where o.id <> c.id
        and o.dentro_de is not distinct from c.dentro_de
        and lower(o.nombre) = lower(c.propuesto));

-- ── COMPROBAR ──

/* Lo que NO se pudo renombrar porque ya había un hermano con ese
   nombre. Vacía = se renombraron todos. Lo que salga aquí hay que
   mirarlo a mano: casi seguro son el mismo cajón por duplicado —uno
   creado a mano y otro que vino del traslado de las notas— y lo que
   toca es mover lo que cuelgue de uno al otro y borrar el que sobre. */
select c.propuesto as nombre_que_le_tocaba,
       c.nombre    as se_llama_ahora,
       coalesce(d.nombre, '— la raíz —') as dentro_de,
       (select o.id::text from sitios o
         where o.id <> c.id and o.dentro_de is not distinct from c.dentro_de
           and lower(o.nombre) = lower(c.propuesto)) as ya_lo_ocupa
  from (
    select id, dentro_de, nombre, _etiqueta_de_tipo(tipo) || ' ' || nombre as propuesto
      from sitios
     where tipo is not null and nombre ~ '^\d{1,3}$'
       and _etiqueta_de_tipo(tipo) is not null
  ) c
  left join sitios d on d.id = c.dentro_de
 order by 3, 1;

/* Cómo quedó el árbol. El código completo se arma subiendo la cadena
   —igual que `codigoDeRuta` en lib/sitios.ts—, así que esta consulta
   sirve además para ver de un vistazo a quién le falta la clave: sale
   con el código en null. */
with recursive cadena as (
  select id, dentro_de, nombre, clave, tipo, fila, columna,
         nombre as ruta, clave as codigo, 1 as nivel
    from sitios where dentro_de is null
  union all
  select h.id, h.dentro_de, h.nombre, h.clave, h.tipo, h.fila, h.columna,
         c.ruta || ' › ' || h.nombre,
         /* Un solo eslabón sin clave deja el código entero en null, que
            es exactamente lo que hace la pantalla: «OF01-C01» saltándose
            el mueble sería el código válido de OTRO sitio. */
         case when c.codigo is null or h.clave is null then null
              else c.codigo || '-' || h.clave end,
         c.nivel + 1
    from sitios h join cadena c on h.dentro_de = c.id
   where c.nivel < 12
)
select coalesce(codigo, '— sin código —') as codigo,
       ruta,
       coalesce(tipo, '— sin tipo —') as tipo,
       case when fila is null then '' else fila || '·' || columna end as rejilla
  from cadena
 order by ruta;

drop function if exists _etiqueta_de_tipo(text);
