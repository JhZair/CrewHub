"use client";
import { crearPublicacion } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TIPOS = [
  ["aviso", "📢 Aviso"], ["tarea", "✅ Tarea"], ["problema", "❗ Problema"],
  ["pago", "💰 Pago"], ["idea", "💡 Idea"], ["archivo", "📎 Archivo"],
];

export default function Composer({ userId }: { userId: string }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [tipo, setTipo] = useState("aviso");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  const publicar = async () => {
    if (!titulo.trim() || enviando) return;
    setEnviando(true);
    const res = await crearPublicacion(tipo, titulo.trim(), cuerpo.trim());
    setEnviando(false);
    if (res?.error) { alert("Error al publicar: " + res.error); return; }
    setTitulo(""); setCuerpo("");
    router.refresh();
  };

  return (
    <div className="composer">
      <input
        placeholder="¿Qué quieres compartir con tu equipo?"
        value={titulo}
        onChange={e => setTitulo(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !cuerpo) publicar(); }}
      />
      {titulo && (
        <textarea
          placeholder="Descripción (opcional)"
          rows={3}
          value={cuerpo}
          onChange={e => setCuerpo(e.target.value)}
        />
      )}
      <div className="tipos">
        {TIPOS.map(([v, l]) => (
          <button key={v} className={`tipo-chip ${tipo === v ? "sel" : ""}`} onClick={() => setTipo(v)}>
            {l}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={!titulo.trim() || enviando} onClick={publicar}>
          {enviando ? "Publicando..." : "Publicar"}
        </button>
      </div>
    </div>
  );
}
