"use client";
import { useRouter } from "next/navigation";
import MiniSelect from "@/components/MiniSelect";

/* UN DESPLEGABLE DE FILTRO DEL TABLERO — y solo uno para los seis.
 *
 * Antes cada control navegaba con SU parámetro y nada más:
 *   FiltroPersona  → router.push(`/tablero?p=${id}${sufijo}`)
 *   los chips      → `/tablero?v=${val}${sufijo}`
 * O sea que elegir persona borraba el tipo y elegir tipo borraba la persona.
 * No era un descuido: el tablero estaba pensado con UN eje. Con cinco —tipo,
 * persona, etiqueta, proyecto, empresa, convocatoria, postulación— eso no se
 * sostiene: John tiene 169 casos y necesita cruzarlos, no elegir uno por vez.
 *
 * Por eso este componente recibe `vivos`: TODOS los filtros puestos ahora
 * mismo. Cambia el suyo y conserva el resto. Es la única forma de que sumar
 * un eje nuevo no obligue a acordarse de los otros seis.
 */
export default function FiltroTablero({ ico, titulo, items, param, actual, vivos, ancho, vacio = "" }: {
  ico: string;
  /** Lo que dice cuando no hay nada puesto: «Proyecto», «Etiqueta»… */
  titulo: string;
  items: { id: string; nombre: string }[];
  /** El parámetro de la URL que gobierna: `etq`, `proy`, `emp`… */
  param: string;
  actual: string;
  /** Los filtros vivos, para preservarlos. */
  vivos: Record<string, string>;
  ancho?: number;
  /** Qué valor significa «todas». Vacío para casi todos —quitar el parámetro
   *  es no filtrar— pero el eje PERSONA necesita decirlo con una palabra
   *  (`todos`): ahí la URL sin `p` significa «recién llego», y el sistema
   *  responde poniendo «Mis asuntos». Sin este centinela, «Todas · Persona»
   *  te devolvía a lo tuyo en vez de enseñarte el equipo entero. */
  vacio?: string;
}) {
  const router = useRouter();

  const ir = (v: string) => {
    const u = new URLSearchParams(vivos);
    if (v) u.set(param, v); else u.delete(param);
    const s = u.toString();
    router.push(`/tablero${s ? "?" + s : ""}`);
  };

  const puesto = items.find(i => i.id === actual);
  const opciones: [string, string][] = [
    [vacio, `Todas · ${titulo}`],
    ...items.map(i => [i.id, i.nombre] as [string, string]),
  ];

  return (
    <MiniSelect value={actual} options={opciones} onSelect={ir}
      /* El botón dice QUÉ hay puesto, no el nombre del eje: con seis
         desplegables seguidos, «Proyecto ▾» seis veces no informa de nada.
         Puesto = el nombre. Vacío = el eje, apagado. */
      etiqueta={`${ico} ${puesto ? puesto.nombre : titulo}`}
      buttonClass={`filtro-tb${puesto ? " puesto" : ""}`}
      buttonStyle={ancho ? { maxWidth: ancho } : undefined} />
  );
}
