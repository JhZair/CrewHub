-- ============================================================
--  db/obligacion-desde.sql — DESDE CUÁNDO DECLARA UNA EMPRESA
--
--  `obligacion_generar` arrancaba en `coalesce(obligacion.desde, hace un año)`.
--  El «hace un año» era un valor por defecto elegido a falta de algo mejor, y
--  se notó en cuanto se usó: con la obligación creada en agosto de 2026, la
--  lista empezaba en agosto de 2025 y no había forma de ver 2024 sin tocar SQL.
--  Peor todavía: para una empresa constituida el año pasado habría inventado
--  meses en los que no existía, y esos meses saldrían en rojo.
--
--  ── HAY UN DATO MEJOR, Y YA ESTÁ EN LA FICHA ──
--  `empresas.fecha_constitucion`. Una empresa no declara antes de existir, así
--  que esa fecha es un SUELO DURO, no una sugerencia: aunque alguien ponga un
--  `desde` anterior, no se generan periodos previos a la constitución. Un mes
--  vencido de cuando la asociación no existía no es un pendiente, es un error
--  del sistema — y de los convincentes, porque sale igual que los de verdad.
--
--  ── EL ORDEN DE PREFERENCIA ──
--    1. `obligacion.desde`      → lo que alguien decidió a mano. Manda.
--    2. `empresas.fecha_constitucion` → el hecho, cuando no hay decisión.
--    3. hace un año             → el último recurso, si no hay ni lo uno ni lo
--                                 otro. Se conserva para no dejar de generar
--                                 nada por una ficha incompleta.
--  Y sobre todo eso, el suelo: nunca antes de la constitución.
--
--  ── POR QUÉ NO SE GENERA TODO EL HISTORIAL SIEMPRE ──
--  Porque una empresa de 2015 daría ciento treinta meses en rojo, y casi todos
--  estarían declarados —solo que hace años y sin que nadie los marque aquí—.
--  Ciento treinta alarmas falsas no señalan nada: enseñan a ignorar el rojo.
--  Quien lleva la empresa decide desde cuándo quiere seguirla, y para eso el
--  campo `desde` ahora se puede tocar desde la pantalla.
--
--  Idempotente. Al final verifica.
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
  constit  date;
  cur      date;
  fin      date;
  creados  int := 0;
  v_fecha  date;
begin
  select * into o from obligacion where id = p_obligacion;
  if not found or not o.activa then return 0; end if;

  /* El dígito y la fecha de constitución, de una vez: los dos salen de la
     misma empresa y los dos hacen falta en cada rama. */
  dig := -1; constit := null;
  if o.entidad_tipo = 'empresa' then
    select coalesce(nullif(right(regexp_replace(ruc, '\D', '', 'g'), 1), '')::int, -1),
           fecha_constitucion
      into dig, constit
      from empresas where id = o.entidad_id;
    dig := coalesce(dig, -1);
  end if;

  if o.periodicidad = 'anual' then
    declare
      y_ini int := extract(year from coalesce(o.desde, constit, current_date - interval '1 year'))::int;
      y_fin int := extract(year from current_date)::int - 1;
      y     int;
    begin
      -- El suelo de la constitución también manda aquí: no hay jurada de un
      -- ejercicio anterior a la existencia de la empresa.
      if constit is not null then
        y_ini := greatest(y_ini, extract(year from constit)::int);
      end if;
      for y in select generate_series(y_ini, y_fin) loop
        select fecha into v_fecha from vencimiento_oficial
         where clase = o.clase and anio = y and mes = 0
           and digito in (dig, -1) order by digito desc limit 1;
        insert into obligacion_periodo (obligacion_id, anio, mes, vence)
        values (p_obligacion, y, 0, v_fecha)
        on conflict (obligacion_id, anio, mes) do nothing;
        if found then creados := creados + 1; end if;
      end loop;
    end;
    return creados;
  end if;

  -- Mensual.
  cur := date_trunc('month', coalesce(o.desde, constit, current_date - interval '1 year'))::date;
  if constit is not null then
    cur := greatest(cur, date_trunc('month', constit)::date);
  end if;
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
     order by digito desc limit 1;

    insert into obligacion_periodo (obligacion_id, anio, mes, vence)
    values (p_obligacion, extract(year from cur)::int, extract(month from cur)::int, v_fecha)
    on conflict (obligacion_id, anio, mes) do nothing;
    if found then creados := creados + 1; end if;

    cur := (cur + interval '1 month')::date;
  end loop;
  return creados;
end;
$$;

/* ── LIMPIAR LO QUE SE GENERÓ DE MÁS ──
   Si alguna obligación ya creó periodos anteriores a la constitución de su
   empresa, se borran. Solo los VACÍOS: si alguien marcó uno como declarado,
   sabe algo que el sistema no y no se le tira su dato — se queda y se ve. */
delete from obligacion_periodo p
 using obligacion o, empresas e
 where p.obligacion_id = o.id
   and o.entidad_tipo = 'empresa' and e.id = o.entidad_id
   and e.fecha_constitucion is not null
   and p.declarado_en is null and p.resultado is null and p.caso_id is null
   and make_date(p.anio, greatest(p.mes, 1), 1) < date_trunc('month', e.fecha_constitucion)::date;

-- ── VERIFICAR ──
select e.nombre, e.fecha_constitucion, o.clase, o.desde,
       count(*) as periodos,
       min(make_date(p.anio, greatest(p.mes, 1), 1)) as desde_periodo,
       max(make_date(p.anio, greatest(p.mes, 1), 1)) as hasta_periodo
  from obligacion o
  left join empresas e on e.id = o.entidad_id
  left join obligacion_periodo p on p.obligacion_id = o.id
 group by 1, 2, 3, 4
 order by 1, 3;

/* Ninguno debería salir aquí: un periodo anterior a la constitución de su
   empresa es un mes en el que no existía. */
select e.nombre, o.clase, p.anio, p.mes, e.fecha_constitucion
  from obligacion_periodo p
  join obligacion o on o.id = p.obligacion_id
  join empresas e on e.id = o.entidad_id
 where e.fecha_constitucion is not null
   and make_date(p.anio, greatest(p.mes, 1), 1) < date_trunc('month', e.fecha_constitucion)::date;
