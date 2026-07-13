"use client";
import { useEffect, useState } from "react";

/* El famoso NUEVO: marca lo publicado después de tu última visita.
   La marca vive en el navegador de cada quien — lo nuevo para Katy
   no es lo nuevo para John. Se renueva en cada carga completa. */
let visitaAnterior: number | null = null;
function ultimaVisita(): number {
  if (visitaAnterior == null) {
    const v = localStorage.getItem("cw_ultima_visita");
    visitaAnterior = v ? parseInt(v) : 0;
    localStorage.setItem("cw_ultima_visita", String(Date.now()));
  }
  return visitaAnterior;
}

export default function NuevoBadge({ creadoEn }: { creadoEn: string }) {
  const [nuevo, setNuevo] = useState(false);
  useEffect(() => {
    setNuevo(new Date(creadoEn).getTime() > ultimaVisita());
  }, [creadoEn]);
  if (!nuevo) return null;
  return <span className="badge-nuevo">✨ NUEVO</span>;
}
