"use client";
import { usePathname } from "next/navigation";
import { SECCIONES } from "@/lib/secciones";
import Link from "next/link";
import { useEffect, useState } from "react";

/* LA NAVEGACIÓN ENTRE SECCIONES, en un solo control.

   Vivía suelta dentro del feed, así que al entrar a una empresa desaparecía y
   para ir a personas había que volver al inicio. Se hizo componente y viajó
   con el <Volver>, que sí está en todas las pantallas.

   Ahora se pliega en un combo. Eran siete íconos sin texto en la cabecera —el
   séptimo llegó con el repositorio— y siete emojis seguidos no son un menú:
   son siete adivinanzas que además le comían el sitio al buscador. El combo
   muestra DÓNDE ESTÁS con su nombre («📁 Proyectos ▾») y al abrirse da la
   lista con ícono y nombre, que es lo que un menú tiene que hacer: decir a
   dónde llevan las cosas antes de tocarlas. */

export default function NavIconos() {
  const pathname = usePathname() || "";
  const [abierto, setAbierto] = useState(false);

  /* Dónde estás. Cuenta la sección entera: la ficha, su historial y sus casos
     también son «estar ahí». */
  const enSeccion = (s: (typeof SECCIONES)[number]) =>
    pathname === s.ruta
    || pathname.startsWith(`/entidad/${s.tipo}/`)
    // El repositorio es la única sección cuya ficha no vive en /entidad
    || (s.tipo === "objeto" && pathname.startsWith("/objeto/"))
    || pathname === `/historial/${s.tipo}`
    || pathname === `/casos/${s.tipo}`;

  const aqui = SECCIONES.find(enSeccion);
  /* «Fondos» no es una sección de entidad (no tiene ficha en /entidad ni
     historial propio): es una vista sobre las postulaciones ganadoras. Va
     fijado aparte para no ensuciar SECCIONES con un tipo falso. */
  const enFondos = pathname === "/fondos" || pathname.startsWith("/fondo/");
  const enEtiquetas = pathname === "/etiquetas";

  // Cerrar con Escape: un menú que solo se cierra con el ratón estorba.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto]);

  // Al navegar, el menú sobra.
  useEffect(() => { setAbierto(false); }, [pathname]);

  return (
    <nav className="nav-menu">
      <button type="button" className={`btn btn-ghost nav-btn${aqui || enFondos ? " nav-aqui" : ""}`}
        onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        title={enFondos ? "Fondos en ejecución" : aqui ? aqui.titulo : "Secciones"}>
        <span className="nav-ico">{enFondos ? "🎬" : aqui ? aqui.ico : "☰"}</span>
        <span className="nav-txt">{enFondos ? "fondos" : aqui ? aqui.plural : "Secciones"}</span>
        <span className="nav-cheb">▾</span>
      </button>
      {abierto && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierto(false)} />
          <div className="nav-lista">
            {SECCIONES.map(s => (
              <Link key={s.tipo} href={s.ruta}
                className={`nav-item${enSeccion(s) ? " on" : ""}`}
                onClick={() => setAbierto(false)}>
                <span className="nav-item-ico">{s.ico}</span>
                <span>{s.plural}</span>
              </Link>
            ))}
            {/* Los fondos ganados en marcha: no son una entidad, pero sí un
                lugar al que se va. */}
            <Link href="/fondos" className={`nav-item${enFondos ? " on" : ""}`}
              onClick={() => setAbierto(false)}
              style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}>
              <span className="nav-item-ico">🎬</span>
              <span>fondos en ejecución</span>
            </Link>
            {/* Las etiquetas no son una entidad, pero son un lugar al que se va
                a administrarlas — como fondos. Antes vivían en el menú de la
                cuenta; aquí, junto a las demás secciones, se encuentran mejor. */}
            <Link href="/etiquetas" className={`nav-item${enEtiquetas ? " on" : ""}`}
              onClick={() => setAbierto(false)}>
              <span className="nav-item-ico">🏷️</span>
              <span>etiquetas</span>
            </Link>
          </div>
        </>
      )}
    </nav>
  );
}
