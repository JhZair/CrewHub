-- ══════════════════════════════════════════════════════════════════════════
-- EL APOYO DE RENDICIÓN — ayudar a juntar los papeles sin recibir la llave
--
-- El caso real: Katy lleva la administración de PO-005 y necesita que Wilfredo
-- le ayude a cargar los 58 comprobantes de los RHE. Hasta hoy solo había dos
-- respuestas, y las dos malas:
--
--   · dejarlo como está — Katy pide cada PDF por WhatsApp, lo espera, lo sube.
--     Cincuenta y ocho veces. Ese trabajo no se hace nunca, y sin el escaneo la
--     rendición no se puede presentar;
--   · darle `es_finanzas` — una casilla y listo, pero eso abre la caja, todos
--     los fondos, y editar y borrar recibos. Un permiso grande y permanente
--     para una tarea pequeña y temporal es exactamente la forma en que se
--     acaban repartiendo llaves maestras (ver db/rhe-permisos.sql).
--
-- Aquí va la tercera: un apoyo NOMBRADO PARA UN FONDO, que puede adjuntar el
-- papel de los recibos de ESE fondo y nada más. Ni montos, ni ejes, ni otros
-- fondos, ni la caja.
--
-- ── POR QUÉ UNA FUNCIÓN Y NO UNA POLÍTICA ──
-- La tentación era añadir al apoyo en la política `editar_rhe`. No sirve: una
-- política de RLS decide qué FILAS se pueden tocar, nunca qué COLUMNAS. Con
-- ella, quien puede adjuntar el PDF puede también cambiar el monto del recibo,
-- que es la única cifra que la rendición no puede permitirse mal. Los permisos
-- por columna de Postgres tampoco valen: se conceden por ROL, y aquí todo el
-- mundo entra como `authenticated`.
--
-- Por eso el adjuntar pasa por una función `security definer` que escribe UNA
-- columna —`url`— y decide ella misma quién puede. La regla vive en un solo
-- sitio y el permiso es del tamaño exacto del trabajo.
-- ══════════════════════════════════════════════════════════════════════════

-- ⚠ TODO EN UNA TRANSACCIÓN, y no es adorno: `create or replace function`
-- concede EXECUTE a PUBLIC en el momento de crearse, así que entre el CREATE y
-- su REVOKE hay una ventana en la que la función es ejecutable por `anon`.
-- Dentro de una transacción esa ventana no existe para nadie de fuera.
begin;

-- ── 1. QUIÉN APOYA EN QUÉ FONDO ──
create table if not exists fondo_apoyo (
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  usuario_id     uuid not null references auth.users(id)    on delete cascade,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id),
  primary key (postulacion_id, usuario_id)
);

comment on table fondo_apoyo is
  'Quién ayuda a administración con los papeles de un fondo concreto. Solo habilita adjuntar comprobantes de los RHE de ese fondo (ver adjuntar_comprobante_rhe).';

create index if not exists idx_fondo_apoyo_usuario on fondo_apoyo(usuario_id);

alter table fondo_apoyo enable row level security;

-- Leer, todo el equipo: saber quién está ayudando en un fondo es información
-- de coordinación, no un secreto. Además la ficha lo pinta.
drop policy if exists "leer_fondo_apoyo"   on fondo_apoyo;
drop policy if exists "crear_fondo_apoyo"  on fondo_apoyo;
drop policy if exists "borrar_fondo_apoyo" on fondo_apoyo;

create policy "leer_fondo_apoyo" on fondo_apoyo for select to authenticated using (true);

-- Nombrar y quitar, solo administración o finanzas. Un apoyo que puede
-- nombrarse a sí mismo no es un permiso, es una puerta abierta con un cartel.
create policy "crear_fondo_apoyo" on fondo_apoyo for insert to authenticated
  with check (public.es_finanzas());
create policy "borrar_fondo_apoyo" on fondo_apoyo for delete to authenticated
  using (public.es_finanzas());


-- ── 2. ¿APOYO EN ESTE FONDO? ──
-- `security definer` para que la comprobación no dependa de que quien pregunta
-- pueda leer la tabla, y `stable` porque dentro de una consulta la respuesta no
-- cambia.
create or replace function public.es_apoyo_fondo(p_postulacion uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((
    select true from fondo_apoyo
    where postulacion_id = p_postulacion and usuario_id = auth.uid()
  ), false);
$$;

-- El fondo nulo no es «todos los fondos»: un RHE sin postulación es de un caso
-- suelto y ahí el apoyo no pinta nada. `p_postulacion is null` cae solo en el
-- `where` de arriba, pero se deja dicho porque es la clase de detalle que un
-- refactor futuro puede romper sin enterarse.
comment on function public.es_apoyo_fondo(uuid) is
  'true si la cuenta que pregunta fue nombrada apoyo de rendición de ese fondo. Nulo = falso: un RHE sin fondo no tiene apoyos.';


-- ── 3. ADJUNTAR EL COMPROBANTE — la única escritura que esto habilita ──
--
-- Devuelve NULL si todo fue bien, o el texto del problema. Un booleano diría
-- «no» sin decir por qué, y «no se pudo» sin motivo es lo que hace que la
-- gente vuelva a intentarlo igual tres veces.
--
-- ── QUIÉN PUEDE ──
--   · administración o finanzas: siempre;
--   · el apoyo del fondo y el titular del recibo: mientras el expediente no
--     esté CERRADO.
--
-- La línea es el cierre y no el pago, a propósito. El pago protege las CIFRAS
-- —un monto que se mueve debajo de un pago hecho convierte la auditoría en una
-- discusión—, y aquí no se toca ninguna cifra: se cuelga el papel que
-- justifica la que ya está. De hecho el orden normal del trabajo es al revés
-- —se paga y después se juntan los PDF—, así que bloquear por «pagado» habría
-- prohibido justo la tarea que esto viene a permitir. Lo que sí cierra la
-- puerta es el expediente cerrado: eso ya se presentó, y cambiarle el
-- respaldo a algo presentado lo hace alguien con responsabilidad.
create or replace function public.adjuntar_comprobante_rhe(p_rhe uuid, p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_post    uuid;
  v_persona uuid;
  v_liq     uuid;
  v_cerrado timestamptz;
begin
  select postulacion_id, persona_id, liquidacion_id
    into v_post, v_persona, v_liq
    from rhe where id = p_rhe;
  if not found then
    return 'No se encontró el recibo.';
  end if;

  if v_liq is not null then
    select cerrado_en into v_cerrado from liquidaciones where id = v_liq;
  end if;

  if public.es_finanzas() then
    null;                                   -- administración, sin límites aquí
  elsif public.es_apoyo_fondo(v_post) or public.rhe_es_mio(v_persona) then
    if v_cerrado is not null then
      return 'El expediente de este recibo ya está cerrado; a partir de ahí el comprobante lo cambia administración.';
    end if;
  else
    return 'No tienes permiso para adjuntar el comprobante de este recibo.';
  end if;

  -- ── QUITAR NO ES ADJUNTAR ──
  -- Un texto vacío borraría el comprobante. Adjuntar suma un dato; quitar
  -- destruye uno que alguien subió, y eso no es lo que esta puerta vino a
  -- permitir. Reemplazar sí se puede —se pone otro, y el trigger de auditoría
  -- deja escrito el cambio—; vaciar la casilla lo hace administración.
  if nullif(btrim(coalesce(p_url, '')), '') is null then
    if not public.es_finanzas() then
      return 'Para quitar un comprobante ya cargado, habla con administración. Sí puedes reemplazarlo por otro.';
    end if;
    update rhe set url = null where id = p_rhe;
    return null;
  end if;

  -- ── QUE SEA UN ENLACE, Y DE LOS NORMALES ──
  -- Esto acaba dentro de un `href` y de un `iframe` en la ficha. Mientras solo
  -- escribía administración el riesgo era teórico; ahora escriben el titular
  -- de cada recibo y el apoyo del fondo, así que la forma se exige aquí en vez
  -- de confiar en que el navegador de quien lo abra haga lo correcto.
  if btrim(p_url) !~* '^https?://' then
    return 'El comprobante tiene que ser un enlace http(s) o un archivo subido desde aquí.';
  end if;

  -- UNA columna. Ni monto, ni fecha, ni persona: eso es la rendición, y no es
  -- lo que se estaba pidiendo poder hacer.
  update rhe set url = btrim(p_url) where id = p_rhe;
  return null;
end $$;

-- Quitar a todo el mundo y dar solo a quien entra con sesión. Lo que protege
-- de verdad es el `begin` de arriba: sin él la ventana peligrosa no está entre
-- estas dos líneas, sino entre el CREATE de la función y su REVOKE.
revoke execute on function public.adjuntar_comprobante_rhe(uuid, text) from public;
revoke execute on function public.adjuntar_comprobante_rhe(uuid, text) from anon;
grant  execute on function public.adjuntar_comprobante_rhe(uuid, text) to authenticated;

revoke execute on function public.es_apoyo_fondo(uuid) from public;
revoke execute on function public.es_apoyo_fondo(uuid) from anon;
grant  execute on function public.es_apoyo_fondo(uuid) to authenticated;

comment on function public.adjuntar_comprobante_rhe(uuid, text) is
  'Cuelga el PDF de un RHE escribiendo SOLO rhe.url. Devuelve null si fue bien, o el motivo del rechazo. Es la única puerta por la que un apoyo o el titular pueden tocar un recibo.';

commit;
