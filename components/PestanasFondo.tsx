"use client";
import { usePathname } from "next/navigation";
import Link from "@/components/Enlace";

/* ── LAS PESTAÑAS DEL FONDO, AHORA COMO ENLACES ──
 *
 * Eran pestañas de cliente: los seis paneles se renderizaban enteros y se
 * ocultaban con `display:none`. Eso conservaba el filtro y el scroll al ir y
 * volver —una buena razón, escrita en TabsPanel— pero costaba que entrar a
 * mirar una cosa ejecutara las consultas de las seis.
 *
 * Ahora cada pestaña es una ruta de verdad y esto es solo la barra. Es de
 * cliente porque necesita saber cuál está encendida, y eso solo lo sabe el
 * navegador (`usePathname`) — el mismo motivo por el que `BarraEmpresas` lo es.
 *
 * Los contadores y los avisos llegan calculados desde el servidor: se hacen en
 * el layout con las mismas funciones que pintan cada pestaña, para que la
 * etiqueta y el contenido no puedan decir cosas distintas.
 */

export type Aviso = { n: number; txt: string; tono?: "rojo" | "ambar" };

export type Pestana = {
  href: string;
  label: string;
  /** El número que va en la etiqueta. `null` = no se sabe (una migración sin
   *  correr), y entonces no se pinta: un cero se leería como «no hay ninguno». */
  n?: number | null;
  avisos?: Aviso[] | null;
};

export default function PestanasFondo({ items }: { items: Pestana[] }) {
  const pathname = usePathname();
  return (
    <div className="vtabs-nav" role="tablist">
      {items.map(t => {
        /* La primera pestaña vive en la raíz del fondo, así que su `href` es
           prefijo de todos los demás: comparar con `startsWith` la dejaría
           encendida siempre. Se compara exacto. */
        const on = pathname === t.href;
        return (
          <Link key={t.href} href={t.href}
            className={`vtab${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined}>
            {t.label}
            {typeof t.n === "number" && <span className="vtab-n">{t.n}</span>}
            {(t.avisos || []).map((a, i) => (
              <span key={i}
                className={`b-alerta${a.tono === "ambar" ? " tono-ambar" : ""}`}
                title={a.txt} aria-label={a.txt}>{a.n}</span>
            ))}
          </Link>
        );
      })}
    </div>
  );
}
