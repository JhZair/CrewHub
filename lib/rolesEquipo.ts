/* Jerarquía de roles del equipo de una postulación —fuente única del ORDEN.
   La usan el editor de equipo (EquipoPostulacion) y las vistas que listan el
   equipo (trayectoria de empresa, etc.): dirección arriba, luego producción,
   técnicos, videojuego… Los cargos fuera de la lista van al final. */
export const ROLES_EQUIPO = [
  "Responsable General", "Representante Legal", "Titular",
  "Director/a", "Asistente de Dirección",
  "Productor/a", "Productor/a Ejecutivo/a", "Jefe/a de Producción", "Asistente de Producción",
  "Creador/a del concepto artístico", "Autor/a del tratamiento o guión", "Guionista",
  "Director/a de Fotografía", "Asistente de Cámara", "Sonidista", "Director/a de Arte",
  "Editor/a", "Asistente de Edición", "Investigador/a", "Facilitador/a", "Gestor/a Cultural",
  "Compositor/a de Música", "Operador/a de Drone", "Animador/a",
  // Videojuego (cargos de la plataforma DAFO).
  "Diseñador/a de Juegos", "Productor/a de Juegos", "Diseñador/a de Niveles",
  "Programador/a", "Tester de Juegos", "Diseñador/a UI/UX", "Escritor/a Narrativo/a",
  "Artista Gráfico/a",
  "Artista Generalista Props (Modelado y Texturizado 3D)",
  "Artista Generalista Personajes (Modelado, Texturizado, Rigging y Animación 3D)",
  "Actor/Actriz de Voz", "Desarrollador/a de IA", "Especialista en Unreal Engine",
];

/* Los cargos que ENCABEZAN una postulación: quien responde por ella.
   Se deriva de la lista de arriba (los cuatro primeros) en vez de repetirla,
   para que reordenar ROLES_EQUIPO no descuadre el palmarés en silencio.

   El corte lo decidió John: dirección y titularidad, sin producción. Un
   productor ejecutivo es equipo para este recuento —cuenta, pero en el
   escalón de abajo—. Cambiar el corte es cambiar `N_LIDERAZGO`, y hay que
   hacerlo a sabiendas: mueve todos los méritos ya mostrados. */
const N_LIDERAZGO = 4;
export const CARGOS_LIDERAZGO = ROLES_EQUIPO.slice(0, N_LIDERAZGO);

/** ¿Este cargo encabeza la postulación (dirección o titularidad)? */
export const esLiderazgo = (cargo?: string | null): boolean =>
  CARGOS_LIDERAZGO.includes((cargo || "").trim());

/** Rango de un cargo (menor = más arriba). Fuera de la lista → al final. */
export function rangoRol(cargo?: string | null): number {
  const i = ROLES_EQUIPO.indexOf((cargo || "").trim());
  return i < 0 ? ROLES_EQUIPO.length + 1 : i;
}

/** Ordena un equipo por jerarquía de rol; a igual rango, alfabético por nombre. */
export function ordenarEquipo<T extends { cargo?: string | null; persona?: { nombre?: string | null } | null }>(equipo: T[]): T[] {
  return [...equipo].sort((a, b) => {
    const d = rangoRol(a.cargo) - rangoRol(b.cargo);
    if (d) return d;
    return (a.persona?.nombre || "").localeCompare(b.persona?.nombre || "");
  });
}
