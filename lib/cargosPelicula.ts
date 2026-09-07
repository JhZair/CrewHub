/* ══════════════════════════════════════════════════════════════════════════
   LOS CARGOS DE UNA PELÍCULA, Y SU ORDEN

   ── POR QUÉ ESTÁ EN lib/ Y NO EN EL COMPONENTE ──
   ⚠ Vivía dentro de `components/EquipoProyecto.tsx`, que es `"use client"`. En
   cuanto ⚖ clearance necesitó listar el equipo, su página —de servidor— no
   podía importarla: un export nombrado de un módulo cliente llamado en el
   servidor revienta en runtime (está contado en lib/texto.ts).
   Así que la lista se quedó sin orden allí y el equipo salía alfabético: la
   directora en medio, entre «Conductora» y «Edición». Un orden que existe y
   que una pantalla no puede leer es un orden que se pierde.

   ── NO SE FUSIONA CON LAS OTRAS DOS LISTAS DE CARGOS ──
   Hay tres en el repo y son tres cosas distintas:
     · esta — los cargos de una PELÍCULA: directora, cámara, montaje;
     · `ROLES_EQUIPO` en lib/rolesEquipo — el equipo de una POSTULACIÓN, con el
       vocabulario que exige la plataforma DAFO;
     · `CARGOS` en components/Miembros — los cargos SOCIETARIOS de una empresa:
       presidente, gerente, tesorero.
   Se parecen y no lo son. Juntarlas metería «Tesorero/a» en el desplegable del
   equipo de un documental.
   ══════════════════════════════════════════════════════════════════════════ */

/* El orden no es alfabético: sigue el rodaje. Dirección arriba, después
   producción, después los oficios — y dentro de los oficios, la cámara junta.
   Buscar «segunda cámara» debajo de «dirección de fotografía» es donde la
   mano la va a buscar. */
export const CARGOS = [
  "Directora", "Director", "Codirección",
  /* ── CONDUCCIÓN ──
     Quien lleva el relato ante la cámara: presenta, pregunta, acompaña. En un
     documental de encuentro es la figura que hace avanzar la película, y en una
     cobertura es quien la conduce de principio a fin.
     Va con dirección y no al final entre los oficios porque conducir es trabajo
     de RELATO, no de gestión ni de técnica; y por encima de producción por el
     mismo motivo que el orden entero: sigue el rodaje, no el organigrama.
     ⚠ Es un cargo del EQUIPO —quien trabaja— y no hay que confundirlo con el
     grupo `conduccion` de lib/repartoFondo, que es del REPARTO: quién sale.
     Las conductoras de Mujeres del Ande están en las dos listas, y eso es
     correcto: dirigen la película y además aparecen en ella. */
  "Conductora", "Conductor",
  "Productora", "Productor", "Producción ejecutiva", "Jefatura de producción",
  "Guion", "Investigación",
  /* El dron va con la cámara y no al final: es una cámara más, y quien busca
     «quién vuela» baja por el bloque de imagen. */
  "Dirección de fotografía", "Segunda cámara (cámara B)", "Operador de dron",
  // Un solo cargo, no dos: la misma persona hace la foto fija y el BTS
  "Foto fija y detrás de cámaras (BTS)",
  /* «Montaje» y «Edición» conviven a propósito y pegados: el equipo usa las dos
     palabras para el mismo oficio y ya hay filas guardadas como «Montaje».
     Ponerlas juntas hace visible la elección; unificarlas habría reescrito
     datos que alguien puso a conciencia. Si un día se decide una sola, es un
     UPDATE de una línea — y esta nota dice por qué había dos. */
  "Sonido", "Montaje", "Edición", "Música original",
  "Dirección de arte", "Asistencia de dirección", "Asistencia de producción",
];


/**
 * Dónde va un cargo en el orden. Los que no están en la lista, al final.
 *
 * ⚠ Aquí y no en cada pantalla: era un `CARGOS.indexOf` escrito dentro del
 * `sort` de `EquipoProyecto`, y cuando ⚖ clearance tuvo que ordenar lo mismo la
 * opción fácil era copiarlo. Dos ordenaciones que se separan dejan a la misma
 * persona en un sitio distinto en cada pantalla.
 */
export function ordenCargo(cargo?: string | null): number {
  const i = CARGOS.indexOf((cargo || "").trim());
  return i === -1 ? CARGOS.length : i;
}

/** Ordena una lista de miembros por su cargo y, a igualdad, por nombre. */
export function ordenarPorCargo<T>(
  filas: T[], cargoDe: (x: T) => string | null | undefined,
  nombreDe: (x: T) => string,
): T[] {
  return [...filas].sort((a, b) =>
    ordenCargo(cargoDe(a)) - ordenCargo(cargoDe(b))
    || nombreDe(a).localeCompare(nombreDe(b), "es"));
}
