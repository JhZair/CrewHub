"use client";
import { usePathname } from "next/navigation";
import { SECCIONES } from "@/lib/secciones";
import Link from "next/link";

/* La navegación entre entidades. Vivía suelta dentro del feed, así que en
   cuanto entrabas a una empresa desaparecía y para ir a personas tenías que
   volver al inicio primero. Ahora es un componente y viaja con el <Volver>,
   que sí está en todas las pantallas internas. */

export default function NavIconos() {
  const pathname = usePathname() || "";
  return (
    <nav className="nav-icons">
      {SECCIONES.map(s => {
        /* Marcar dónde estás: seis íconos iguales sin señal de posición son
           seis adivinanzas. Cuenta la sección entera: la ficha, su historial
           y sus casos también encienden su ícono. */
        const aqui = pathname === s.ruta
          || pathname.startsWith(`/entidad/${s.tipo}/`)
          // El repositorio es la única sección cuya ficha no vive en /entidad
          || (s.tipo === "objeto" && pathname.startsWith("/objeto/"))
          || pathname === `/historial/${s.tipo}`
          || pathname === `/casos/${s.tipo}`;
        return (
          <Link key={s.tipo} href={s.ruta} className={`btn btn-ghost${aqui ? " nav-aqui" : ""}`}
            title={s.titulo}>{s.ico}</Link>
        );
      })}
    </nav>
  );
}
