"use client";
import { useState } from "react";

const SUNAT_URL = "https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp";

/* Ver la ficha en SUNAT. Su buscador exige POST + captcha, así que no se
   puede enlazar el número directo: lo copiamos al portapapeles y abrimos
   la página para que solo quede pegar (Ctrl+V).
   Con DNI se consulta desde la pestaña "Por Documento". */
export default function BotonFichaSunat({ numero, tipo = "RUC" }: {
  numero: string; tipo?: "RUC" | "DNI";
}) {
  const [copiado, setCopiado] = useState(false);
  const esDni = tipo === "DNI";

  const ir = async () => {
    try { await navigator.clipboard.writeText(numero); setCopiado(true); } catch {}
    window.open(SUNAT_URL, "_blank", "noopener,noreferrer");
    setTimeout(() => setCopiado(false), 5000);
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-ghost" onClick={ir}
        title={esDni
          ? "Copia el DNI y abre SUNAT: elige la pestaña «Por Documento» y pega"
          : "Copia el RUC y abre el buscador de SUNAT (solo pega con Ctrl+V)"}
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
