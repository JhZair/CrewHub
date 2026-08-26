-- ══════════════════════════════════════════════════════════════════════════
-- UN ÍNDICE PARA «QUÉ HIZO FULANO»
--
-- `actividad` tenía dos índices: por entidad (el historial de UNA ficha) y por
-- fecha (lo último de todos). Faltaba el tercero, que es el que usan los dos
-- sitios donde se filtra por PERSONA: los chips de /historial y, desde ahora,
-- las caras de la portada.
--
-- Sin él, elegir a Wilfredo obliga a recorrer y ordenar las ~11 000 filas de
-- la tabla para quedarse con sesenta. Hoy se nota poco; la tabla crece una
-- fila por cada acción de cualquiera, así que es de las que se arreglan antes
-- de que duela y no después.
--
-- Va con `creado_en desc` dentro del índice porque las dos consultas piden
-- exactamente eso: las últimas de esa persona. Con el índice a secas sobre
-- `actor_id`, la ordenación se seguía haciendo a mano.
-- ══════════════════════════════════════════════════════════════════════════

create index if not exists idx_actividad_actor
  on actividad(actor_id, creado_en desc);

-- VERIFICAR (debe decir «Index Scan using idx_actividad_actor»)
-- explain analyze
-- select * from actividad where actor_id = '00000000-0000-0000-0000-000000000000'
--  order by creado_en desc limit 60;
