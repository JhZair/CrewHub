"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Enlace from "@/components/Enlace";
import Buscador from "./Buscador";
import { ArrowLeft, Menu, Moon, Sun, X } from "./Iconos";

/* ══════════════════════════════════════════════════════════════════════════
   EL CASCARÓN DE LA WIKI

   Layout propio, distinto del panel de gestión (guía, sección 9): barra
   superior con marca, buscador y vuelta a CrewHUB+; tema claro/oscuro con
   memoria en el navegador; y el estado «menú abierto» del móvil, que
   comparten la barra (el botón) y la barra lateral (que se desliza).

   Todo lo demás lo pintan las páginas de servidor dentro de `children`.
   ══════════════════════════════════════════════════════════════════════════ */

type UI = { menuOpen: boolean; setMenuOpen: (v: boolean) => void; dark: boolean };
const Ctx = createContext<UI>({ menuOpen: false, setMenuOpen: () => {}, dark: true });
export const useWikiUI = () => useContext(Ctx);

const CLAVE_TEMA = "wiki-tema";

export default function WikiShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/wiki";
  const enInicio = pathname === "/wiki" || pathname === "/wiki/";
  const [menuOpen, setMenuOpen] = useState(false);
  /* Oscuro por defecto: es el tema de CrewHUB+. El claro se recuerda por
     navegador; se aplica tras montar para no discrepar con el HTML del
     servidor. */
  const [dark, setDark] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(CLAVE_TEMA) === "claro") setDark(false); } catch {}
  }, []);
  const cambiarTema = () => {
    setDark(d => {
      try { localStorage.setItem(CLAVE_TEMA, d ? "claro" : "oscuro"); } catch {}
      return !d;
    });
  };
  // Al navegar, el menú del móvil se cierra.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <Ctx.Provider value={{ menuOpen, setMenuOpen, dark }}>
      <div className={`wk ${dark ? "is-dark" : ""}`}>
        <header className="wk-top">
          {!enInicio && (
            <button type="button" className="wk-menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <Enlace className="wk-brand wk-cond" href="/wiki">Wiki <small>CrewHUB+</small></Enlace>
          {!enInicio && <Buscador />}
          <div className="wk-top-end">
            <button type="button" className="wk-theme" onClick={cambiarTema} aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"} title={dark ? "Tema claro" : "Tema oscuro"}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Enlace className="wk-back" href="/" aria-label="Volver a CrewHUB+">
              <ArrowLeft size={15} /><span>Volver a CrewHUB+</span>
            </Enlace>
          </div>
        </header>
        {children}
      </div>
    </Ctx.Provider>
  );
}
