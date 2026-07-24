-- Actores sociales de un PROYECTO: los personajes de la vida real que
-- protagonizan el documental. Es una relación proyecto↔persona(s) distinta del
-- equipo (proyecto_equipo, quienes HACEN la película) y del cliente:
-- aquí van a quienes la película RETRATA.
--
-- Cada actor lleva un rol corto (protagonista, secundario…) y una descripción
-- breve del personaje —útil para las postulaciones DAFO, donde el jurado
-- valora a quién se cuenta.
--
-- Correr una sola vez en Supabase (SQL editor).

create table if not exists proyecto_actores (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references proyectos(id) on delete cascade,
  persona_id   uuid not null references personas(id)  on delete cascade,
  rol          text,
  descripcion  text,
  orden        int  not null default 0,
  creado_en    timestamptz not null default now()
);

create index if not exists proyecto_actores_proyecto_idx on proyecto_actores(proyecto_id);

alter table proyecto_actores enable row level security;

-- Mismo criterio que las demás relaciones del proyecto: cualquier usuario
-- autenticado del equipo puede leer y editar.
create policy pa_sel on proyecto_actores for select to authenticated using (true);
create policy pa_ins on proyecto_actores for insert to authenticated with check (true);
create policy pa_upd on proyecto_actores for update to authenticated using (true) with check (true);
create policy pa_del on proyecto_actores for delete to authenticated using (true);
