-- ============================================================
--  db/suspension-4ta-anios.sql — UNA CONSTANCIA POR AÑO
--
--  La suspensión de 4ta CADUCA cada 31 de diciembre. Se pide a SUNAT con el
--  Formulario 1609 y vale por ese año calendario y nada más.
--
--  db/suspension-4ta-anio.sql ya lo había entendido a medias y muy bien: cambió
--  el booleano por un AÑO, con el argumento de que «un booleano miente en
--  enero». Tenía razón. Lo que quedó corto es que guardó UN año, y la pregunta
--  que hay que contestar al rendir no es «¿está suspendida hoy?» sino
--  «¿lo estaba EL AÑO DE ESTE RECIBO?».
--
--  ── LO QUE COSTÓ TENER UNA SOLA COLUMNA ──
--  En PO-003 hay 26 recibos girados con retención CERO. Con un año por persona,
--  la pantalla del equipo marcaba 8 personas y S/ 55,870 sin respaldo. El hueco
--  real es de S/ 9,970: las constancias de Frank, Juan Basilides, Katy y
--  Gabriela para 2025 EXISTEN —están leídas, con su número de operación— pero
--  no cabían, porque sus fichas ya tenían la de 2026.
--  Un aviso que exagera por cinco no se corrige: se ignora. Y con él se ignoran
--  los cuatro casos que sí eran ciertos. El fallo no estaba en la pantalla:
--  estaba en pedirle a una columna que contestara una pregunta por año.
--
--  ── LA COLUMNA NO DESAPARECE, PERO DEJA DE ESCRIBIRSE A MANO ──
--  `personas.suspension_4ta_anio` y `_url` siguen siendo útiles: contestan
--  «¿está cubierta HOY?», que es lo que la ficha de la persona quiere saber y
--  lo que ya leen otras pantallas. Pero pasan a estar DERIVADAS de esta tabla
--  por un disparador. Un solo escritor, cero deriva.
--  Es la misma regla de siempre: manda el hecho —la constancia, con su año y su
--  número de operación— y lo demás se deduce.
--
--  Idempotente. El paso de carga usa `on conflict do nothing`, así que lo que
--  ya esté curado a mano gana sobre el lote.
-- ============================================================

create table if not exists suspension_4ta (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references personas(id) on delete cascade,
  anio        int  not null check (anio between 2000 and 2100),
  /* La constancia que devuelve SUNAT. Sin ella el año es una afirmación
     nuestra; con ella es un hecho verificable. */
  url         text,
  /* El número de operación del Formulario 1609. Es lo que permite comprobarlo
     en SUNAT sin abrir el PDF, y lo que distingue una constancia de su
     reimpresión. */
  operacion   text,
  presentado  date,
  nota        text,
  creado_en   timestamptz default now(),
  creado_por  uuid references perfiles(id),
  /* Una por persona y año. Sin esto, cargar el lote dos veces duplicaría la
     cobertura y «tiene 2025» pasaría a ser «tiene 2025 dos veces» — inofensivo
     de leer y suficiente para que un recuento mienta. */
  unique (persona_id, anio)
);

create index if not exists idx_susp4ta_persona on suspension_4ta(persona_id, anio desc);

alter table suspension_4ta enable row level security;
drop policy if exists "leer_susp4ta"   on suspension_4ta;
drop policy if exists "crear_susp4ta"  on suspension_4ta;
drop policy if exists "editar_susp4ta" on suspension_4ta;
drop policy if exists "borrar_susp4ta" on suspension_4ta;
create policy "leer_susp4ta"   on suspension_4ta for select to authenticated using (true);
create policy "crear_susp4ta"  on suspension_4ta for insert to authenticated with check (true);
create policy "editar_susp4ta" on suspension_4ta for update to authenticated using (true) with check (true);
create policy "borrar_susp4ta" on suspension_4ta for delete to authenticated using (true);


-- ── EL DISPARADOR: LA COLUMNA SE DEDUCE ──
-- `personas.suspension_4ta_anio/_url` quedan como el reflejo del año MÁS
-- RECIENTE de esta tabla. Se recalculan enteros en vez de ir parcheando: al
-- borrar la única constancia de alguien hay que dejar la columna en NULL, y un
-- parche incremental se olvida justo de ese caso.
create or replace function public.sync_suspension_4ta() returns trigger
language plpgsql as $$
declare pid uuid;
begin
  pid := coalesce(new.persona_id, old.persona_id);
  update personas p
     set suspension_4ta_anio = u.anio,
         suspension_4ta_url  = u.url
    from (select s.anio, s.url from suspension_4ta s
           where s.persona_id = pid order by s.anio desc limit 1) u
   where p.id = pid;
  if not found then
    update personas set suspension_4ta_anio = null, suspension_4ta_url = null
     where id = pid;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_susp4ta on suspension_4ta;
create trigger trg_sync_susp4ta after insert or update or delete on suspension_4ta
  for each row execute function public.sync_suspension_4ta();


-- ------------------------------------------------------------
-- 1 · RESCATAR LO QUE YA ESTABA EN LAS FICHAS
--     Va PRIMERO para que gane sobre el lote: si alguien cargó una constancia
--     a mano, esa decisión es más informada que este archivo.
-- ------------------------------------------------------------
insert into suspension_4ta (persona_id, anio, url, nota)
select p.id, p.suspension_4ta_anio, p.suspension_4ta_url,
       'Rescatada de personas.suspension_4ta_url al crear el historial por año.'
  from personas p
 where p.suspension_4ta_anio is not null
on conflict (persona_id, anio) do nothing;


-- ------------------------------------------------------------
-- 2 · LAS 25 CONSTANCIAS LEÍDAS DE PO-003
--     Cada una salió de ABRIR su PDF: RUC, nombre, año, fecha de presentación
--     y número de operación son los que imprime SUNAT, no los que sugiere el
--     nombre del archivo. Esa distinción ya evitó colgarle a Abel Ccahuana la
--     constancia de Milder Ccahuaya (ver db/suspension-4ta-po003.sql).
--     Diecinueve personas, veinticinco constancias: seis tienen dos años.
-- ------------------------------------------------------------
drop table if exists susp_anios_lote;
create table susp_anios_lote(ruc text, dni text, nombre text, anio int,
                             presentado date, operacion text, url text);

insert into susp_anios_lote(ruc, dni, nombre, anio, presentado, operacion, url) values
('10741993771','74199377','APAZA MAMANI OLIVERT JOHN',2025,'2025-10-07','25096889','https://drive.google.com/file/d/1t9BhxVT3K4qlRi7OsPWQADG-8C-sUZOz/view'),
('10475564591','47556459','ARQQUE CCORIMANYA MARIA MAGDALENA',2025,'2025-10-07','25096528','https://drive.google.com/file/d/1ysOlF_7GGDOQaTmZQRNbGJ8wvU1Xdxle/view'),
('10427488735','42748873','CAMARGO PEÑA GUILLERMO',2025,'2025-10-07','25096185','https://drive.google.com/file/d/1rNPPUVbiZNn6U4GUeCkAFV0JYgn_-g8i/view'),
('10716979836','71697983','CCAHUANA CCAHUAYA ABEL',2025,'2025-10-07','25096803','https://drive.google.com/file/d/1CruY6EgOP_GopI3eXBbnJqp0OAewFLgz/view'),
('10604982699','60498269','CCAHUAYA TURPO MILDER JESUS',2025,'2025-10-08','25100932','https://drive.google.com/file/d/15_7Zh6nJSZvo_a_6hhaTxEAHWhtHcXlu/view'),
('10717135445','71713544','CCORAHUA MACHACCA AGUSTINA',2025,'2025-10-07','25096913','https://drive.google.com/file/d/1FwYEUnCMeuShu_3RQBwokNsm6c8XK-Pd/view'),
('10242893285','24289328','CORREDOR MIRANO EDEN',2025,'2025-10-08','25100847','https://drive.google.com/file/d/1GuI4ADDBqUSOGiot4bLdmvc8UAMK4dUU/view'),
('10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES',2024,'2024-10-31','22285720','https://drive.google.com/file/d/12GAUDovO6ylHzKRUOdbAyW-kTAa7ZTgO/view'),
('10074203120','07420312','DE LA SOTA OROZ JUAN BASILIDES',2025,'2025-01-15','23270849','https://drive.google.com/file/d/19H3FEBB6gGUyGwZUralE60sJ-VkRSqtu/view'),
('10740957215','74095721','FARFAN ORTEGA MARY CARMEN',2026,'2026-02-04','26596589','https://drive.google.com/file/d/1h6FRCgLiU9VTgfol3K_ZAszYYrAbv4d9/view'),
('10438933668','43893366','LUNA GODOY SUSANA',2025,'2025-10-07','25096630','https://drive.google.com/file/d/1kh1RNQCb5qeyqoHGd3xG25mCk04LL64H/view'),
('10412998591','41299859','MAROCHO VILLEGAS ROXANA',2024,'2024-02-01','20672807','https://drive.google.com/file/d/1W3RynWtlhDCtNhng0y38AeVzcHrshoGu/view'),
('10412998591','41299859','MAROCHO VILLEGAS ROXANA',2025,'2025-10-28','25177566','https://drive.google.com/file/d/1fbim34vBkivvqOCIDKOq2u7ia8KejX3a/view'),
('10412998591','41299859','MAROCHO VILLEGAS ROXANA',2026,'2026-07-13','27713277','https://drive.google.com/file/d/1ec7RGijBfiMlEfWPJ3BZAL8YOJV_1sHf/view'),
('10478816893','47881689','MARQUEZ QUISPE GABRIELA',2025,'2025-10-08','25100574','https://drive.google.com/file/d/1PQyJYMonV76bBOpvf8ID7EDjfQaG9Cql/view'),
('10478816893','47881689','MARQUEZ QUISPE GABRIELA',2026,'2026-07-09','27703370','https://drive.google.com/file/d/1tFbdWeon-kAfjjWAoaeyIOMyRexuNbea/view'),
('10106268440','10626844','MEJIA CASTRO MIGUEL ANGEL',2025,'2025-07-30','24765712','https://drive.google.com/file/d/1glsAQHJmS3H1b-ygNp9rV2ohhIommwyU/view'),
('10715178651','71517865','ORTEGA QUISPE FRANK',2025,'2025-01-13','23197387','https://drive.google.com/file/d/1wGUncgzxYWHHoxRJzcyy8ymtmXbRGIaO/view'),
('10400254244','40025424','PEREZ DIAZ KATY',2024,'2024-01-31','20652556','https://drive.google.com/file/d/156jC-g8Lx-0cAT1V3BIi575ZXRuE82u4/view'),
('10400254244','40025424','PEREZ DIAZ KATY',2025,'2025-01-15','23262122','https://drive.google.com/file/d/1CHGePENU6h3Glfd5IzcCDLlscURkICYi/view'),
('10400254244','40025424','PEREZ DIAZ KATY',2026,'2026-07-15','27726227','https://drive.google.com/file/d/1fusP8bZToNPqel5m-37nNNxGo8cW2Lqj/view'),
('10710826698','71082669','PFOCCORI TAYPE REINALDO',2025,'2025-10-08','25100990','https://drive.google.com/file/d/1PXv8hpBnvojreVGAEER8Cs31pqW9F1dw/view'),
('10242918571','24291857','PUMA CHOQQUEMAMANI JUSTINO',2025,'2025-10-08','25100964','https://drive.google.com/file/d/1HwWqngsd3D9eAY0uNFYtFDA6wubvJN1H/view'),
('10242892432','24289243','QUISPICHO QUIJUA FLORENCIO',2025,'2025-10-07','25096559','https://drive.google.com/file/d/1q3Kcj9f0M4aa7upn6zSs7rbnmS1jJpu5/view'),
('10242905615','24290561','SUNE CABALLERO VICTORIANO',2025,'2025-10-07','25096773','https://drive.google.com/file/d/1P9U_rq9QpYlk5LGxURUGot2eBhJBuN3C/view')
;

insert into suspension_4ta (persona_id, anio, url, operacion, presentado)
select p.id, l.anio, l.url, l.operacion, l.presentado
  from susp_anios_lote l
  join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (l.dni, l.ruc)
on conflict (persona_id, anio) do nothing;


-- ------------------------------------------------------------
-- 3 · VERIFICAR
-- ------------------------------------------------------------
-- Las 25 del lote deben haber encontrado persona. Si `sin_persona` no es 0,
-- alguien del lote no está dado de alta y su constancia se quedó fuera.
select count(*) as en_lote,
       count(p.id) as con_persona,
       count(*) - count(p.id) as sin_persona
  from susp_anios_lote l
  left join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (l.dni, l.ruc);

-- Quién tiene qué años. Seis personas deben salir con dos filas.
select coalesce(pe.alias, pe.nombre) as persona,
       string_agg(s.anio::text, ', ' order by s.anio) as anios,
       count(*) as constancias
  from suspension_4ta s join personas pe on pe.id = s.persona_id
 group by 1 having count(*) > 1 order by 1;

-- El disparador hizo su trabajo: la columna refleja el año más alto de la
-- tabla, para todas. CERO filas.
select coalesce(pe.alias, pe.nombre) as persona,
       pe.suspension_4ta_anio as en_la_ficha,
       max(s.anio) as maximo_real
  from personas pe join suspension_4ta s on s.persona_id = pe.id
 group by pe.id, 1, 2
having pe.suspension_4ta_anio is distinct from max(s.anio);

-- ── LA PREGUNTA QUE TODO ESTO VENÍA A CONTESTAR ──
-- Recibos de PO-003 girados con retención cero SIN constancia de SU año.
-- Debe dar los cinco que ya sabíamos, por S/ 9,970 — no los ocho por
-- S/ 55,870 que salían con una sola columna.
select coalesce(pe.alias, pe.nombre) as persona,
       x.numero, x.fecha, x.monto
  from rhe x
  join personas pe on pe.id = x.persona_id
 where x.postulacion_id = 'de9d7b0a-8f88-4582-bab9-53c2e7c84dad'
   and coalesce(x.retencion, 0) = 0
   and not exists (
     select 1 from suspension_4ta s
      where s.persona_id = x.persona_id
        and s.anio = extract(year from x.fecha)::int)
 order by x.fecha;


-- ------------------------------------------------------------
-- 4 · LIMPIAR — cuando el paso 3 cuadre
-- ------------------------------------------------------------
-- drop table if exists susp_anios_lote;
-- drop table if exists susp_po003;


-- ============================================================
--  5 · ENRIQUECER LO RESCATADO — corrige un error de este archivo
--
--  El paso 1 rescata lo que había en `personas` y va ANTES del lote, con el
--  argumento de que «lo curado a mano gana». El argumento era bueno y estaba
--  mal aplicado: una fila rescatada NO está curada a mano. Es lo que quedó de
--  una columna que solo guardaba año y enlace — sin número de operación y sin
--  fecha de presentación, porque esas dos cosas no cabían.
--
--  Resultado en Gabriela Márquez: su 2026 entró por el rescate, pelado, y el
--  `on conflict do nothing` del paso 2 descartó la MISMA constancia leída del
--  PDF, que sí traía op. 27703370 y fecha 09/07/2026. La ficha quedó enseñando
--  «2026» a secas al lado de un «2025 · op. 25100574 · 08/10/2025» completo.
--  No se perdió nada irreversible, pero se descartó lo mejor por lo primero.
--
--  Esto lo arregla RELLENANDO HUECOS, no pisando: solo escribe donde la fila
--  rescatada tiene null. Si alguien puso un enlace distinto a propósito, se
--  respeta — la diferencia entre completar y sobrescribir es justo lo que hace
--  que este paso se pueda correr sin miedo.
-- ============================================================

update suspension_4ta s
   set operacion  = coalesce(s.operacion, l.operacion),
       presentado = coalesce(s.presentado, l.presentado),
       url        = coalesce(s.url, l.url),
       /* La nota de procedencia era para nosotros, no para quien mira la
          ficha: se leía como si el dato tuviera algo raro. Una vez completada
          la fila ya no explica nada, así que se va. */
       nota       = case when s.nota like 'Rescatada de personas.%' then null else s.nota end
  from susp_anios_lote l
  join personas p
    on regexp_replace(coalesce(p.ruc_dni,''), '\D', '', 'g') in (l.dni, l.ruc)
 where s.persona_id = p.id
   and s.anio = l.anio;

-- Y las rescatadas que el lote no puede completar —los 2026 de Frank, Juan
-- Basilides y Katy, que se cargaron a mano y cuyo PDF no llegué a leer— al
-- menos pierden la nota, que no aportaba nada a quien mira.
update suspension_4ta
   set nota = null
 where nota like 'Rescatada de personas.%';

-- ── VERIFICAR ──
-- Cuántas constancias siguen sin número de operación. No es un error: son las
-- que se cargaron antes de que existiera el campo. Pero conviene saber cuáles,
-- porque sin la operación hay que abrir el PDF para comprobarlas en SUNAT.
select coalesce(pe.alias, pe.nombre) as persona, s.anio,
       case when s.url is null then '⚠ sin PDF' else 'con PDF' end as pdf
  from suspension_4ta s join personas pe on pe.id = s.persona_id
 where s.operacion is null
 order by 1, 2;
