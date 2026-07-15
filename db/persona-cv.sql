-- Biblioteca de CVs por enfoque.
-- Un CV no es un atributo de la persona sino de la combinación
-- persona × rol: Yajaida necesita un CV como Directora y otro como
-- Investigadora, y ambos son válidos a la vez. Por eso `cv_url` (uno
-- solo por persona) se queda corto y se reemplaza por esta tabla.
-- El `enfoque` se elige de las especialidades de la persona, para que
-- pueda cruzarse con el cargo con el que postula.

create table if not exists persona_cv (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid not null references personas(id) on delete cascade,
  enfoque      text not null,           -- "Director/a", "Investigador/a"...
  url          text not null,           -- link al Drive
  actualizado  date,                    -- última vez que se rehízo
  creado_en    timestamptz default now(),
  unique (persona_id, enfoque)          -- un CV por enfoque; se actualiza, no se duplica
);

create index if not exists idx_cv_persona on persona_cv(persona_id);

alter table persona_cv enable row level security;
create policy "leer_cv"   on persona_cv for select to authenticated using (true);
create policy "crear_cv"  on persona_cv for insert to authenticated with check (true);
create policy "editar_cv" on persona_cv for update to authenticated using (true);
create policy "borrar_cv" on persona_cv for delete to authenticated using (true);

-- Rescatar los CV ya cargados: entran como enfoque "General" para no
-- perderlos. Luego cada uno se reclasifica a su rol real.
insert into persona_cv (persona_id, enfoque, url, actualizado)
select id, 'General', cv_url, current_date
  from personas
 where cv_url is not null and cv_url <> ''
on conflict (persona_id, enfoque) do nothing;

-- Una vez comprobado que se migraron, se puede retirar la columna vieja:
-- alter table personas drop column if exists cv_url;
