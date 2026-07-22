"use client";
import { conversarObjeto } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Abre un CASO DE TRABAJO sobre el objeto: conseguir los derechos del libro,
   pedirle permiso al autor, encargar una copia. Un caso trae estado,
   responsable y plazo — es una unidad de trabajo, y alguien tiene que
   cerrarlo.

   Al principio este botón decía «💬 Comentar» y era el único modo de hablar de
   un objeto. Salió mal: opinar sobre un libro no es trabajo, así que cada
   conversación dejaba un caso «Sin Resolver» eterno en el tablero. Para
   conversar están los comentarios del objeto, justo arriba. El texto del botón
   es la mitad del arreglo: si dice «comentar», se va a usar para comentar. */
export default function ConversarObjeto({ objetoId }: { objetoId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  const abrir = async () => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await conversarObjeto(objetoId);
    if (r?.error) { setOcupado(false); alert(r.error); return; }
    // Arriba, no en #comentarios: lo primero que hay que hacer con un caso de
    // trabajo es ponerle responsable y plazo, no escribir.
    router.push(`/caso/${r.id}`);
  };

  return (
    <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
      disabled={ocupado} onClick={abrir}
      title="Para trabajo con responsable y plazo (conseguir derechos, pedir permiso). Para conversar, usa los comentarios de arriba.">
      {ocupado ? "..." : "＋ Caso de trabajo"}
    </button>
  );
}
