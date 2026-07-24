"use client";
import { useState } from "react";

/* Respaldo por si nadie cargó la plataforma en el admin. La fuente de verdad
   es la fila con clave `sunat_consulta_ruc` en `plataformas` (se administra
   en /admin?s=plataformas y llega por prop). Si SUNAT cambia su URL —lo ha
   hecho— se corrige ahí sin tocar código ni esperar un deploy. */
const SUNAT_FALLBACK = "https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp";

/* Ver la ficha en SUNAT. Su buscador exige POST + captcha, así que no se
   puede enlazar el número directo: lo copiamos al portapapeles y abrimos
   la página para que solo quede pegar (Ctrl+V).
   Con DNI se consulta desde la pestaña "Por Documento". */
export default function BotonFichaSunat({ numero, tipo = "RUC", compacto, nota, url }: {
  numero: string; tipo?: "RUC" | "DNI";
  compacto?: boolean;   // versión chip, para las filas de una lista
  nota?: string;        // aclaración en el tooltip (ej. "se calcula del DNI")
  url?: string;         // de `plataformas`; si falta, el respaldo de arriba
}) {
  const SUNAT_URL = url || SUNAT_FALLBACK;
  const [copiado, setCopiado] = useState(false);
  const esDni = tipo === "DNI";

  /* Se detiene el evento aquí dentro, no en quien lo usa: este botón vive
     en listas cuyas filas son un <Link> entero, y sin esto el clic burbujea
     y te lleva a la ficha en vez de copiar el RUC. Al ser componente de
     cliente puede defenderse solo — quien lo pone no tiene que acordarse,
     ni podría si la página es de servidor. */
  const ir = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try { await navigator.clipboard.writeText(numero); setCopiado(true); } catch {}
    window.open(SUNAT_URL, "_blank", "noopener,noreferrer");
    setTimeout(() => setCopiado(false), 5000);
  };

  const ayuda = (esDni
    ? "Copia el DNI y abre SUNAT: elige la pestaña «Por Documento» y pega"
    : "Copia el RUC y abre el buscador de SUNAT (solo pega con Ctrl+V)")
    + (nota ? ` · ${nota}` : "");

  /* Chip para listas: el número a la vista y un clic que lo copia y abre
     SUNAT. `fila-encima` lo levanta sobre la capa clickable de la fila, si
     la hay: sin eso, el clic se lo comería el enlace de la tarjeta. */
  if (compacto) {
    return (
      <button onClick={ir} title={ayuda} className="badge fila-encima"
        style={{
          // El RUC en reposo va tenue: es dato de referencia, no una alerta.
          // Al copiar sí se enciende (verde) porque ahí pasó algo.
          color: copiado ? "var(--green)" : "rgba(45,212,191,.7)",
          background: copiado ? "rgba(46,204,113,.14)" : "rgba(45,212,191,.07)",
          textTransform: "none", letterSpacing: 0, cursor: "pointer", border: "none",
        }}>
        🏛 {tipo} {numero} {copiado ? "· copiado, pega en SUNAT" : "↗"}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-ghost" onClick={ir} title={ayuda}
        style={{ fontSize: 12, padding: "7px 12px" }}>
        🏛 Ficha RUC (SUNAT) ↗
      </button>
      {copiado && (
        <span style={{ color: "var(--green)", fontSize: 11.5 }}>
          {esDni ? "DNI copiado — usa «Por Documento» y pega" : "RUC copiado — pégalo con Ctrl+V"}
        </span>
      )}
    </span>
  );
}
