-- ============================================================
--  db/obligaciones.sql — LAS TAREAS QUE VUELVEN SOLAS
--
--  Hay trabajo que no nace de una decisión: nace del calendario. La
--  declaración mensual de IGV-Renta de cada empresa, la jurada anual, y
--  mañana la renovación del RENCA o el informe semestral de un fondo. Nadie
--  lo pide y nadie lo asigna: vence.
--
--  Esto vivía en una tabla de SeaTable, una fila por empresa y mes, con la
--  fecha de vencimiento TECLEADA A MANO. Funcionaba —y por eso duró—, pero
--  tenía dentro el fallo que este archivo existe para quitar: la REGLA («esta
--  empresa declara IGV cada mes») no estaba escrita en ninguna parte. Vivía en
--  la cabeza de quien creaba las filas. Si esa persona no las creaba, el mes
--  no existía; y un mes que no existe no vence, no alerta y no se echa de
--  menos. Los tres meses en rojo de la captura (octubre, noviembre y diciembre
--  de 2025) son exactamente eso: filas creadas y nunca atendidas.
--
--  ── TRES TABLAS, PORQUE SON TRES COSAS DISTINTAS ──
--
--   1. `obligacion`         — LA REGLA. Qué le toca a quién y cada cuánto.
--                             Una fila por empresa y obligación. No por mes.
--   2. `vencimiento_oficial` — EL CALENDARIO. Las fechas que publica SUNAT.
--   3. `obligacion_periodo`  — EL HECHO. Un mes concreto: si se declaró,
--                             cuándo y qué salió.
--
--  Meterlas en una sola tabla es lo que hacía SeaTable, y por eso la regla se
--  perdía. Con las tres separadas, los periodos se GENERAN: no depende de que
--  alguien se acuerde de crear la fila de noviembre.
--
--  ── LA FECHA DE VENCIMIENTO NO SE CALCULA ──
--  Esto es lo único de verdad difícil del módulo. SUNAT publica cada año una
--  resolución con una tabla de último dígito de RUC × periodo, y las fechas
--  cambian de un año a otro (no son «el 20 de cada mes» ni nada deducible).
--  Así que el calendario es DATO, no fórmula, y se carga una vez al año.
--
--  Cuando el año no está cargado, el periodo se crea SIN fecha y lo dice. No
--  se inventa una aproximada: una fecha de vencimiento equivocada es peor que
--  ninguna, porque la primera se cree y la segunda se pregunta.
--
--  Idempotente. Al final verifica.
-- ============================================================

-- ============================================================
--  1 · LA REGLA
-- ============================================================
create table if not exists obligacion (
  id            uuid primary key default gen_random_uuid(),
  /* De quién es. Hoy siempre una empresa; el par (tipo, id) está abierto
     porque la siguiente obligación periódica que aparezca —la vigencia de un
     poder, el informe de un fondo— cuelga de otra entidad y no queremos una
     tabla gemela para eso. A diferencia de los comentarios, aquí NO hay
     borrado en cascada que proteger: una obligación sin dueño es basura y se
     limpia a mano, así que el par polimórfico sale barato. */
  entidad_tipo  text not null default 'empresa',
  entidad_id    uuid not null,

  /* Qué es. Texto y no enum: el catálogo lo pone lib/obligaciones.ts, que es
     donde ya se decide cómo se llama y cómo se lee. Un enum en la base
     obligaría a una migración por cada obligación nueva. */
  clase         text not null,          -- igv_renta | dj_anual | …
  /* Cómo se repite. `mensual` genera doce periodos al año; `anual`, uno. */
  periodicidad  text not null default 'mensual',

  /* De dónde sale la fecha de vencimiento:
       'sunat_ruc' → del calendario oficial, por último dígito del RUC
       'fija'      → `dia_fijo` de cada mes (obligaciones internas)
       'manual'    → se teclea periodo a periodo (no se sabe la regla)
     Lo que NO existe es «calcularla»: ver la cabecera. */
  origen_fecha  text not null default 'sunat_ruc',
  dia_fijo      int,

  /* Quién responde. Es el responsable que llevará el caso cuando se
     materialice; sin él el caso nace «Sin asignar» y nadie lo recoge. */
  responsable   uuid references perfiles(id),
  /* Cuántos días antes se abre el caso. Por defecto una semana: menos no da
     tiempo a juntar los registros, más llena el tablero de trabajo que aún no
     se puede hacer. */
  dias_aviso    int not null default 6,   -- ver db/obligacion-dias-aviso.sql y DIAS_AVISO en lib/obligaciones.ts

  /* Desde cuándo rige y hasta cuándo. Una empresa en cierre deja de declarar,
     y sin `hasta` el sistema le reclamaría para siempre. */
  desde         date,
  hasta         date,

  activa        boolean not null default true,
  nota          text,
  creado_por    uuid references perfiles(id),
  creado_en     timestamptz default now(),

  /* Una empresa no tiene dos veces la misma obligación. Si la tuviera, cada
     mes se generaría dos veces y el semáforo contaría doble. */
  unique (entidad_tipo, entidad_id, clase)
);
create index if not exists idx_obl_entidad on obligacion(entidad_tipo, entidad_id);
create index if not exists idx_obl_activa  on obligacion(activa) where activa;

-- ============================================================
--  2 · EL CALENDARIO OFICIAL
-- ============================================================
/* Una fila por (año del periodo, mes del periodo, dígito del RUC). El nombre
   no dice «sunat» a propósito: si mañana otro organismo publica un calendario
   por dígito, cabe aquí. `digito` es -1 para los calendarios que no dependen
   del RUC (una jurada anual con fecha única, por ejemplo). */
create table if not exists vencimiento_oficial (
  id        uuid primary key default gen_random_uuid(),
  clase     text not null,             -- igv_renta | dj_anual
  anio      int  not null,             -- año del PERIODO, no del vencimiento
  mes       int  not null,             -- 1..12 · 0 para las anuales
  digito    int  not null,             -- último dígito del RUC · -1 = todos
  fecha     date not null,             -- cuándo vence
  fuente    text,                      -- la resolución de la que salió
  creado_en timestamptz default now(),
  unique (clase, anio, mes, digito)
);
create index if not exists idx_venc_of on vencimiento_oficial(clase, anio, mes, digito);

-- ============================================================
--  3 · EL HECHO
-- ============================================================
create table if not exists obligacion_periodo (
  id            uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references obligacion(id) on delete cascade,

  /* El periodo AL QUE CORRESPONDE, no cuándo se hace. La declaración de
     octubre se presenta en noviembre; guardar «noviembre» habría hecho
     imposible contestar «¿está declarado octubre?», que es la pregunta. */
  anio          int not null,
  mes           int not null,           -- 0 en las anuales

  vence         date,                   -- null = el año no está en el calendario
  /* `declarado` es un HECHO con fecha, no un booleano. Un booleano no sabe
     decir si se declaró a tiempo o tarde, que es justo lo que se mira al
     cerrar el año. */
  declarado_en  date,
  declarado_por uuid references perfiles(id),

  /* Qué salió. `en_cero` | `saldo_favor` | `a_pagar`, y el monto si lo hay.
     Estaba en la tabla vieja («Neutro / En Cero», «Saldo a Favor: 228.81») y
     es la única columna que convierte esta lista en información contable en
     vez de en una lista de tareas. */
  resultado     text,
  monto         numeric(12,2),

  /* El caso que se abrió para atenderlo, si se llegó a abrir. Con él, cerrar
     el caso y marcar el periodo son la misma conversación. */
  caso_id       uuid references publicaciones(id) on delete set null,

  nota          text,
  creado_en     timestamptz default now(),

  /* Un periodo, una vez. Es lo que hace segura la generación automática: el
     cron puede correr dos veces el mismo día sin duplicar noviembre. */
  unique (obligacion_id, anio, mes)
);
create index if not exists idx_oblper_obl   on obligacion_periodo(obligacion_id);
create index if not exists idx_oblper_vence on obligacion_periodo(vence)
  where declarado_en is null;

/* ── LAS CUATRO COLUMNAS DE CONSTANCIAS, RETIRADAS ──
   Nacieron aquí —registro de compras, registro de ventas, constancia de
   declaración y de pago— copiando la tabla de SeaTable. Duraron dos días: en
   SeaTable no sirvieron nunca. Si una declaración está presentada lo dice
   SUNAT, no una copia nuestra en Drive; y una copia que hay que mantener a
   mano se queda vieja y encima da confianza.
   Se DEJAN CAER y no se retiran en silencio como se hizo con el tipo de caso
   «archivo»: allí había datos guardados que se habrían quedado sin nombre;
   aquí las columnas nacieron vacías hace dos días y arrastrarlas solo
   invitaría a volver a llenarlas. `if exists` para que este archivo siga
   pudiéndose correr dos veces. */
alter table obligacion_periodo drop column if exists reg_compras_url;
alter table obligacion_periodo drop column if exists reg_ventas_url;
alter table obligacion_periodo drop column if exists dj_url;
alter table obligacion_periodo drop column if exists pago_url;

-- ============================================================
--  RLS
-- ============================================================
alter table obligacion           enable row level security;
alter table vencimiento_oficial  enable row level security;
alter table obligacion_periodo   enable row level security;

drop policy if exists "leer_obl"    on obligacion;
drop policy if exists "escr_obl"    on obligacion;
drop policy if exists "leer_vof"    on vencimiento_oficial;
drop policy if exists "escr_vof"    on vencimiento_oficial;
drop policy if exists "leer_oblper" on obligacion_periodo;
drop policy if exists "escr_oblper" on obligacion_periodo;

/* Leer, todo el equipo: saber si la empresa está al día con SUNAT no es
   información reservada — es de lo primero que hay que poder mirar antes de
   postular a un fondo, y esconderlo obligaría a preguntar por WhatsApp.
   Escribir, también. Aquí no hay dinero que mover: hay constancias que
   adjuntar y casillas que marcar, y el trabajo lo hace quien lo hace. Pedir
   permisos de finanzas para pegar un enlace de Drive habría garantizado que
   nadie lo pegue —que es exactamente el estado del que venimos—. */
create policy "leer_obl"    on obligacion          for select to authenticated using (true);
create policy "escr_obl"    on obligacion          for all    to authenticated using (true) with check (true);
create policy "leer_vof"    on vencimiento_oficial for select to authenticated using (true);
create policy "escr_vof"    on vencimiento_oficial for all    to authenticated using (true) with check (true);
create policy "leer_oblper" on obligacion_periodo  for select to authenticated using (true);
create policy "escr_oblper" on obligacion_periodo  for all    to authenticated using (true) with check (true);

-- ============================================================
--  EL CALENDARIO 2025 · IGV-RENTA · DÍGITO 8
--
--  Estas doce fechas NO son inventadas ni deducidas: son las que ya estaban
--  en la tabla de SeaTable de Apu Wilkakalle (RUC 20612545058, último dígito
--  8), periodos enero a diciembre de 2025. Se cargan para que el módulo sirva
--  desde el primer día con la empresa que más lo necesita.
--
--  ⚠ FALTA TODO LO DEMÁS: los otros nueve dígitos y el año 2026. Eso se saca
--  de la resolución de SUNAT y se carga igual que esto. Mientras no esté, los
--  periodos de esas empresas se crean SIN fecha y la pantalla lo dice — que es
--  la diferencia entre «no lo sé» y «no vence».
-- ============================================================
insert into vencimiento_oficial (clase, anio, mes, digito, fecha, fuente) values
  ('igv_renta', 2025,  1, 8, '2025-02-24', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  2, 8, '2025-03-24', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  3, 8, '2025-04-24', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  4, 8, '2025-05-23', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  5, 8, '2025-06-23', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  6, 8, '2025-07-22', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  7, 8, '2025-08-25', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  8, 8, '2025-09-22', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025,  9, 8, '2025-10-23', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025, 10, 8, '2025-11-24', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025, 11, 8, '2025-12-24', 'tabla histórica del equipo (SeaTable)'),
  ('igv_renta', 2025, 12, 8, '2026-01-23', 'tabla histórica del equipo (SeaTable)')
on conflict (clase, anio, mes, digito) do nothing;

-- ============================================================
--  GENERAR LOS PERIODOS QUE FALTAN
--
--  Crea las filas de `obligacion_periodo` de una obligación hasta el mes en
--  curso (más los que vengan dentro de su ventana de aviso). No borra ni toca
--  lo que ya existe: el `unique` la hace segura de correr mil veces.
--
--  Genera HASTA HOY y no el año entero a propósito. Doce filas de golpe, diez
--  de ellas sin nada que hacer todavía, convierten la pantalla en un
--  calendario en vez de en una lista de pendientes — y el rojo de las tres que
--  sí importan se pierde entre el gris de las otras nueve.
-- ============================================================
create or replace function public.obligacion_generar(p_obligacion uuid)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  o        obligacion%rowtype;
  dig      int;
  cur      date;
  fin      date;
  creados  int := 0;
  v_fecha  date;
begin
  select * into o from obligacion where id = p_obligacion;
  if not found or not o.activa then return 0; end if;

  /* El último dígito del RUC de la empresa. Si la obligación no cuelga de una
     empresa, o la empresa no tiene RUC, no hay dígito: los periodos se crean
     igual y sin fecha. Quedarse sin generar el periodo por no saber CUÁNDO
     vence sería esconder que la obligación existe. */
  dig := -1;
  if o.entidad_tipo = 'empresa' then
    select coalesce(nullif(right(regexp_replace(ruc, '\D', '', 'g'), 1), '')::int, -1)
      into dig from empresas where id = o.entidad_id;
    dig := coalesce(dig, -1);
  end if;

  if o.periodicidad = 'anual' then
    -- Una fila por año, con mes 0. El periodo de un año se declara al
    -- siguiente, así que se genera hasta el año pasado.
    for cur in
      select make_date(y, 1, 1)
        from generate_series(
          extract(year from coalesce(o.desde, current_date - interval '1 year'))::int,
          extract(year from current_date)::int - 1) as y
    loop
      select fecha into v_fecha from vencimiento_oficial
       where clase = o.clase and anio = extract(year from cur)::int and mes = 0
         and digito in (dig, -1) order by digito desc limit 1;
      insert into obligacion_periodo (obligacion_id, anio, mes, vence)
      values (p_obligacion, extract(year from cur)::int, 0, v_fecha)
      on conflict (obligacion_id, anio, mes) do nothing;
      if found then creados := creados + 1; end if;
    end loop;
    return creados;
  end if;

  /* Mensual. Desde el arranque de la obligación (o hace un año) hasta el mes
     anterior al actual: el periodo en curso todavía no se declara. */
  cur := date_trunc('month', coalesce(o.desde, current_date - interval '1 year'))::date;
  fin := (date_trunc('month', current_date) - interval '1 month')::date;
  if o.hasta is not null and o.hasta < fin then
    fin := date_trunc('month', o.hasta)::date;
  end if;

  while cur <= fin loop
    select fecha into v_fecha from vencimiento_oficial
     where clase = o.clase
       and anio = extract(year from cur)::int
       and mes  = extract(month from cur)::int
       and digito in (dig, -1)
     order by digito desc limit 1;   -- el del dígito manda sobre el genérico

    insert into obligacion_periodo (obligacion_id, anio, mes, vence)
    values (p_obligacion, extract(year from cur)::int, extract(month from cur)::int, v_fecha)
    on conflict (obligacion_id, anio, mes) do nothing;
    if found then creados := creados + 1; end if;

    cur := (cur + interval '1 month')::date;
  end loop;
  return creados;
end;
$$;

/* Y la ronda de todas. Es la que llamará el cron; se puede correr a mano sin
   miedo. Devuelve cuántos periodos nuevos creó, para poder decirlo. */
create or replace function public.obligaciones_generar_todas()
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare r record; total int := 0;
begin
  for r in select id from obligacion where activa loop
    total := total + public.obligacion_generar(r.id);
  end loop;
  /* Y COMPLETA LAS FECHAS QUE FALTABAN. Un periodo creado cuando su año no
     estaba en el calendario se quedó sin `vence`; al cargar la resolución hay
     que rellenarlos, o seguirían diciendo «sin fecha» para siempre con el
     dato ya en la base. Solo toca los vacíos: una fecha corregida a mano no
     se pisa. */
  update obligacion_periodo p
     set vence = v.fecha
    from obligacion o
    left join lateral (
      select coalesce(nullif(right(regexp_replace(e.ruc, '\D', '', 'g'), 1), '')::int, -1) as d
        from empresas e
       where o.entidad_tipo = 'empresa' and e.id = o.entidad_id
    ) x on true
    join vencimiento_oficial v
      on v.clase = o.clase
     and v.digito in (coalesce(x.d, -1), -1)
   where p.obligacion_id = o.id
     and p.vence is null
     and v.anio = p.anio and v.mes = p.mes;
  return total;
end;
$$;

-- ── VERIFICAR ──
select 'obligacion'          as tabla, count(*) as filas from obligacion
union all
select 'vencimiento_oficial',       count(*) from vencimiento_oficial
union all
select 'obligacion_periodo',        count(*) from obligacion_periodo;

/* Las doce fechas sembradas, para cotejarlas de un vistazo contra la tabla
   vieja. Si esta lista no coincide con SeaTable, algo se copió mal. */
select anio, mes, to_char(fecha, 'DD/MM/YYYY') as vence
  from vencimiento_oficial
 where clase = 'igv_renta' and anio = 2025 and digito = 8
 order by mes;
