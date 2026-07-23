"use client";
import { comentar, cambiarEstado, asignarResponsable, cambiarFechaLimite, archivar } from "@/app/actions";
import { celebrarResuelto } from "@/lib/celebra";
import { opcionesEstado } from "@/lib/estados";
import { sinBot } from "@/lib/personas";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { menciones, MencionesMenu } from "@/components/Menciones";
import BarraFormato from "@/components/BarraFormato";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

/* ARCHIVAR / DESPERTAR — la puerta de vuelta.
   Archivar era un estado de una sola dirección: al archivar borrabas cómo
   terminó el caso y no había forma fácil de traerlo de vuelta. Ahora es un
   interruptor sobre `archivado_en`, y el caso conserva su estado. Se muestra
   solo si el caso ya está CERRADO —no se archiva algo vivo, se cierra
   primero— salvo que ya esté archivado, donde lo único que ofrece es
   despertar. La memoria se guarda y se recupera; no se pierde al guardarla. */
export function BotonArchivar({ pubId, archivado, cerrado }:
  { pubId: string; archivado: boolean; cerrado: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  if (!archivado && !cerrado) return null;   // un caso vivo no se archiva: se cierra
  const hacer = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await archivar(pubId, !archivado);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="btn-ghost" onClick={hacer} disabled={ocupado}
        style={{ fontSize: 12.5, padding: "6px 12px" }}
        title={archivado
          ? "Traerlo de vuelta al feed y al tablero"
          : "Guardarlo fuera de la vista. Sigue en la memoria y en el buscador."}>
        {ocupado ? "…" : archivado ? "↩ Despertar" : "🗄 Archivar"}
      </button>
      {error && <span style={{ color: "var(--red)", fontSize: 12 }}>⚠ {error}</span>}
    </span>
  );
}

export function RespSelect({ pubId, actual, perfiles }:
  { pubId: string; actual: string | null; perfiles: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const cambiar = async (v: string) => {
    const res = await asignarResponsable(pubId, v || null);
    if (res?.error) alert(res.error); else router.refresh();
  };
  /* `sinBot`: este combo ofrecía a Bot Qhaway como responsable y el de los
     sub-casos no — el mismo sistema, dos respuestas a «¿se le puede asignar
     un caso al bot?». No: «él reparte, no carga casos» (lo dice /pulso). */
  return (
    <select defaultValue={actual || ""} onChange={e => cambiar(e.target.value)}>
      <option value="">Sin asignar</option>
      {sinBot(perfiles).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
}

export function FechaSelect({ pubId, fecha }: { pubId: string; fecha: string | null }) {
  const router = useRouter();
  const cambiar = async (v: string) => {
    const res = await cambiarFechaLimite(pubId, v);
    if (res?.error) alert(res.error); else router.refresh();
  };
  return (
    <input type="date" defaultValue={fecha || ""} onChange={e => cambiar(e.target.value)} />
  );
}

/* Un aviso no se "resuelve": se difunde, la gente se entera y se archiva.
   Este combo fue el ÚNICO sitio del sistema que dijo «📢 Vigente»; el resto
   lo rotulaba «Sin Resolver» en rojo. Ni los textos ni las opciones se
   escriben ya aquí —salen de lib/estados— justamente para que no vuelva a
   pasar que una pantalla sepa algo que las otras cinco no. */
export function EstadoSelect({ pubId, estado, tipo }: { pubId: string; estado: string; tipo?: string }) {
  const router = useRouter();
  const cambiar = async (nuevo: string) => {
    // El trigger de la base registra el evento en `actividad` automáticamente
    const res = await cambiarEstado(pubId, nuevo);
    if (res?.error) alert(res.error);
    else { if (nuevo === "resuelta" && estado !== "resuelta") celebrarResuelto(); router.refresh(); }
  };
  return (
    <select defaultValue={estado} onChange={e => cambiar(e.target.value)}>
      {opcionesEstado(tipo, estado).map(([v, txt]) => <option key={v} value={v}>{txt}</option>)}
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Auto-crecer con el texto (hasta 160px; luego hace scroll)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [txt]);

  // 🪄 Autocompletado de menciones (components/Menciones: lo comparte con la
  // caja de comentarios del repositorio).
  const { enMencion, candidatos, aplicar } = menciones(txt, perfiles);
  const invocar = (nombre: string) => setTxt(aplicar(nombre));

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
      <BarraFormato areaRef={taRef} valor={txt} setValor={setTxt} />
      <div className="cbox" style={{ position: "relative" }}>
        <MencionesMenu candidatos={candidatos} onElegir={invocar} />
        <textarea
          ref={taRef}
          placeholder="Escribe un comentario… (Enter envía · Shift+Enter salto de línea) · @nombre para invocar"
          value={txt}
          rows={1}
          onChange={e => setTxt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (candidatos.length && enMencion) { e.preventDefault(); invocar(candidatos[0].nombre); return; }
              e.preventDefault(); enviar();
            }
            // Shift+Enter: salto de línea (comportamiento por defecto del textarea)
          }}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
          style={{ resize: "none", fontFamily: "inherit", lineHeight: 1.55, maxHeight: 240, overflowY: "auto" }}
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
