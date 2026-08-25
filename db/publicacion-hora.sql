-- ============================================================
--  db/publicacion-hora.sql — LA HORA, Y EL TIPO «REUNIÓN»
--
--  ⚠ Correr DESPUÉS de db/publicacion-fecha-inicio.sql.
--
--  ── POR QUÉ UNA HORA ──
--  Una reunión sin hora es media reunión. Las fechas de un caso son `date`
--  —del desembolso al vencimiento, del inicio del rodaje a su fin— porque un
--  plazo se cumple en un DÍA: nadie vence a las 15:30. Una reunión sí ocurre
--  a las 15:30, y hasta hoy eso solo se podía escribir en el título, donde
--  ninguna pantalla puede leerlo, ordenarlo ni avisarlo.
--
--  `time` y no `timestamptz`: la hora de una reunión es la del reloj de la
--  pared en Cusco. Guardarla como instante obligaría a elegir zona en cada
--  lectura y a que «10:00» se convirtiera en «09:00» el día que alguien abra
--  el sistema desde otro huso — que es justo el error que este repositorio
--  arrastró con `creado_en` y los días de Lima.
--
--  ── POR QUÉ «REUNIÓN» ES UN TIPO Y «RODAJE» NO ──
--  El tipo contesta QUÉ CLASE de cosa es, no de qué va. «Rodaje» es asunto
--  —para eso están las etiquetas— y se comporta como cualquier tarea: se hace
--  y se resuelve. Una reunión no: su fecha es cuándo OCURRE y no cuándo
--  vence, y pasada la hora no está vencida ni pendiente, está hecha. Con tipo
--  tarea se quedaba en el tablero esperando que alguien la cerrara, y nadie
--  cierra una reunión que ya pasó.
--  El tipo vive en TypeScript (lib/tipos.ts) y `publicaciones.tipo` es texto
--  libre a propósito, así que aquí no hay nada que migrar para eso: solo el
--  gemelo SQL de `esInformativo`, abajo.
--
--  Idempotente. Correr en Supabase → SQL Editor.
-- ============================================================

alter table publicaciones add column if not exists hora time;

comment on column publicaciones.hora is
  'A qué hora ocurre. Solo para lo que pasa a una hora (hoy: tipo reunion). Hora de pared, sin zona: la de Cusco. Las demás fechas del caso son plazos y se cumplen en un día entero.';


-- ============================================================
--  EL GEMELO DE `esInformativo`, EN SQL
--
--  ⚠ ESTA FUNCIÓN Y `esInformativo` (lib/estados.ts) TIENEN QUE DECIR LO
--  MISMO. El Bot de las 7:30 vive dentro de Postgres y no puede leer el
--  TypeScript: mientras no supo lo de la bitácora, le preguntó a cada nota
--  del muro «¿sigue vivo?» cada tres días durante meses — y una bitácora no
--  se puede cerrar, así que no había forma de callarlo.
--  Una reunión tiene el mismo problema: no se resuelve. Sin esta línea, el
--  Bot le preguntaría a cada reunión pasada si sigue viva, para siempre.
-- ============================================================

create or replace function public.es_informativa(t text) returns boolean
 language sql immutable parallel safe
as $$ select coalesce(t, '') in ('aviso', 'bitacora', 'reunion') $$;


-- ============================================================
--  VERIFICAR
-- ============================================================
-- 1. La columna, opcional.
-- 2. Que la función ya reconozca los tres tipos informativos. Si «reunion»
--    sale en `false`, el Bot va a perseguir reuniones pasadas.
select 'columna' as prueba, column_name as detalle,
       case when is_nullable = 'YES' then 'opcional ✅' else 'obligatoria ⚠' end as estado
  from information_schema.columns
 where table_name = 'publicaciones' and column_name = 'hora'
union all
select 'informativa(' || t || ')', '',
       case when public.es_informativa(t) then 'sí ✅' else 'NO ⚠' end
  from unnest(array['aviso', 'bitacora', 'reunion', 'tarea']) as t;
