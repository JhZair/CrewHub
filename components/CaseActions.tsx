"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EstadoSelect({ pubId, estado }: { pubId: string; estado: string }) {
  const router = useRouter();
  const cambiar = async (nuevo: string) => {
    const supabase = createClient();
    // El trigger de la base registra el evento en `actividad` automáticamente
    const { error } = await supabase.from("publicaciones").update({ estado: nuevo }).eq("id", pubId);
    if (error) alert(error.message); else router.refresh();
  };
  return (
    <select defaultValue={estado} onChange={e => cambiar(e.target.value)}>
      <option value="abierta">Sin Resolver</option>
      <option value="en_progreso">En Progreso</option>
      <option value="resuelta">Resuelta</option>
      <option value="archivada">Archivada</option>
    </select>
  );
}

export function CommentBox({ pubId, userId }: { pubId: string; userId: string }) {
  const [txt, setTxt] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  const enviar = async () => {
    if (!txt.trim() || enviando) return;
    setEnviando(true);
    const supabase = createClient();
    const { data: com, error } = await supabase
      .from("comentarios")
      .insert({ publicacion_id: pubId, autor_id: userId, cuerpo: txt.trim() })
      .select("id").single();
    if (!error && com) {
      await supabase.from("actividad").insert({
        entidad_tipo: "publicacion", entidad_id: pubId, actor_id: userId,
        tipo: "comentario", detalle: { comentario_id: com.id },
      });
    }
    setEnviando(false);
    if (error) { alert(error.message); return; }
    setTxt("");
    router.refresh();
  };

  return (
    <div className="cbox">
      <input
        placeholder="Escribe un comentario..."
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") enviar(); }}
      />
      <button className="btn" disabled={!txt.trim() || enviando} onClick={enviar}>➤</button>
    </div>
  );
}
