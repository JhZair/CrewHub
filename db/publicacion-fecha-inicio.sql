-- ============================================================
--  db/publicacion-fecha-inicio.sql — UN CASO PUEDE DURAR
--
--  Hasta hoy un caso solo sabía CUÁNDO VENCE. No sabía cuándo empieza, y en
--  la línea de tiempo la barra arrancaba el día en que alguien lo escribió:
--  «Rodaje bloque Zenon» se dibujaba desde la fecha del registro, no desde la
--  fecha del rodaje. La agenda estaba pintando la vida del apunte en lugar de
--  la del trabajo.
--
--  ── POR QUÉ UNA COLUMNA Y NO UN TIPO «RODAJE» ──
--  El tipo contesta QUÉ CLASE de cosa es —tarea, problema, consulta, pago,
--  idea, aviso— y es ortogonal al asunto. «Rodaje» es asunto, y para eso
--  están las etiquetas y los vínculos. Si el rodaje fuera un tipo, mañana
--  harían falta viaje, taller, montaje y entrega, cada uno con sus campos, y
--  el combo dejaría de ser una pregunta que se pueda contestar rápido.
--  Durar no es exclusivo del rodaje: un viaje dura, un taller dura, una
--  campaña dura. Por eso la ventana es del CASO y no de una clase de caso.
--
--  ── DOS FECHAS, NO TRES ──
--  `fecha_inicio` = cuándo empieza. `fecha_limite`, la que ya existe, hace de
--  fin. No se añade un vencimiento aparte: sería una tercera fecha que las
--  quince pantallas que hoy leen `fecha_limite` tendrían que aprender a
--  distinguir, y ese aprendizaje se paga en cada una. Si algún día un rodaje
--  necesita «va del 3 al 7 y se rinde el 20», eso ya tiene sitio: el
--  cronograma del proyecto, que es donde vive la planificación.
--
--  ── EL CHECK ES LA ÚLTIMA LÍNEA, NO LA PRIMERA ──
--  Las acciones validan y explican con palabras («el inicio no puede ir
--  después del vencimiento»). Esto de aquí atrapa lo que entre por otra
--  puerta —un import, el SQL Editor, un bot futuro—. Una regla que solo vive
--  en el formulario es una regla que se salta cualquiera que no use el
--  formulario.
--
--  Idempotente. Correr en Supabase → SQL Editor.
-- ============================================================

alter table publicaciones add column if not exists fecha_inicio date;

comment on column publicaciones.fecha_inicio is
  'Cuándo EMPIEZA el trabajo. Opcional: la mayoría de los casos no duran, pasan. Con ella, la agenda dibuja la ventana real (fecha_inicio → fecha_limite) en vez de arrancar en creado_en. Nunca posterior a fecha_limite.';

comment on column publicaciones.fecha_limite is
  'Cuándo vence. Con fecha_inicio puesta hace también de FIN de la ventana: no hay una tercera fecha.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'publicaciones_ventana_ok') then
    alter table publicaciones add constraint publicaciones_ventana_ok
      check (fecha_inicio is null or fecha_limite is null or fecha_inicio <= fecha_limite);
  end if;
end $$;


-- ============================================================
--  VERIFICAR
-- ============================================================
-- 1. Que la columna esté y sea opcional.
-- 2. Que el candado exista. Si alguna de las dos filas no sale, algo no corrió.
select 'columna' as prueba, column_name as detalle,
       case when is_nullable = 'YES' then 'opcional ✅' else 'obligatoria ⚠' end as estado
  from information_schema.columns
 where table_name = 'publicaciones' and column_name = 'fecha_inicio'
union all
select 'candado', conname, 'puesto ✅'
  from pg_constraint where conname = 'publicaciones_ventana_ok';
