"use client";
import { comentar, cambiarEstado, asignarResponsable } from "@/app/actions";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
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
      <option value="seguimiento">🔭 Seguimiento (caso largo)</option>
      <option value="en_pausa">En Pausa</option>
      <option value="resuelta">Resuelta</option>
      <option value="archivada">Archivada</option>
    </select>
  );
}

export function CommentBox({ pubId, userId, perfiles = [] }: {
  pubId: string; userId: string; perfiles?: { id: string; nombre: string }[];
}) {
  const [txt, setTxt] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [imgs, setImgs] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const router = useRouter();

  // 🪄 Autocompletado de menciones: detecta el @token al final de lo escrito
  const nrmA = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const enMencion = txt.match(/@([^\s@]*)$/);
  const candidatos = enMencion
    ? perfiles.filter(p => nrmA(p.nombre).replace(/\s+/g, "").startsWith(nrmA(enMencion[1]))
        || nrmA(p.nombre).split(/\s+/).some(w => w.startsWith(nrmA(enMencion[1])))).slice(0, 5)
    : [];
  const invocar = (nombre: string) => {
    setTxt(txt.replace(/@[^\s@]*$/, "@" + nombre.replace(/\s+/g, "") + " "));
  };

  const subir = async (files: File[]) => {
    if (!files.length || subiendo) return;
    setSubiendo(true);
    for (const f of files.slice(0, 6 - imgs.length)) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
    setSubiendo(false);
  };

  const enviar = async () => {
    if ((!txt.trim() && !imgs.length) || enviando || subiendo) return;
    setEnviando(true);
    const res = await comentar(pubId, txt.trim() || "📷", imgs);
    setEnviando(false);
    if (res?.error) { alert(res.error); return; }
    setTxt(""); setImgs([]);
    router.refresh();
  };

  return (
    <div>
      {(imgs.length > 0 || subiendo) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {imgs.map((u, i) => (
            <span key={i} style={{ position: "relative" }}>
              <img src={u} alt="" style={{ height: 64, borderRadius: 8, border: "1px solid var(--border)" }} />
              <button onClick={() => setImgs(imgs.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: -6, right: -6, background: "var(--panel)", border: "1px solid var(--border2)", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "var(--red)", cursor: "pointer", lineHeight: 1 }}>×</button>
            </span>
          ))}
          {subiendo && <span style={{ color: "var(--dim)", fontSize: 12, alignSelf: "center" }}>subiendo…</span>}
        </div>
      )}
      <div className="cbox" style={{ position: "relative" }}>
        {candidatos.length > 0 && (
          <div className="menciones-menu">
            {candidatos.map(p => (
              <button key={p.id} onMouseDown={e => { e.preventDefault(); invocar(p.nombre); }}>
                🪄 {p.nombre}
              </button>
            ))}
          </div>
        )}
        <input
          placeholder="Escribe un comentario... @nombre para invocar a alguien"
          value={txt}
          onChange={e => setTxt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && candidatos.length && enMencion) { e.preventDefault(); invocar(candidatos[0].nombre); return; }
            if (e.key === "Enter") enviar();
          }}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
        />
        <label className="btn btn-ghost" title="Adjuntar imagen" style={{ cursor: "pointer" }}>
          📷
          <input type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
        <button className="btn" disabled={(!txt.trim() && !imgs.length) || enviando || subiendo} onClick={enviar}>➤</button>
      </div>
    </div>
  );
}
