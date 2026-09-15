-- ============================================================
--  db/repositorio-casa.sql
--
--  🏠 EL MATERIAL QUE ES DEL EQUIPO Y DE NADIE.
--
--  `objetos` pide dueño y hace bien: una obra es de un proyecto, un
--  premio de una persona, y por eso salen en SU ficha. Pero un curso,
--  una plantilla de contrato, una guía de estilo o la normativa del
--  cine no son «de» nadie — son PARA todos.
--
--  Hasta hoy eso obligaba a colgarlos de una empresa, con dos costes:
--  la ficha de esa empresa acababa enseñando un tutorial entre sus
--  premios, y como aquí se trabaja con varias productoras a la vez,
--  cuál elegir era arbitrario. Lo arbitrario se decide distinto cada
--  vez, que es exactamente como un filtro deja de servir.
--
--  Y el efecto real era peor que el desorden: el propio formulario ya
--  avisaba de que «obligar a resolver el dueño primero hace que no se
--  guarde». El material sin sitio no se guarda mal — no se guarda.
--
--  Así que se abre un dueño sin ficha: `entidad_tipo = 'casa'` con
--  `entidad_id` nulo. Aparece solo en /repositorio.
--
--  ⚠ NO es una entidad del sistema y no debe llegar a serlo: no tiene
--  tabla, ni ruta, ni ficha, y por eso no está en `SECCIONES`
--  (lib/secciones.ts). Es una etiqueta de estantería, no un sujeto.
--
--  Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

-- El id del dueño pasa a poder faltar. Solo puede faltar en un caso, y
-- el check lo ata en los dos sentidos:
--   · si el dueño es la casa, NO puede haber id —apuntaría a una ficha
--     que no existe—;
--   · si es cualquier otra cosa, el id sigue siendo obligatorio, que es
--     lo que impide que un objeto se quede huérfano por descuido.
-- Sin la segunda mitad, esta migración habría abierto la puerta a
-- objetos sin dueño de cualquier tipo: material que no sale en ninguna
-- ficha y que nadie vuelve a encontrar.
alter table objetos alter column entidad_id drop not null;

alter table objetos drop constraint if exists objetos_dueno_chk;
alter table objetos add constraint objetos_dueno_chk check (
  (entidad_tipo = 'casa' and entidad_id is null)
  or (entidad_tipo <> 'casa' and entidad_id is not null)
);

comment on column objetos.entidad_id is
  'De quién es. NULO solo cuando entidad_tipo = ''casa'': material del equipo, sin ficha donde colgarlo.';

-- El índice de siempre sigue sirviendo —Postgres indexa los nulos— y
-- las fichas consultan por (tipo, id), así que lo de la casa no se
-- cuela en ninguna: ninguna ficha pregunta por un id nulo.

select
  (select count(*) from information_schema.columns
     where table_name='objetos' and column_name='entidad_id'
       and is_nullable='YES') as id_opcional,
  (select count(*) from pg_constraint where conname='objetos_dueno_chk') as chk,
  (select count(*) from objetos where entidad_tipo='casa') as de_la_casa;
