-- ============================================================
--  db/proyecto-personajes.sql — EL PERSONAJE QUE NO EXISTE
--
--  `proyecto_actores` nació para el documental, donde la persona Y el
--  personaje son la misma cosa: Braulia Puma es Braulia Puma. Por eso
--  `persona_id` es `not null` y por eso ROBOTRASH no puede registrar a
--  Robomac: un robot de un mundo digital no tiene ficha en `personas`,
--  y no debe tenerla —ahí viven los DNI, las jornadas y los contactos—.
--
--  En ficción y animación son DOS cosas, y además no van al mismo ritmo:
--  el personaje existe desde el guion, el intérprete aparece en casting
--  meses después. Un modelo que exija la persona para poder nombrar al
--  personaje obliga a esperar al casting para escribir el reparto.
--
--  La misma tabla, con la persona opcional:
--    · documental → persona sin personaje  (Braulia es Braulia)
--    · ficción    → personaje con o sin intérprete
--
--  ── Y LA FICHA ──
--  Un personaje tampoco es un nombre y un rol: es qué QUIERE y qué
--  NECESITA, que casi nunca son lo mismo, y esa distancia es la historia.
--  Esas dos preguntas no son de ficción: el tratamiento de un documental
--  las pide igual —cuál es el deseo de Braulia y qué descubre— y el jurado
--  DAFO lee justamente eso. Así que la ficha es de cualquiera a quien la
--  película retrate, invente o no.
--
--  Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ============================================================

-- ── 1. El personaje y su cara ──
alter table proyecto_actores add column if not exists personaje  text;
alter table proyecto_actores add column if not exists imagen_url text;

-- ── 2. La ficha ──
--  `descripcion`, que ya existía, hace de SINOPSIS: no se duplica.
alter table proyecto_actores add column if not exists arquetipo text;  -- Héroe, Mentor, Sombra…
alter table proyecto_actores add column if not exists edad      text;  -- texto, no número:
                                                                       -- «16», «adulta», «de 40 a 70»
alter table proyecto_actores add column if not exists genero    text;
alter table proyecto_actores add column if not exists rasgos    text;  -- cómo es y cómo se ve
/* Querer y necesitar, cada uno con su cómo. Van en cuatro campos y no en un
   párrafo porque separados obligan a contestar las cuatro preguntas; juntos se
   contesta la primera y se dan por dichas las otras tres. */
alter table proyecto_actores add column if not exists quiere         text;
alter table proyecto_actores add column if not exists quiere_como    text;
alter table proyecto_actores add column if not exists necesita       text;
alter table proyecto_actores add column if not exists necesita_como  text;
alter table proyecto_actores add column if not exists notas          text;

-- ── 3. La persona pasa a ser opcional ──
--  `drop not null` es idempotente: sobre una columna que ya lo admite, no hace nada.
alter table proyecto_actores alter column persona_id drop not null;

/* ── LA FILA VACÍA ──
   Con las dos columnas opcionales, nada impedía guardar una fila sin persona
   y sin personaje: una entrada del reparto que no nombra a nadie. No falla,
   no se ve, y aparece en la lista como un hueco que nadie sabe de dónde salió.
   Al menos una de las dos. */
alter table proyecto_actores drop constraint if exists proyecto_actores_alguien;
alter table proyecto_actores add constraint proyecto_actores_alguien
  check (persona_id is not null or nullif(btrim(personaje), '') is not null);

-- ── VERIFICACIÓN ──
select
  (select is_nullable from information_schema.columns
    where table_name = 'proyecto_actores' and column_name = 'persona_id')  as persona_opcional,
  (select count(*) from information_schema.columns
    where table_name = 'proyecto_actores'
      and column_name in ('personaje','imagen_url','arquetipo','edad','genero',
                          'rasgos','quiere','quiere_como','necesita','necesita_como','notas'))
                                                                           as columnas_nuevas,
  (select count(*) from pg_constraint where conname = 'proyecto_actores_alguien')
                                                                           as check_alguien,
  (select count(*) from proyecto_actores)                                  as filas_existentes;
-- persona_opcional = YES · columnas_nuevas = 11 · check_alguien = 1
