/* ── LA REGLA DE LA BITÁCORA (una sola fuente de verdad) ──
   El trigger de la base `registrar_evento_estado` (db/schema.sql) ya registra
   SOLO estos campos en `actividad` cada vez que se hace un UPDATE, con el actor
   (auth.uid()) y el valor «de → a».

   REGLA: las server actions NO deben insertar actividad para estos campos.
   Si lo hacen, la entrada sale DUPLICADA (el trigger la pone también). Le pasó
   a `responsable`: la acción lo anotaba a mano Y el trigger, → dos líneas
   idénticas en el caso. Para TODO LO DEMÁS (fecha límite, descripción, título,
   vínculos, datos…) sí se anota a mano, porque el trigger no los cubre.

   Esta lista debe COINCIDIR con `claves` del trigger en db/schema.sql. Vive
   aquí para que cualquier acción que arme un diff excluya estos campos (como
   ya hace `guardarEntidad`) en vez de re-declararla y arriesgar que diverjan. */
export const CAMPOS_TRIGGER = [
  "estado", "etapa", "estado_actividad", "prioridad", "responsable",
] as const;

/** ¿Este campo lo registra el trigger (y por tanto NO se anota a mano)? */
export const esCampoDelTrigger = (campo: string): boolean =>
  (CAMPOS_TRIGGER as readonly string[]).includes(campo);
