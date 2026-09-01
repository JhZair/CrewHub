-- ══════════════════════════════════════════════════════════════════════════
--  db/proyecto-obra.sql — LAS OBRAS MUSICALES DE UN PROYECTO
--
-- El día que esta tabla hizo falta, en una sola conversación aparecieron
-- cuatro músicas distintas dentro del MISMO documental:
--
--   · «Fatal Destino», que toca la banda de Jennifer en el cargo de Lino.
--     Buscado en el catálogo de APDAYC: 15 registros con ese título exacto,
--     CADA UNO con un compositor distinto —Zenobio Dágha entre ellos, muerto
--     en 2008— y NINGUNO en dominio público. El título solo no identifica nada.
--   · «Valicha», que todo el mundo canta como tradicional: dos registros, uno
--     marcado DP y otro a nombre de una persona.
--   · Música generada con Suno especialmente para la pieza, que según Indecopi
--     (Res. 1111-2025/DDA) no tiene autor y por tanto no se puede registrar.
--   · Y la interpretación de Las Patronas, que sí es de ellas y sí se cede.
--
-- Ninguna de las cuatro se responde con la misma pregunta, y por eso ninguna
-- cabía en `proyecto_cesion`.
--
-- ── POR QUÉ NO ES UNA CESIÓN ──
-- `proyecto_cesion.persona_id` es NOT NULL, y con razón: una cesión la firma
-- alguien. Pero un tema de Suno no lo firma nadie, y un huayno de dominio
-- público tampoco. Meterlos ahí obligaba a inventar una persona para poder
-- guardar la fila, que es la clase de mentira que después se lee como un dato.
-- Son dos hechos distintos y por eso son dos tablas:
--     · `proyecto_cesion`  → QUIÉN autorizó qué.       (una persona)
--     · `proyecto_obra`    → QUÉ suena y de dónde sale. (una obra)
-- Cuando las dos hablan de lo mismo —Jennifer— se atan por `cesion_id`, y así
-- no pueden contradecirse. Ver más abajo.
--
-- ── LO QUE DE VERDAD SE GUARDA AQUÍ ES UNA FECHA ──
-- El campo más importante de esta tabla no es el autor: es `consultado_en`.
-- «Lo busqué en APDAYC el 31 de agosto de 2026 y decía esto» es una respuesta;
-- «creo que es de dominio público» no lo es. Un catálogo cambia, y lo que
-- protege a la productora no es haber acertado, es haber mirado y saber cuándo.
--
-- ── ESTO NO ES SOLO PARA DAFO ──
-- Al contrario. Es sobre todo para los proyectos que nunca van a tener fondo
-- —los de encargo y los autofinanciados— donde nadie te obliga a guardar el
-- papel hasta el día que la pieza va a un festival o a una emisión y alguien
-- pregunta quién autorizó esa música. Ese día el dato existe o no existe.
--
-- Idempotente y sin transacción (pgBouncer). Verifica al final.
-- ⚠ Requiere db/proyecto-cesiones.sql corrido antes (por la FK a la cesión).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists proyecto_obra (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,

  /* Cómo se llama en la película. No tiene por qué coincidir con el título
     registrado —el catálogo dice «FATAL DESTINO» y en el cargo lo llaman de
     otra manera—: para eso está `autor`/`iswc`, que guardan la identidad
     registral. Aquí va el nombre con el que se habla de él en la edición. */
  titulo      text not null,

  /* ── DE DÓNDE SALE ──
     Siete, y cada uno pide datos distintos. Lo que decide qué hay que
     averiguar no es el título ni el autor: es esto.

     `dominio_publico`      la composición ya no tiene titular. Pide ISWC y,
                            sobre todo, FECHA DE CONSULTA al catálogo.
     `preexistente_cedida`  existía antes y alguien nos deja usarla: la banda
                            que toca en el cargo. Ojo — quien interpreta cede
                            SU interpretación, no la composición de otro.
     `licenciada`           pagada a su titular. Pide el papel y hasta cuándo.
     `ia_generada`          Suno y parientes. Pide herramienta, PLAN y prompt.
     `original_encargada`   un compositor humano contratado para la pieza.
     `biblioteca`           Artlist, Epidemic y similares. Pide el ID y la
                            licencia; se parece a `licenciada` pero la prueba
                            es un enlace de la plataforma, no un contrato.
     `ambiente`             suena en el lugar y no lo controlas: una radio, una
                            banda que pasa. A veces se resuelve bajándola en la
                            mezcla, y eso también hay que poder anotarlo.

     ⚠ NO hay valor por defecto, a propósito. En las demás tablas el default
     evita que las filas viejas cambien de significado; aquí no hay filas
     viejas, y elegir por quien registra sería inventar el dato más
     determinante de la fila. Que lo diga quien lo sabe. */
  origen      text not null
              check (origen in ('dominio_publico','preexistente_cedida',
                                'licenciada','ia_generada','original_encargada',
                                'biblioteca','ambiente')),

  /* ── SI VIENE DE ALGUIEN DEL REPARTO ──
     Opcional: la mayoría de las obras no tienen persona detrás —un tema de
     dominio público no es de nadie— y forzar una convertiría la lista en un
     campo obligatorio que se rellena con cualquier cosa.
     `on delete set null`: si se borra la persona, la obra sigue sonando en la
     película. Perder el dato de la música porque alguien depuró una ficha
     sería exactamente al revés de lo que esta tabla existe para evitar. */
  persona_id  uuid references personas(id) on delete set null,

  /* ── Y SU CESIÓN, CUANDO LA HAY ──
     El puente entre las dos tablas. Con Jennifer: su fila del reparto tiene
     una cesión 🎵 firmada, y esta obra apunta a ELLA. Así la burbuja de la
     ficha y la obra hablan del mismo papel y no pueden decir cosas distintas.
     ⚠ Que la cesión sea de ESTA persona y de ESTE proyecto no lo puede
     comprobar un `check` —en Postgres un check no consulta otra tabla— así
     que lo valida la acción, con palabras. Mismo patrón que `crearTratamiento`
     con el fondo de otro proyecto.
     `on delete set null` y no `cascade`: si alguien borra la cesión por error,
     la obra tiene que seguir ahí diciendo que falta el papel. Con `cascade`
     desaparecería el problema junto con la prueba, que es la peor de las dos
     cosas que podían pasar. */
  cesion_id   uuid references proyecto_cesion(id) on delete set null,

  /* ── LA IDENTIDAD REGISTRAL ──
     Quién figura como compositor y con qué ISWC, TAL COMO LO DICE EL CATÁLOGO
     —no como creemos que se llama—. El ISWC es lo único que desempata: hay 15
     «FATAL DESTINO» y solo el código distingue el de Dágha del de Quintana.
     En `ia_generada` los dos quedan vacíos, y ese vacío es el dato: no hay
     autor que registrar. */
  autor       text,
  iswc        text,

  /* ── LA FECHA DE CONSULTA: EL CAMPO QUE SOSTIENE TODO ESTO ──
     Cuándo se miró el catálogo. Sin ella, «dominio público» es una opinión.
     Con ella es una diligencia con fecha, que es lo que se puede enseñar.
     `consultado_nota` guarda lo que decía la ficha —«Compositor/Autor: DP»,
     «dos registros, uno a nombre de Vivanco Moisés»—: el día que el catálogo
     cambie, esto dice qué se vio y ya no se puede reconstruir. */
  consultado_en   date,
  consultado_nota text,

  /* ── EL PAPEL ──
     Uno solo para los siete orígenes, a propósito: el contrato de la
     licencia, la cesión escaneada de la banda, el recibo de Artlist y la
     descarga oficial de Suno son la misma cosa —aquello que enseñas cuando
     alguien pregunta—. Con una columna por origen habría seis columnas vacías
     en cada fila y ninguna forma de preguntar «¿qué obras no tienen papel?».
     Misma lección que `cesion_url` en el reparto del fondo. */
  prueba_url  text,

  /* Hasta cuándo vale la licencia. Solo tiene sentido en `licenciada` y
     `biblioteca`, y es de los datos que se descubren tarde: una licencia
     vencida no avisa, y la pieza sigue circulando. */
  vigente_hasta date,

  /* ── LO DE LA IA ──
     `herramienta` va entera —«Suno v4.5»— porque el modelo importa: los
     modelos actuales se deprecan cuando lleguen los licenciados, y dentro de
     dos años «lo hice con Suno» no dirá con cuál.

     `plan_ia` es el campo que decide si puedes usarla, y por eso es
     vocabulario cerrado y no texto libre. Los términos de Suno son explícitos:
     free y basic solo permiten uso «personal and non-commercial», y un
     documental que va a festivales es uso comercial aunque no se venda.
     Pro y Premier ceden lo que Suno tenga. `otro` NO es «da igual»: es «no lo
     sé», y el recuento lo trata como pendiente, no como resuelto.
     ⚠ Si Suno renombra sus planes, esto se migra. Es preferible a un texto
     libre donde «PRO», «pro» y «Pro (anual)» son tres cosas distintas para
     cualquier recuento. */
  herramienta text,
  plan_ia     text check (plan_ia is null or plan_ia in
                          ('free','basic','pro','premier','otro')),
  prompt      text,

  /* Qué trabajo humano hay encima. Indecopi lo dice expresamente: usar IA como
     herramienta NO elimina la autoría humana, pero solo si hubo decisiones
     creativas propias —elegir, descartar, reordenar, cortar a la imagen,
     mezclar con lo grabado—. Esa frase es la diferencia entre «lo generó una
     máquina» y «lo compuse yo con una máquina», y hay que escribirla mientras
     se hace: después nadie se acuerda de qué tocó. */
  aporte_humano text,

  /* Cómo se resolvió lo que no se controla. Para `ambiente`, sobre todo:
     «bajada bajo el diálogo en la mezcla», «reemplazada por la de Suno»,
     «se pidió permiso a la radio». Una música de ambiente resuelta en la
     mezcla deja de ser un problema, y sin este campo seguiría contando como
     uno para siempre. */
  resuelto_como text,

  /* Dónde suena, en las palabras de la edición: «secuencia del cargo»,
     «créditos finales». No se ata a la escena porque las escenas aún no
     existen como tabla; el día que existan, esto seguirá siendo legible. */
  donde       text,
  nota        text,

  creado_en   timestamptz not null default now(),
  creado_por  uuid references perfiles(id)
);

/* ── POR QUÉ NO HAY ÍNDICE ÚNICO POR TÍTULO ──
   Sería el error de bulto de esta tabla. «Fatal Destino» son QUINCE obras
   distintas en el catálogo, y una película puede usar dos de ellas —o el mismo
   tema en dos secuencias con licencias distintas—. Un único sobre
   (proyecto_id, titulo) impediría registrar justamente el caso que hizo falta.
   La cesión de imagen sí lleva único porque ahí dos filas son una firma
   duplicada; aquí dos filas son dos canciones. */
create index if not exists idx_proy_obra on proyecto_obra(proyecto_id);

/* Para cruzar desde la ficha de una persona: «¿qué música aporta Jennifer?».
   Parcial: la mayoría de las obras no tienen persona y un índice sobre miles
   de nulos ocupa sin servir. */
create index if not exists idx_proy_obra_persona on proyecto_obra(persona_id)
  where persona_id is not null;

/* ── LOS CHECKS, FUERA DEL `create table` ──
   ⚠ Un `check` inline dentro de `create table if not exists` NO se aplica si
   la tabla ya existía: el `if not exists` se salta la sentencia ENTERA y el
   vocabulario cerrado que este archivo promete se quedaría sin poner. Se
   repiten aquí con `drop … if exists` + `add`, que es idempotente de verdad y
   corrige una tabla creada por una versión anterior del archivo.
   Mismo patrón que db/proyecto-cesiones.sql. */
alter table proyecto_obra drop constraint if exists proyecto_obra_origen;
alter table proyecto_obra add constraint proyecto_obra_origen
  check (origen in ('dominio_publico','preexistente_cedida','licenciada',
                    'ia_generada','original_encargada','biblioteca','ambiente'));
alter table proyecto_obra drop constraint if exists proyecto_obra_plan;
alter table proyecto_obra add constraint proyecto_obra_plan
  check (plan_ia is null or plan_ia in ('free','basic','pro','premier','otro'));

comment on table proyecto_obra is
  'Qué música suena en un proyecto y de dónde sale. Siete orígenes, cada uno '
  'con lo suyo que averiguar. Distinta de proyecto_cesion: la cesión la firma '
  'una persona, y una obra de dominio público o generada con IA no la firma '
  'nadie. Se atan por cesion_id cuando hablan del mismo papel.';

comment on column proyecto_obra.consultado_en is
  'Cuándo se miró el catálogo (APDAYC u otro). Es el campo que convierte '
  '«creo que es libre» en una diligencia con fecha. Sin él, el origen '
  'dominio_publico no está verificado: está supuesto.';

comment on column proyecto_obra.plan_ia is
  'El plan con el que se generó. Decide si el uso comercial está permitido: '
  'free y basic no lo permiten según los términos de Suno, y un documental que '
  'va a festivales es uso comercial. `otro` significa «no lo sé», no «da igual».';

-- ── RLS: mismo criterio que el resto de las relaciones del proyecto ──
alter table proyecto_obra enable row level security;
drop policy if exists po_sel on proyecto_obra;
drop policy if exists po_ins on proyecto_obra;
drop policy if exists po_upd on proyecto_obra;
drop policy if exists po_del on proyecto_obra;
create policy po_sel on proyecto_obra for select to authenticated using (true);
create policy po_ins on proyecto_obra for insert to authenticated with check (true);
create policy po_upd on proyecto_obra for update to authenticated using (true) with check (true);
create policy po_del on proyecto_obra for delete to authenticated using (true);

/* ── REALTIME ──
   Se publica: levantar diez temas es trabajo de varias personas a la vez y
   cada una tiene que ver lo que ya buscó la otra, o se buscan dos veces.
   Una tabla NO publicada abre la suscripción, dice SUBSCRIBED y no emite nada,
   sin error — y eso se descubre tarde.
   El `do` evita el error si ya estaba publicada. */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'proyecto_obra'
  ) then
    execute 'alter publication supabase_realtime add table public.proyecto_obra';
  end if;
end $$;

-- ------------------------------------------------------------
-- VERIFICAR — tabla 1, los dos índices a 1, cuatro políticas, publicada 1.
-- `filas` será 0 la primera vez; en las siguientes dice lo que ya hay.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'proyecto_obra')          as tabla,
  /* Que la columna exista no basta: si la tabla venía de una versión anterior
     del archivo, el `create table if not exists` se saltó entera. Se comprueba
     que estén las columnas que el código nuevo lee. */
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'proyecto_obra'
      and column_name in ('origen','consultado_en','plan_ia','cesion_id',
                          'aporte_humano','resuelto_como'))                  as columnas_debe_ser_6,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'idx_proy_obra')             as indice_proyecto,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'idx_proy_obra_persona')     as indice_persona,
  /* Que los checks estén PUESTOS, no solo escritos: es lo que falla al correr
     este archivo por segunda vez sobre una tabla vieja. */
  (select count(*) from pg_constraint
    where conrelid = 'public.proyecto_obra'::regclass
      and conname in ('proyecto_obra_origen','proyecto_obra_plan'))          as checks_debe_ser_2,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'proyecto_obra')             as politicas,
  /* Filtrado por esquema: un homónimo en otro daría un número mayor y la
     verificación fallaría sin que nada estuviera mal. */
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'proyecto_obra')             as en_realtime,
  (select count(*) from proyecto_obra)                                       as filas;
