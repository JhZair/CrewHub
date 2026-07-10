"use client";
import { comentar, cambiarEstado, asignarResponsable } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RespSelect({ pubId, actual, perfiles }:
  { pubId: string; actual: string | null; perfiles: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const cambiar = async (v: string) => {
    const res = await asignarResponsable(pubId, v || null);
    if (res?.error) alert(res.error); else router.refresh();
  };
  return (
    <select defaultValue={actual || ""} onChange={e => cambiar(e.target.value)}>
      <option value="">Sin asignar</option>
      {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
}

export function EstadoSelect({ pubId, estado }: { pubId: string; estado: string }) {
  const router = useRouter();
  const cambiar = async (nuevo: string) => {
    // El trigger de la base registra el evento en `actividad` automáticamente
    const res = await cambiarEstado(pubId, nuevo);
    if (res?.error) alert(res.error); else router.refresh();
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
    const res = await comentar(pubId, txt.trim());
    setEnviando(false);
    if (res?.error) { alert(res.error); return; }
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
