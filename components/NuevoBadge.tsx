"use client";
import { useEffect, useState } from "react";
import { esNuevo } from "@/lib/novedad";

/* El famoso NUEVO: marca lo publicado después de tu última visita.
   La marca vive en el navegador de cada quien —lo nuevo para Katy no es lo
   nuevo para John— y se comparte con el auto-ocultado de resueltos (lib/novedad). */
export default function NuevoBadge({ creadoEn }: { creadoEn: string }) {
  const [nuevo, setNuevo] = useState(false);
  useEffect(() => { setNuevo(esNuevo(creadoEn)); }, [creadoEn]);
  if (!nuevo) return null;
  return <span className="badge-nuevo">✨ NUEVO</span>;
}
