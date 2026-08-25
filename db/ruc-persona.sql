-- ══════════════════════════════════════════════════════════════════════════
-- EL RUC DE UNA PERSONA, CARGABLE DESDE DONDE SE DESCUBRE QUE FALTA
--
-- Al cargar los 58 comprobantes de PO-005 apareció el cuello de botella real:
-- 42 de 59 archivos se colocaban solos y el resto se quedaba en «no sé de
-- quién es». La causa no era el lector de PDF —los recibos se leen enteros,
-- RUC incluido— sino que ese RUC no estaba en la ficha de la persona. El cruce
-- necesita las dos puntas.
--
-- Es la clase de dato que solo se echa de menos en el momento en que hace
-- falta, y en ese momento uno está en otra pantalla, con 58 archivos a medio
-- clasificar. Mandar a alguien a la ficha de la persona, cargarlo, volver y
-- empezar de nuevo es la forma segura de que no se cargue nunca. Con esto se
-- carga ahí mismo y los demás recibos de esa persona pasan a cruzar solos.
--
-- ── POR QUÉ UNA FUNCIÓN Y NO UNA POLÍTICA ──
-- `personas` NO tiene política de UPDATE, y es a propósito (ver
-- db/invitaciones.sql): abrirla concedería tocar TODAS las columnas de
-- cualquier ficha desde la API directa — tarifas, DNI, estado SUNAT. Aquí hace
-- falta escribir UNA columna, así que se hace como el enlace de cuentas: una
-- función `security definer` que toca solo `ruc_dni` y comprueba ella misma
-- quién pregunta.
-- ══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fijar_ruc_persona(p_persona uuid, p_ruc text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ruc    text;
  v_actual text;
  v_otra   text;
begin
  -- Solo administración o finanzas. El apoyo de rendición puede colgar el PDF
  -- de un recibo; el catálogo de personas es otra cosa y no viene con él.
  if not public.es_finanzas() then
    return 'Solo administración o finanzas carga el RUC de una ficha.';
  end if;

  v_ruc := regexp_replace(coalesce(p_ruc, ''), '\D', '', 'g');
  -- Once dígitos para RUC, ocho para DNI: la columna guarda los dos y por eso
  -- se llama `ruc_dni`. Cualquier otra longitud es un dedazo, y un dedazo
  -- guardado es peor que el hueco: el hueco se ve.
  if length(v_ruc) not in (8, 11) then
    return 'Un RUC tiene 11 dígitos y un DNI 8. Revisa el número.';
  end if;

  select ruc_dni into v_actual from personas where id = p_persona;
  if not found then
    return 'No se encontró la ficha de esa persona.';
  end if;

  -- ── EL RUC DE UNA PERSONA NATURAL ES SU DNI ──
  -- 10404559821 = «10» + 40455982 + dígito de control. Las fichas del equipo
  -- se cargaron con el DNI —que es lo que se pide para un contrato— y los
  -- recibos traen el RUC. Comparando las cifras enteras no coinciden nunca, y
  -- la ficha correcta se rechazaba con un «ya tiene otro número» teniendo el
  -- MISMO número escrito de otra forma.
  -- Cuando el nuevo CONTIENE al que ya estaba, no es otro dato: es el mismo,
  -- más completo, y se guarda el largo — que es el que cruza con los recibos.
  if v_actual is not null and regexp_replace(v_actual, '\D', '', 'g') <> v_ruc then
    if not (
      length(v_ruc) = 11 and left(v_ruc, 2) = '10'
      and substr(v_ruc, 3, 8) = regexp_replace(v_actual, '\D', '', 'g')
    ) then
      -- ── AHORA SÍ: NO SE PISA UN NÚMERO YA CARGADO ──
      -- Esto dejó de ser «completar un hueco» y pasó a ser «corregir un dato»,
      -- que se hace en la ficha, mirándola entera. Aquí estaríamos cambiando la
      -- identidad tributaria de alguien desde un pop-up de adjuntar archivos.
      return 'Esa ficha ya tiene otro número cargado (' || v_actual || '). Si está mal, corrígelo en su ficha.';
    end if;
  end if;

  -- Y que no sea de otra persona: dos fichas con el mismo RUC hacen que el
  -- cruce de comprobantes elija una de las dos, siempre la misma, en silencio.
  -- También se compara contra el DNI que el RUC lleva dentro: si otra ficha
  -- tiene ese DNI, es la misma persona duplicada y hay que mirarlo, no
  -- cargarle el RUC a las dos.
  select nombre into v_otra from personas
   where id <> p_persona
     and regexp_replace(coalesce(ruc_dni, ''), '\D', '', 'g')
         in (v_ruc, case when length(v_ruc) = 11 and left(v_ruc, 2) = '10'
                         then substr(v_ruc, 3, 8) else v_ruc end)
   limit 1;
  if v_otra is not null then
    return 'Ese número ya está en la ficha de ' || v_otra || '. Puede que sean la misma persona duplicada.';
  end if;

  update personas set ruc_dni = v_ruc where id = p_persona;
  return null;
end $$;

revoke execute on function public.fijar_ruc_persona(uuid, text) from public;
revoke execute on function public.fijar_ruc_persona(uuid, text) from anon;
grant  execute on function public.fijar_ruc_persona(uuid, text) to authenticated;

comment on function public.fijar_ruc_persona(uuid, text) is
  'Completa el RUC/DNI de una ficha que no lo tenía. Solo administración; no pisa un número ya cargado ni admite uno que sea de otra ficha. Devuelve null si fue bien, o el motivo.';

commit;
