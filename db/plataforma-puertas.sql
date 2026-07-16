-- ============================================================
--  Puertas — una plataforma puede tener más de una entrada
--
--  Clave SOL rompió el supuesto de `plataformas.url`: es UNA cuenta
--  —mismo RUC, mismo usuario SOL, misma clave— con TRES entradas a sitios
--  distintos. Con un solo campo `url` entraba una y las otras dos se
--  perdían; y quien va a declarar el IGV no necesita el menú general,
--  necesita su entrada.
--
--  El reparto, para que no haya dos sitios diciendo lo mismo:
--    · plataformas.url  = la puerta principal. Es la que heredan las
--                         credenciales y la que abre el sistema solo
--                         (BotonFichaSunat). Toda plataforma tiene una.
--    · puertas          = las entradas ADICIONALES, con nombre de para qué
--                         sirven. Casi ninguna plataforma tiene; SOL sí.
--
--  Depende de db/plataformas.sql — córrelo primero.
-- ============================================================

create table if not exists plataforma_puertas (
  id            uuid primary key default gen_random_uuid(),
  plataforma_id uuid not null references plataformas(id) on delete cascade,
  titulo        text not null,          -- "Mis declaraciones y pagos"
  url           text not null,
  notas         text,                   -- para qué sirve, en cristiano
  orden         int default 0,
  creado_en     timestamptz default now(),
  -- Para que el sembrado de abajo se pueda repetir sin duplicar
  unique (plataforma_id, titulo)
);
create index if not exists puertas_plat on plataforma_puertas (plataforma_id);

alter table plataforma_puertas enable row level security;

-- `create policy` no tiene «if not exists»: sin estos drop, el archivo
-- revienta la segunda vez que se corre. Y siempre hay una segunda vez.
drop policy if exists "leer_puerta"   on plataforma_puertas;
drop policy if exists "crear_puerta"  on plataforma_puertas;
drop policy if exists "editar_puerta" on plataforma_puertas;
drop policy if exists "borrar_puerta" on plataforma_puertas;

create policy "leer_puerta"   on plataforma_puertas for select to authenticated using (true);
create policy "crear_puerta"  on plataforma_puertas for insert to authenticated with check (true);
create policy "editar_puerta" on plataforma_puertas for update to authenticated using (true);
create policy "borrar_puerta" on plataforma_puertas for delete to authenticated using (true);

-- ── Las tres de Clave SOL ────────────────────────────────────
-- La principal: el Menú SOL general. Va en plataformas.url porque es la
-- que hereda la credencial de cada empresa.
update plataformas
   set url = 'https://api-seguridad.sunat.gob.pe/v1/clientessol/4f3b88b3-d9d6-402a-b85d-6a0bc857746a/oauth2/loginMenuSol?lang=es-PE&showDni=true&showLanguages=false&originalUrl=https://e-menu.sunat.gob.pe/cl-ti-itmenu/AutenticaMenuInternet.htm&state=rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcAUH2sHDFmDRAwACRgAKbG9hZEZhY3RvckkACXRocmVzaG9sZHhwP0AAAAAAAAx3CAAAABAAAAADdAADZXhlcHQABnBhcmFtc3QASyomKiYvY2wtdGktaXRtZW51L01lbnVJbnRlcm5ldC5odG0mYjY0ZDI2YThiNWFmMDkxOTIzYjIzYjY0MDdhMWMxZGI0MWU3MzNhNnQABGV4ZWNweA=='
 where clave = 'sunat_sol' and url is null;

-- Las otras dos, con el nombre de para qué sirven: nadie entra «a SUNAT»,
-- entra a declarar el IGV o a la renta anual.
insert into plataforma_puertas (plataforma_id, titulo, url, notas, orden)
select p.id, v.titulo, v.url, v.notas, v.orden
  from plataformas p
  cross join (values
    ('Mis declaraciones y pagos',
     'https://api-seguridad.sunat.gob.pe/v1/clientessol/59d39217-c025-4de5-b342-393b0f4630ab/oauth2/loginMenuSol?lang=es-PE&showDni=true&showLanguages=false&originalUrl=https://e-menu.sunat.gob.pe/cl-ti-itmenu2/AutenticaMenuInternetPlataforma.htm&state=rO0ABXQA7HpIam90dXJFVVlqQlpNb2t3NE8xQUZiZFBYdG5qZlhKbzVRQ3k0TnBZZ0lWNWhBNDU4OTZWU2xUbU85V1pVa2gvQUU2N09OR1VPR0M2d2g1YTBmMkxlOGpZQWNiazcyVXkweEhkTU44QWQrNVJCYUJURkgvcHdPRkxGZkplSTN5dkFESjdBSXZXM2lZbkZOc2NwMWNsbWJ2c1pXeUJQVnNIOEdERklJZWFCd1AvRFFVTFcraGRoeGk0YTczVC9pS3Z0Vmd1WVBqODlJckN3LzViaE5LelBmcnNqcURTNHdNOVYvTitvYTVyVmM9',
     'IGV — Renta mensual, retenciones y percepciones, detracciones.', 1),
    ('Renta anual — Personas y empresas',
     'https://api-seguridad.sunat.gob.pe/v1/clientessol/03590141-c69c-438c-a36a-8ee2a3ad9747/oauth2/login?originalUrl=https://e-renta.sunat.gob.pe/loader/recaudaciontributaria/declaracionpago/formularios',
     'Declaración y pago del Impuesto a la Renta Anual.', 2)
  ) as v(titulo, url, notas, orden)
 where p.clave = 'sunat_sol'
on conflict (plataforma_id, titulo) do nothing;

-- ── Ver cómo quedó ───────────────────────────────────────────
-- OJO con los links de SUNAT: llevan un `state=rO0ABX…` que es un objeto
-- Java serializado. Si alguno deja de abrir, no es el sistema — es que
-- SUNAT lo cambió. Se corrige en /admin?s=plataformas, sin deploy.
select p.nombre,
       coalesce(p.url, '⚠ SIN PUERTA PRINCIPAL') as principal,
       q.orden, q.titulo, q.url
  from plataformas p
  left join plataforma_puertas q on q.plataforma_id = p.id
 order by p.nombre, q.orden nulls first;
