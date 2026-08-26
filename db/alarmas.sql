-- ══════════════════════════════════════════════════════════════════════════
-- LA ALARMA — el único aviso que no calcula nadie: lo declara una persona
--
-- Todo lo que hoy se enciende en rojo en este sistema está CALCULADO: «faltan
-- 5 estados de cuenta», «13 casos sin resolver», «venció el 20/10». Son
-- deducciones de una tabla, y por eso mismo no pueden decir lo único que a
-- veces hay que decir: «esto es grave».
--
-- El caso que lo pide: en PO-001 no se giraron los RHE y pasaron meses. No
-- falta un dato —el sistema no tiene forma de saber que debía haberlos— y no
-- es un caso más en un tablero de trescientos. Es un problema que el equipo
-- entero tiene que saber HOY, dicho por alguien con responsabilidad.
--
-- ── EL PELIGRO ES QUE SE VUELVA DECORADO ──
-- Es lo que le pasa a todas las alarmas: se encienden en una urgencia, se
-- arregla a medias, nadie las apaga, y a los tres meses hay dos rojos
-- permanentes que ya nadie mira — y entonces el tercero, el que sí importaba,
-- tampoco se ve. La misma lección de la burbuja que no baja aunque trabajes.
--
-- Por eso la tabla no guarda solo «hay alarma». Guarda:
--   · POR QUÉ (motivo, obligatorio: un rojo sin explicación no se puede
--     atender, solo sufrir);
--   · CUÁNDO SE REVISA (`revisar_el`, obligatorio y en el futuro): es lo que
--     impide que se quede encendida sola. Pasada la fecha, la pantalla lo
--     dice y le pide cuentas a quien la encendió;
--   · CÓMO TERMINÓ (`cierre`, obligatorio al apagar): una alarma que se apaga
--     sin explicación no deja aprender nada;
--   · A QUÉ CASO manda el trabajo. La alarma señala; el trabajo ocurre donde
--     ocurre siempre. Sin esto, la alarma compite con el caso y acabas con dos
--     sitios que cuentan lo mismo y se contradicen.
--
-- ── POLIMÓRFICA DESDE EL PRIMER DÍA ──
-- `entidad_tipo` + `entidad_id`, como los comentarios y las reacciones. Nace
-- en un fondo y sirve igual para una empresa, una persona o una convocatoria
-- sin tocar una línea. Hacerlo después habría sido migrar datos vivos.
-- ══════════════════════════════════════════════════════════════════════════

-- ⚠ Depende de `public.es_finanzas()` (db/rhe-permisos.sql). Sin el guardián,
-- correrlo fuera de orden falla con un error de Postgres en crudo que no dice
-- cuál es el archivo que falta — el mismo aviso que llevan sus hermanos
-- (db/caja.sql, db/facturas.sql).
do $$ begin
  if to_regprocedure('public.es_finanzas()') is null then
    raise exception 'Falta public.es_finanzas(): corre antes db/rhe-permisos.sql';
  end if;
end $$;

begin;

create table if not exists alarmas (
  id uuid primary key default gen_random_uuid(),

  -- A qué apunta. Sin clave foránea, como el resto de lo polimórfico del
  -- sistema: son ocho tablas distintas y una FK por tabla sería una columna
  -- por tabla.
  entidad_tipo text not null,
  entidad_id   uuid not null,

  titulo text not null,
  -- Qué está pasando, en palabras. Obligatorio: ver la cabecera.
  motivo text not null,
  -- Cuándo hay que volver a mirarla. Obligatorio y hacia adelante.
  revisar_el date not null,

  -- El caso donde ocurre el trabajo. `set null`: si el caso se borra, la
  -- alarma NO desaparece — el problema sigue existiendo.
  caso_id uuid references publicaciones(id) on delete set null,

  /* ⚠ A `perfiles`, NO a `auth.users`. Es lo que permite traer el nombre
     embebido (`quien:perfiles!encendida_por`): PostgREST resuelve el embebido
     buscando una clave foránea hacia esa tabla, y sin ella la consulta ENTERA
     falla con un 400 — no devuelve la alarma sin nombre, no devuelve nada.
     Ya pasó con `fondo_apoyo`, que cuelga de auth.users y por eso tiene que
     resolver los nombres a mano en la página. `perfiles.id` es a su vez clave
     foránea de auth.users, así que no se pierde ninguna garantía. */
  encendida_por uuid references perfiles(id),
  encendida_en  timestamptz not null default now(),

  -- Apagarla no la borra: es el registro de que esto pasó y de cómo se
  -- resolvió. Borrarla sería perder justo la parte que sirve para la próxima.
  apagada_en  timestamptz,
  apagada_por uuid references perfiles(id),
  cierre      text,

  -- Las dos mitades van juntas o no van: una alarma apagada sin fecha, o una
  -- fecha de apagado sin explicación, son estados que nadie puede interpretar
  -- después.
  constraint alarmas_apagado_ok check (
    (apagada_en is null and cierre is null)
    or (apagada_en is not null and cierre is not null and btrim(cierre) <> '')
  ),
  constraint alarmas_texto_ok check (btrim(titulo) <> '' and btrim(motivo) <> '')
);

comment on table alarmas is
  'Alarmas DECLARADAS por administración: lo que una persona sabe que es grave y el sistema no puede deducir. Se apagan explicando cómo se resolvió; no se borran.';

-- Buscar las vivas es lo que hace cada navegación del sistema entero: índice
-- parcial, que es el que cabe en memoria.
create index if not exists idx_alarmas_vivas on alarmas(encendida_en desc)
  where apagada_en is null;
create index if not exists idx_alarmas_entidad on alarmas(entidad_tipo, entidad_id);

-- ── UNA VIVA POR ENTIDAD ──
-- Dos alarmas encendidas sobre el mismo fondo no dicen dos problemas: dicen
-- que alguien encendió dos veces. Y la segunda tapa a la primera en la franja.
create unique index if not exists idx_alarma_una_viva
  on alarmas(entidad_tipo, entidad_id) where apagada_en is null;

alter table alarmas enable row level security;

drop policy if exists "leer_alarmas"     on alarmas;
drop policy if exists "crear_alarmas"    on alarmas;
drop policy if exists "editar_alarmas"   on alarmas;

-- Leer, TODO el equipo: una alarma que no ve el equipo no es una alarma.
create policy "leer_alarmas" on alarmas for select to authenticated using (true);

-- Encender y apagar, solo administración o finanzas. No es desconfianza: una
-- alarma que puede encender cualquiera deja de significar «esto es grave» y
-- pasa a significar «alguien se enfadó», y en un mes nadie la mira.
create policy "crear_alarmas" on alarmas for insert to authenticated
  with check (public.es_finanzas());
create policy "editar_alarmas" on alarmas for update to authenticated
  using (public.es_finanzas());

-- Sin política de DELETE, a propósito: una alarma no se borra. Se apaga, y el
-- registro de que pasó se queda.

commit;

-- VERIFICAR
-- select entidad_tipo, titulo, revisar_el, apagada_en from alarmas order by encendida_en desc;
