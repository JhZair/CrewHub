-- ============================================================
--  Plataformas — dónde se entra, en un solo sitio
--
--  El link de una plataforma estaba en dos lados a la vez:
--    · SUNAT, quemado en components/BotonFichaSunat.tsx (línea 4)
--    · DAFO, repetido en cada credencial (seis empresas, seis copias)
--  O sea: para cambiar una URL había que tocar código o seis filas.
--
--  La URL pertenece a la PLATAFORMA, no a cada credencial que la usa. Aquí
--  vive una vez y la credencial la hereda por nombre.
--
--  `requiere_cuenta` distingue dos cosas que se parecen y no lo son:
--    · DAFO, SUNAT SOL → hay usuario y clave; la URL es la puerta de esa cuenta
--    · consulta RUC    → herramienta pública, cualquiera entra, no hay clave
--  Sin esa marca, «SUNAT» tendría dos URLs y nadie sabría cuál es cuál.
-- ============================================================

create table if not exists plataformas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,     -- "DAFO-Estímulos", "SUNAT SOL"
  url             text,                     -- la puerta
  requiere_cuenta boolean default true,     -- false = herramienta pública
  clave           text unique,              -- para las que el código busca por nombre fijo
  notas           text,                     -- "elegir la pestaña Por Documento"
  creado_en       timestamptz default now()
);

alter table plataformas enable row level security;

-- `drop ... if exists` antes de cada `create`: `create policy` no tiene un
-- «if not exists», así que sin esto el archivo revienta la segunda vez que
-- se corre. Y estos archivos siempre se corren dos veces —se corrige algo,
-- se vuelve a pegar—, así que tienen que aguantarlo.
drop policy if exists "leer_plat"   on plataformas;
drop policy if exists "crear_plat"  on plataformas;
drop policy if exists "editar_plat" on plataformas;
drop policy if exists "borrar_plat" on plataformas;

create policy "leer_plat"   on plataformas for select to authenticated using (true);
create policy "crear_plat"  on plataformas for insert to authenticated with check (true);
create policy "editar_plat" on plataformas for update to authenticated using (true);
create policy "borrar_plat" on plataformas for delete to authenticated using (true);

-- Las dos que ya usamos hoy. `clave` es el nombre con el que el código las
-- pide: si alguien renombra la plataforma, el código sigue encontrándola.
insert into plataformas (nombre, url, requiere_cuenta, clave, notas) values
  ('DAFO-Estímulos', 'https://plataformamincu.cultura.gob.pe/administrados',
   true, 'dafo', 'Plataforma de administrados del Ministerio de Cultura. Se entra con el RUC, no con correo.'),
  ('SUNAT — Consulta RUC', 'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp',
   false, 'sunat_consulta_ruc',
   'Herramienta pública. Su buscador exige POST y captcha, así que no se puede enlazar el número directo: el sistema lo copia al portapapeles y abre la página para que solo quede pegar.'),
  -- Sin URL a propósito: no invento el link de acceso a SUNAT justamente
  -- porque cambia. Sale en rojo («⚠ sin link») en /admin?s=plataformas y se
  -- pega el que se usa de verdad. Es la diferencia con la de arriba, que es
  -- pública: esta es una cuenta, y su puerta es donde aparecen las falsas.
  ('SUNAT-ClaveSOL', null, true, 'sunat_sol',
   'Pide TRES datos: RUC + usuario SOL + contraseña. El usuario SOL se guarda como dato de la credencial.')
on conflict (nombre) do nothing;

-- Las credenciales heredan el link de su plataforma: la columna `url` de
-- credenciales queda como excepción (una empresa que entra por otra puerta),
-- no como el sitio donde vive el dato.
update credenciales c
   set url = p.url
  from plataformas p
 where c.url is null
   and lower(btrim(c.plataforma)) = lower(btrim(p.nombre));

-- Ver cómo quedó
select p.nombre, p.url, p.requiere_cuenta,
       (select count(*) from credenciales c
         where lower(btrim(c.plataforma)) = lower(btrim(p.nombre))) as credenciales
  from plataformas p order by p.nombre;
