/* Roles de los actores sociales de un documental y su ORDEN de importancia.
   Fuente única: la usa el combo al agregar/editar un actor y el ordenamiento
   de las listas (protagonistas primero, luego secundarios, luego los demás). */

/** Sugerencias del combo. Es editable (datalist): un documental puede tener
    roles que no están aquí, pero estos cubren el caso normal. */
export const ROLES_ACTOR = [
  "Protagonista", "Secundario", "Antagonista", "Testimonio", "Reparto",
];

/** Rango para ordenar: protagonista (0) → secundario (1) → otro rol (2) →
    sin rol (3). Se compara por raíz para tolerar «protagonistas», mayúsculas… */
export function rangoRol(rol?: string | null): number {
  const r = (rol || "").trim().toLowerCase();
  if (!r) return 3;
  if (r.startsWith("protagon")) return 0;
  if (r.startsWith("secundar")) return 1;
  return 2;
}

/** Ordena una lista de actores por rango de rol (estable dentro del mismo rango). */
export function ordenarActores<T extends { rol?: string | null }>(actores: T[]): T[] {
  return [...actores].sort((a, b) => rangoRol(a.rol) - rangoRol(b.rol));
}
