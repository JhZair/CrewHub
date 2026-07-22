-- ============================================================
-- COMENTARIOS SOBRE UN OBJETO — sin abrir un caso.
--
-- Primero se intentó que conversar sobre un objeto fuera abrir un caso, para
-- no construir dos motores de conversación. La idea era buena y la práctica la
-- desmintió: un caso es una UNIDAD DE TRABAJO —trae estado, responsable, fecha
-- límite, sub-casos y barra de avance— y un comentario sobre un libro no es
-- trabajo. Todo eso quedaba de adorno, la barra decía «Trabajo 100% · 1 de 1
-- vinculadas» sin sentido, y ese caso se quedaba «Sin Resolver» para siempre
-- ensuciando el tablero. Multiplicado por cada objeto, insostenible.
--
-- Pero lo otro del argumento sí valía: NO queremos dos bandejas ni dos caminos
-- de notificación. Así que el comentario del objeto usa la MISMA tabla y el
-- MISMO motor de menciones y avisos — solo cambia de quién cuelga.
-- Una sola bodega, dos puertas (igual que los CVs en `objetos`).
--
-- Idempotente, SIN transacción externa (lección pgBouncer).
-- ============================================================

-- ── Comentarios: ahora cuelgan de una publicación O de un objeto ──
alter table comentarios add column if not exists objeto_id uuid references objetos(id) on delete cascade;
alter table comentarios alter column publicacion_id drop not null;

-- Exactamente uno de los dos. Sin esto, un comentario huérfano (o de dos
-- dueños) no lo detecta nadie hasta que una pantalla se rompe.
alter table comentarios drop constraint if exists comentarios_dueno_chk;
alter table comentarios add constraint comentarios_dueno_chk
  check ((publicacion_id is not null) <> (objeto_id is not null));

create index if not exists idx_com_objeto on comentarios(objeto_id, creado_en);

/* La policy de INSERT vivía solo en el dashboard (como la tabla credenciales).
   Se declara aquí, explícita y versionada: el autor es quien comenta, y da
   igual si cuelga de un caso o de un objeto. */
drop policy if exists "crear_com" on comentarios;
create policy "crear_com" on comentarios
  for insert to authenticated with check (autor_id = auth.uid());

-- ── Notificaciones: también pueden apuntar a un objeto ──
-- `publicacion_id` ya era nullable, así que una notificación de objeto la deja
-- vacía y llena `objeto_id`. Las pantallas resuelven el enlace según cuál venga.
alter table notificaciones add column if not exists objeto_id uuid references objetos(id) on delete cascade;
-- Sin índice, cada borrado de objeto obliga a un seq scan por la FK en cascada.
create index if not exists idx_notif_objeto on notificaciones(objeto_id) where objeto_id is not null;
