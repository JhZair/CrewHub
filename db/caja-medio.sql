-- ============================================================
--  EL MEDIO DE PAGO DE CADA CAJA — «Visa Débito ···8897»
--
--  Una caja de tipo banco es una cuenta, pero lo que se saca del bolsillo es
--  una tarjeta, y en el voucher lo único que aparece son cuatro dígitos. Sin
--  esto, «¿de qué tarjeta salió este gasto?» se contesta por WhatsApp, que es
--  donde el sistema deja de servir.
--
--  ⚠ AQUÍ SOLO VAN LOS ÚLTIMOS CUATRO DÍGITOS.
--  El número completo, la fecha de vencimiento, el CVV y el PIN NO se guardan
--  en CrewHub, y no es una formalidad: esta base la lee todo el equipo, no
--  está cifrada campo a campo, y con esos tres datos juntos se compra por
--  internet. Lo que va aquí es lo mismo que imprime cualquier voucher —marca,
--  tipo y cuatro dígitos—, que es exactamente lo que hace falta para
--  reconocer un gasto y nada más.
--
--  Correr en Supabase → SQL Editor. Idempotente.
--  ⚠ DESPUÉS de db/caja.sql.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'caja') then
    raise exception 'Falta la tabla caja: corre antes db/caja.sql';
  end if;
end $$;


-- ── EL CAMPO ──
-- Texto libre y corto, no tres columnas (marca / tipo / dígitos). Lo que se
-- escribe se lee entero y nunca se busca por partes: partirlo obligaría a
-- rellenar tres casillas para apuntar «Yape de Katy», que ni es Visa ni tiene
-- cuatro dígitos. Un solo campo admite «Visa Débito ···8897», «Mastercard
-- corporativa ···4102» y «Yape 987···321» sin inventar un catálogo.
alter table caja add column if not exists medio text;

comment on column caja.medio is
  'Cómo se paga con esta caja: marca y ÚLTIMOS CUATRO dígitos («Visa Débito ···8897»). PROHIBIDO el número completo, el vencimiento, el CVV y el PIN.';


-- ── LA GUARDA CONTRA EL NÚMERO COMPLETO ──
--
-- No basta con pedirlo en el comentario ni con validarlo en el navegador: el
-- día que alguien pegue el número entero de la tarjeta en esa casilla —por
-- costumbre, por prisa, porque el campo parecía pedirlo— quedaría escrito en
-- una tabla que lee todo el equipo y en cada copia de seguridad, y no hay
-- forma de borrarlo del pasado. La regla vive en la BASE porque es la única
-- capa por la que pasan todos los caminos: la pantalla, un script, el SQL
-- Editor.
--
-- ── EL TOPE ES SIETE DÍGITOS, NO TRECE ──
-- La primera versión rechazaba trece o más, razonando que ese es el mínimo de
-- un PAN. Dos agujeros: un Maestro puede tener doce, y sobre todo «venc 12/28
-- cvv 123 ···8897» son ONCE dígitos y pasaba — justo la combinación con la que
-- se compra por internet, colada por la puerta que decía protegerla.
-- Se cuenta hacia arriba desde lo legítimo: aquí caben cuatro dígitos, o los
-- seis de un número de operación. Nada más.
--
-- ── LO QUE ESTO TAMBIÉN DEJA FUERA, Y ESTÁ BIEN ──
-- Un número de cuenta o un CCI tampoco pasan. Este campo es para RECONOCER un
-- gasto —marca y cuatro dígitos—, no para guardar la cuenta; si algún día hace
-- falta la cuenta, será otro campo con su propio criterio.
--
-- ⚠ Estos números están copiados a mano de lib/medioPago.ts. No hay forma de
-- compartirlos entre TypeScript y un `check` de Postgres; si divergen, gana
-- este archivo y se ve como un error al guardar. Al cambiar un umbral hay que
-- tocar los dos.
--
-- Antes de crear la restricción se mira si hay datos que ya la violen, y se
-- avisa CON la lista. Un `alter table` que falla solo dice el nombre del
-- constraint, y encima el SQL Editor de Supabase envuelve el script entero en
-- una transacción: al revertirse se llevaría por delante el `add column` de
-- arriba, y el recado mandaría a mirar una columna que ya no existe.
do $$
declare sucias text;
begin
  select string_agg(nombre, ', ') into sucias
    from caja
   where medio is not null
     and (length(regexp_replace(medio, '\D', '', 'g')) >= 7
          or medio ~ '[0-9]{1,2}\s*[/-]\s*[0-9]{2,4}');
  if sucias is not null then
    raise exception 'Estas cajas tienen en `medio` algo que no debería estar ahí (un número largo o una fecha): %. Déjalo en «marca ···1234» y vuelve a correr esto.', sucias;
  end if;
end $$;

alter table caja drop constraint if exists caja_medio_sin_pan;
alter table caja add constraint caja_medio_sin_pan check (
  medio is null
  -- Ni siete dígitos juntos ni sueltos: se cuentan todos los del texto.
  or (length(regexp_replace(medio, '\D', '', 'g')) < 7
  -- Ni nada con forma de fecha, que es como se escribe un vencimiento.
      and medio !~ '[0-9]{1,2}\s*[/-]\s*[0-9]{2,4}')
);

-- Y un techo de longitud, para que el campo no se convierta en el cajón de
-- sastre donde acaba la dirección de la sucursal y el nombre del ejecutivo.
alter table caja drop constraint if exists caja_medio_corto;
alter table caja add constraint caja_medio_corto
  check (medio is null or length(medio) <= 60);


-- ── Y LA MISMA PUERTA EN EL NOMBRE ──
-- La regla es de la tabla, no de un campo: a quien le rechacen el número en la
-- casilla de la tarjeta, el sitio siguiente donde lo va a pegar es el NOMBRE de
-- la caja, que está tres centímetros a la izquierda.
-- Aquí el listón es el otro —doce dígitos, el PAN más corto que existe—,
-- porque un nombre sí puede llevar dígitos con motivo: «Banco BCP 191-2345678
-- Soles» es un nombre razonable y tiene diez.
do $$
declare sucias text;
begin
  select string_agg(id::text, ', ') into sucias
    from caja where length(regexp_replace(nombre, '\D', '', 'g')) >= 12;
  if sucias is not null then
    raise exception 'Estas cajas tienen doce o más dígitos en el NOMBRE, que es lo que tiene un número de tarjeta: %. Míralo antes de correr esto.', sucias;
  end if;
end $$;

alter table caja drop constraint if exists caja_nombre_sin_pan;
alter table caja add constraint caja_nombre_sin_pan
  check (length(regexp_replace(nombre, '\D', '', 'g')) < 12);


-- Sin política nueva: `medio` viaja dentro de `caja`, que ya tiene las suyas
-- en db/caja.sql (leer, todo el equipo; escribir, administración o finanzas).
-- Añadir una aquí sería una segunda regla sobre la misma tabla, y dos reglas
-- sobre lo mismo acaban discrepando.

notify pgrst, 'reload schema';
