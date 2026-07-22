"use client";
import { moverObjeto } from "@/app/actions";
import { EntPicker } from "@/components/Composer";
import { ICO_ENT, SECCIONES } from "@/lib/secciones";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* CAMBIARLE EL DUEÑO A UN OBJETO, desde su propia página.

   Quien sube el material no siempre es de quien trata: la entrevista al
   maestro Faure la trajo Wilfredo, pero pertenece a Faure. Sin esto, la única
   salida era borrar y volver a crear, perdiendo historial y comentarios. */
export default function MoverObjeto({ objetoId, catalogos, etiquetas }: {
  objetoId: string;
  catalogos: Record<string, { id: string; nombre: string }[]>;
  etiquetas: Record<string, string>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const mover = async (tipo: string, id: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await moverObjeto(objetoId, tipo, id);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setAbierto(false); router.refresh();
  };

  if (!abierto) {
    return (
      <button className="btn btn-ghost" style={{ padding: "2px 9px", fontSize: 11 }}
        onClick={() => setAbierto(true)} title="Este objeto es de otra ficha">
        cambiar
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {error && <span className="err-inline" style={{ margin: 0 }}>⚠ {error}</span>}
      {SECCIONES.filter(s => catalogos[s.tipo]?.length).map(s => (
        <EntPicker key={s.tipo} etiqueta={`${ICO_ENT[s.tipo] || "🔗"} ${etiquetas[s.tipo] || s.tipo}`}
          items={catalogos[s.tipo]} onPick={id => mover(s.tipo, id)} />
      ))}
      <button className="btn btn-ghost" style={{ padding: "2px 9px", fontSize: 11 }}
        onClick={() => { setAbierto(false); setError(""); }}>cancelar</button>
    </span>
  );
}
