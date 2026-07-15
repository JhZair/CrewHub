"use client";
import { useState } from "react";

const SUNAT_URL = "https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp";

/* Ver la ficha RUC oficial en SUNAT. Su buscador exige POST + captcha, así
   que no se puede enlazar el RUC directo: lo copiamos al portapapeles y
   abrimos la página para que solo quede pegar (Ctrl+V). */
export default function BotonFichaSunat({ ruc }: { ruc: string }) {
  const [copiado, setCopiado] = useState(false);

  const ir = async () => {
    try { await navigator.clipboard.writeText(ruc); setCopiado(true); } catch {}
    window.open(SUNAT_URL, "_blank", "noopener,noreferrer");
    setTimeout(() => setCopiado(false), 4000);
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-ghost" onClick={ir}
        title="Copia el RUC y abre el buscador de SUNAT (solo pega con Ctrl+V)"
        style={{ fontSize: 12, padding: "7px 12px" }}>
        🏛 Ficha en SUNAT ↗
      </button>
      {copiado && (
        <span style={{ color: "var(--green)", fontSize: 11.5 }}>
          RUC copiado — pégalo con Ctrl+V
        </span>
      )}
    </span>
  );
}
