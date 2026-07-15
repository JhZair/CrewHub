-- Recibos por honorarios girados. Hasta ahora vivían en la PC de Katy:
-- invisibles para el sistema que debería vigilarlos.
-- Importan por dos razones:
--   1) El tope de 4ta. Si la persona supera el límite anual, la
--      suspensión se rompe y hay que retenerle el 8% por el resto del
--      año. Como nosotros manejamos su clave SOL y le giramos los RHE,
--      somos los únicos que podemos darnos cuenta a tiempo.
--   2) La rendición del fondo: qué se le pagó a quién y por qué proyecto.

create table if not exists rhe (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references personas(id) on delete cascade,
  numero      text,                        -- "E001-123"
  fecha       date not null,
  monto       numeric(12,2) not null,
  retencion   numeric(12,2) default 0,     -- el 8% cuando no hay suspensión
  concepto    text,
  proyecto_id uuid references proyectos(id),
  url         text,                        -- el PDF del recibo
  creado_en   timestamptz default now(),
  creado_por  uuid references perfiles(id)
);

create index if not exists idx_rhe_persona on rhe(persona_id, fecha);
create index if not exists idx_rhe_fecha   on rhe(fecha);

alter table rhe enable row level security;
create policy "leer_rhe"   on rhe for select to authenticated using (true);
create policy "crear_rhe"  on rhe for insert to authenticated with check (true);
create policy "editar_rhe" on rhe for update to authenticated using (true);
create policy "borrar_rhe" on rhe for delete to authenticated using (true);

-- Lo declarado ante SUNAT al pedir la suspensión: sirve para contrastar
-- lo proyectado contra lo que realmente termina cobrando.
alter table personas add column if not exists suspension_4ta_acumulado numeric(12,2);
alter table personas add column if not exists suspension_4ta_proyectado numeric(12,2);
