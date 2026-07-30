"use client";
import { usePathname } from "next/navigation";
import { SECCIONES } from "@/lib/secciones";
import Link from "next/link";
import { useEffect, useState } from "react";
import { casillaSinLeer } from "@/app/casilla/acciones";

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
  /* Los correos de DAFO sin leer. Se pide desde el cliente y no por props
     porque esta nav vive dentro de <Volver>, que está en las 19 pantallas:
     enhebrar el dato por diecinueve páginas era la otra opción.
     Se relee al navegar —marcar uno como leído en /casilla tiene que bajar el
     número— y es un `count` sin filas, así que cuesta casi nada. */
  const [casilla, setCasilla] = useState(0);
  useEffect(() => {
    let vivo = true;
    casillaSinLeer().then(n => { if (vivo) setCasilla(n); }).catch(() => {});
    return () => { vivo = false; };
  }, [pathname]);

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
  const enCasilla = pathname === "/casilla";

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
      <button type="button" className={`btn btn-ghost nav-btn${aqui || enFondos || enCasilla ? " nav-aqui" : ""}`}
        onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        title={enCasilla ? "Casilla DAFO" : enFondos ? "Fondos en ejecución" : aqui ? aqui.titulo : "Secciones"}>
        <span className="nav-ico">{enCasilla ? "📬" : enFondos ? "🎬" : aqui ? aqui.ico : "☰"}</span>
        <span className="nav-txt">{enCasilla ? "casilla" : enFondos ? "fondos" : aqui ? aqui.plural : "Secciones"}</span>
        <span className="nav-cheb">▾</span>
        {/* El punto rojo cuando hay correo de DAFO sin leer. Es el indicador
            PERMANENTE: la campanita habla de lo que acaba de pasar y se calla al
            leerse; esto sigue ahí mientras quede algo pendiente en la casilla. No
            se pinta estando en /casilla, donde el pendiente ya está a la vista. */}
        {casilla > 0 && !enCasilla && (
          <span title={`${casilla} correo(s) de DAFO sin leer`}
            style={{
              background: "var(--red)", color: "#fff", fontSize: 9.5, fontWeight: 800,
              borderRadius: 8, padding: "1px 5px", minWidth: 16, textAlign: "center",
            }}>{casilla > 99 ? "99+" : casilla}</span>
        )}
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
            {/* La casilla DAFO tampoco es una entidad: es la bandeja donde
                aterrizan los correos de todas las postulaciones, que antes
                vivían repartidos en diez cuentas de Gmail. */}
            <Link href="/casilla" className={`nav-item${enCasilla ? " on" : ""}`}
              onClick={() => setAbierto(false)}>
              <span className="nav-item-ico">📬</span>
              <span>casilla DAFO</span>
              {casilla > 0 && (
                <span style={{
                  marginLeft: "auto", background: "var(--red)", color: "#fff",
                  fontSize: 9.5, fontWeight: 800, borderRadius: 8, padding: "1px 6px",
                }}>{casilla > 99 ? "99+" : casilla}</span>
              )}
            </Link>
          </div>
        </>
      )}
    </nav>
  );
}
