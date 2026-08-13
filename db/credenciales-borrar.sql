-- ============================================================
--  Permitir BORRAR credenciales (faltaba la política RLS de DELETE).
--
--  El mismo hueco que tuvo el UPDATE en su día (db/credenciales-editar.sql),
--  y con el mismo síntoma engañoso: **no da error**. Cuando RLS no deja borrar
--  una fila, no la rechaza — la esconde. El `delete` se ejecuta contra cero
--  filas visibles, borra cero, y PostgREST responde 204 «todo bien». El botón
--  se pinta como si hubiera funcionado y la fila sigue ahí al recargar.
--
--  Por eso el arreglo son DOS cosas y no una: esta política, y que el código
--  pida de vuelta las filas borradas para poder decir «no se borró nada»
--  (ver quitarCuentaDafo y borrarCredencial en app/actions.ts). Sin lo segundo,
--  el día que otra política falte volveríamos a un botón mudo.
--
--  Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================
drop policy if exists "borrar_cred" on credenciales;
create policy "borrar_cred" on credenciales
  for delete to authenticated using (true);

-- Los datos colgados de una credencial. Si la credencial se borra con
-- `on delete cascade`, esto no hace falta; si no lo tiene, sin esta política el
-- borrado del padre falla por la referencia y el mensaje habla de una clave
-- foránea, no de un permiso.
drop policy if exists "cd_del" on credencial_datos;
create policy "cd_del" on credencial_datos
  for delete to authenticated using (true);
