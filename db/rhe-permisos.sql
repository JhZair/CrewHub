-- ============================================================
--  QUIÉN PUEDE REGISTRAR UN RHE
--
--  Hasta hoy: solo `es_admin`, exigido por el motor (db/auditoria-financiera.sql).
--  Esa dureza tenía una buena razón —que ningún dato de plata se toque sin dejar
--  huella, ni siquiera yendo directo a la API— y NO se afloja aquí: el trigger
--  de auditoría sigue registrando a quien sea que escriba. Lo que cambia es a
--  quién se le abre la puerta, no si queda rastro.
--
--  Y hacía falta abrirla porque el cuello de botella era real: los recibos los
--  giran tres vías distintas (la oficina, Katy con las claves SOL delegadas, y
--  los eventuales que giran el suyo), pero registrarlos en CrewHub+ era tarea
--  de una sola persona. Todo lo que no alcanza a teclear administración se
--  queda fuera del sistema, y lo que no está en el sistema no se rinde.
--
--  Tres puertas, de menos a más:
--
--    1. LO TUYO — cualquiera del equipo registra el recibo girado A SU NOMBRE.
--       Es el caso de quien trabaja en la oficina y el del eventual que gira el
--       suyo. No se le abre nada más: su `persona_id` tiene que ser el de su
--       propia ficha.
--    2. FINANZAS — el asistente de administración registra los de terceros.
--       Rol nuevo, porque `es_admin` da además el panel entero de /admin y
--       ampliar un permiso para conceder otro distinto es como se acaban
--       repartiendo llaves maestras.
--    3. ADMIN — como hasta ahora.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  Requiere haber corrido antes db/auditoria-financiera.sql.
-- ============================================================


-- ── 1) El rol de finanzas ──
alter table perfiles add column if not exists es_finanzas boolean not null default false;

comment on column perfiles.es_finanzas is
  'Puede registrar y corregir datos de plata (RHE) de CUALQUIER persona, sin tener el resto de /admin. Para el asistente de administración.';

-- `security definer` por lo mismo que `es_admin()`: si esta función leyera
-- `perfiles` con los permisos de quien llama, la propia RLS de `perfiles` se
-- consultaría a sí misma y entraría en recursión.
create or replace function public.es_finanzas()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select es_finanzas or es_admin from perfiles where id = auth.uid()), false);
$$;

-- ── 2) ¿Este RHE es mío? ──
--
-- El puente entre la cuenta que entra y la ficha de persona a la que se le
-- giran los recibos. `personas.usuario_id` ya existía y es el mismo puente que
-- usa /jornadas para saber de quién es el mes.
--
-- `strict`-por-diseño: si el `persona_id` viene nulo, esto es falso. Un recibo
-- sin dueño no es «de todos», es un recibo mal hecho.
create or replace function public.rhe_es_mio(p_persona uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((
    select true from personas
    where id = p_persona and usuario_id = auth.uid()
  ), false);
$$;


-- ── 3) Las políticas ──
--
-- Leer sigue abierto a todo el equipo, como estaba.
drop policy if exists "crear_rhe"  on rhe;
drop policy if exists "editar_rhe" on rhe;
drop policy if exists "borrar_rhe" on rhe;

create policy "crear_rhe" on rhe for insert to authenticated
  with check (public.es_finanzas() or public.rhe_es_mio(persona_id));

/* Corregir el propio recibo se permite SOLO mientras no haya pasado nada con
   él: sin pago registrado y sin expediente cerrado. No es desconfianza — es
   que después de esos dos hitos el número ya se usó. Un monto que cambia
   debajo de un pago hecho y de un cierre firmado convierte el rastro de
   auditoría en una discusión sobre cuál de las dos cifras era la buena.

   `liquidacion_id is null or ...`: un recibo que todavía no cuelga de ningún
   mes no puede estar en un expediente cerrado, y sin esta rama el `not exists`
   dejaría fuera el caso normal.

   Administración no tiene ese límite: si hay que corregir después, alguien con
   responsabilidad lo hace y el trigger lo deja escrito. */
create policy "editar_rhe" on rhe for update to authenticated
  using (
    public.es_finanzas()
    or (
      public.rhe_es_mio(persona_id)
      and pagado_en is null
      and (liquidacion_id is null or not exists (
        select 1 from liquidaciones l where l.id = liquidacion_id and l.cerrado_en is not null
      ))
    )
  )
  /* El `with check` es la mitad que se olvida y la que de verdad protege: sin
     él, alguien podría editar un recibo suyo y en la misma operación cambiarle
     el `persona_id` a otro. La fila saldría de su alcance y el permiso se
     habría usado para escribir en el de al lado. */
  with check (public.es_finanzas() or public.rhe_es_mio(persona_id));

create policy "borrar_rhe" on rhe for delete to authenticated
  using (
    public.es_finanzas()
    or (
      public.rhe_es_mio(persona_id)
      and pagado_en is null
      and (liquidacion_id is null or not exists (
        select 1 from liquidaciones l where l.id = liquidacion_id and l.cerrado_en is not null
      ))
    )
  );


-- ── 4) Quién es de finanzas ──
--
-- `perfiles` no guarda el correo (solo id, nombre, rol…), así que la llave se
-- da por nombre. Se comprueba ANTES con el select de abajo: un `update` por
-- nombre que no casa con nadie no falla, no hace nada — y «no pasó nada» se
-- lee igual que «ya estaba puesto».
--
--   select id, nombre, rol, es_admin, es_finanzas from perfiles order by nombre;
--
-- Con el nombre exacto delante:
--
--   update perfiles set es_finanzas = true where nombre = 'Wilfredo ...';
--
-- Y para ver quién tiene qué llave:
--
--   select nombre, es_admin, es_finanzas from perfiles
--    where es_admin or es_finanzas order by nombre;
