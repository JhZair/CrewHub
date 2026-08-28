-- ============================================================
--  db/tratamiento-soltar.sql — ⚠ CORRER ANTES DE PUBLICAR EL CÓDIGO
--
--  db/tratamiento.sql añadió `tratamiento_id` a las cuatro tablas del guion,
--  pero NO tocó el `proyecto_id not null` que traían de db/guion.sql y
--  db/guion-beats.sql. Y el código nuevo inserta sin `proyecto_id`.
--
--  Sin esto, en cuanto se publique, CADA creación de acto, secuencia, hilo o
--  beat —y cualquier duplicado de tratamiento— revienta con:
--      23502 null value in column "proyecto_id" violates not-null constraint
--  El módulo quedaría en modo solo lectura y nadie lo notaría hasta que
--  alguien intentara escribir. El recuento de la migración dio 0 secuencias,
--  así que ni siquiera habría una pantalla rota que avisara.
--
--  ── POR QUÉ ES UN ARCHIVO APARTE Y NO ESTÁ EN `tratamiento-limpiar.sql` ──
--  Porque van en momentos OPUESTOS. Esto tiene que estar corrido ANTES de que
--  el código nuevo llegue a producción; el otro, DESPUÉS. Meterlos juntos
--  garantizaba equivocarse de orden, que es justo lo que pasó al escribirlo la
--  primera vez.
--
--  El orden completo es:
--      1. correr ESTE archivo
--      2. git push  →  esperar el despliegue
--      3. correr db/tratamiento-limpiar.sql
--
--  Correr esto solo deja la base en un estado que aguanta las DOS versiones
--  del código: la vieja sigue escribiendo `proyecto_id`, la nueva no lo manda.
--  Por eso es seguro hacerlo antes y sin prisa.
--
--  Idempotente y sin transacción (pgBouncer).
-- ============================================================

alter table guion_actos      alter column proyecto_id drop not null;
alter table guion_secuencias alter column proyecto_id drop not null;
alter table guion_hilos      alter column proyecto_id drop not null;
alter table guion_beats      alter column proyecto_id drop not null;

-- ── VERIFICACIÓN ──
select table_name, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('guion_actos','guion_secuencias','guion_hilos','guion_beats')
   and column_name = 'proyecto_id'
 order by table_name;
-- Las cuatro tienen que decir is_nullable = YES.
-- Si alguna dice NO, el `alter` no se aplicó y publicar romperá la escritura.
