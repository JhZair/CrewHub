"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

/* La navegación entre entidades. Vivía suelta dentro del feed, así que en
   cuanto entrabas a una empresa desaparecía y para ir a personas tenías que
   volver al inicio primero. Ahora es un componente y viaja con el <Volver>,
   que sí está en todas las pantallas internas. */

/* [ruta, ícono, título, tipo de entidad]. El tipo va escrito, no deducido:
   quitarle la "s" a "postulaciones" da "postulacione" y el resaltado nunca
   habría encendido en esa sección. */
export const SECCIONES: [string, string, string, string][] = [
  ["/proyectos", "📁", "Proyectos", "proyecto"],
  ["/empresas", "🏢", "Empresas", "empresa"],
  ["/personas", "👤", "Personas", "persona"],
  ["/postulaciones", "🎯", "Postulaciones", "postulacion"],
  ["/equipamiento", "🎥", "Equipos audiovisuales", "equipamiento"],
  ["/convocatorias", "📜", "Convocatorias y fondos", "convocatoria"],
];

export default function NavIconos() {
  const pathname = usePathname() || "";
  return (
    <nav className="nav-icons">
      {SECCIONES.map(([href, ico, titulo, tipo]) => {
        /* Marcar dónde estás: seis íconos iguales sin señal de posición son
           seis adivinanzas. Incluye la ficha y el historial de la sección
           (/entidad/empresa/… y /historial/empresa iluminan 🏢). */
        const aqui = pathname === href
          || pathname.startsWith(`/entidad/${tipo}/`)
          || pathname === `/historial/${tipo}`;
        return (
          <Link key={href} href={href} className={`btn btn-ghost${aqui ? " nav-aqui" : ""}`}
            title={titulo}>{ico}</Link>
        );
      })}
    </nav>
  );
}
