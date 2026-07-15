"use client";
import { misEnProgreso, comentar, cambiarEstado } from "@/app/actions";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { celebrarResuelto } from "@/lib/celebra";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/* Banco de trabajo: lo que tengo EN PROGRESO, siempre a mano.
   Vive en el layout, así que sobrevive a la navegación: puedes moverte
   por el sistema y seguir cargando avances sin perder el caso de vista.
   Se vacía solo — al resolver un caso, sale. */

type Caso = { id: string; tipo: string; titulo: string; fecha_limite: string | null; nComs: number };

const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓",
  pago: "💰", idea: "💡", archivo: "📎", conversacion: "💬",
};

export default function BancoTrabajo() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [esTop, setEsTop] = useState(false);
  const [colapsado, setColapsado] = useState(true);
  const [casos, setCasos] = useState<Caso[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const enLogin = pathname.startsWith("/login");

  // Solo en la ventana principal (no en los paneles embebidos del Monitor)
  useEffect(() => { setEsTop(window.self === window.top); }, []);

  // Recuerda si lo dejaste abierto
  useEffect(() => {
    try { setColapsado(localStorage.getItem("banco") !== "abierto"); } catch {}
  }, []);
  const alternar = () => {
    const n = !colapsado;
    setColapsado(n);
    try { localStorage.setItem("banco", n ? "cerrado" : "abierto"); } catch {}
  };

  const cargar = useCallback(async () => {
    const r: any = await misEnProgreso();
    if (!r?.error) setCasos(r.casos || []);
  }, []);

  // Al montar y cada vez que cambias de página (pudo cambiar algo)
  useEffect(() => { if (esTop && !enLogin) cargar(); }, [esTop, enLogin, pathname, cargar]);

  // Auto-crecer el cuadro de comentario
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [txt, abierto]);

  const subir = async (files: File[]) => {
    if (!files.length || ocupado) return;
    setOcupado(true);
    for (const f of files.slice(0, 4 - imgs.length)) {
      const r = await subirImagen(f);
      if (r.error) break;
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
    setOcupado(false);
  };

  const enviar = async (id: string) => {
    if ((!txt.trim() && !imgs.length) || ocupado) return;
    setOcupado(true);
    const res: any = await comentar(id, txt.trim() || "📷", imgs);
    setOcupado(false);
    if (res?.error) { alert(res.error); return; }
    setTxt(""); setImgs([]);
    cargar(); router.refresh();
  };

  const resolver = async (id: string) => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await cambiarEstado(id, "resuelta");
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    celebrarResuelto();
    setAbierto(null);
    cargar(); router.refresh();
  };

  if (!esTop || enLogin) return null;

  // Colapsado: una pestaña discreta con el contador
  if (colapsado) {
    return (
      <button className="banco-tab" onClick={alternar}
        title={`${casos.length} caso(s) en progreso — tu banco de trabajo`}>
        🛠 {casos.length > 0 && <b>{casos.length}</b>}
      </button>
    );
  }

  return (
    <div className="banco">
      <div className="banco-h">
        <b style={{ fontSize: 12.5 }}>🛠 En progreso · {casos.length}</b>
        <span style={{ flex: 1 }} />
        <button onClick={cargar} title="Actualizar" style={{ color: "var(--dim)", fontSize: 12 }}>⟳</button>
        <button onClick={alternar} title="Colapsar" style={{ color: "var(--dim)", fontSize: 14, marginLeft: 6 }}>‹</button>
      </div>

      <div className="banco-body">
        {!casos.length && (
          <div style={{ color: "var(--dim)", fontSize: 11.5, padding: "14px 10px", textAlign: "center", lineHeight: 1.5 }}>
            Nada en progreso.<br />
            Pon un caso <b>En Progreso</b> y aparecerá aquí, listo para trabajar.
          </div>
        )}

        {casos.map(c => {
          const d = c.fecha_limite
            ? Math.ceil((new Date(c.fecha_limite + "T23:59:59").getTime() - Date.now()) / 86400000)
            : null;
          const activo = abierto === c.id;
          return (
            <div key={c.id} className={`banco-item${activo ? " on" : ""}`}>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}
                onClick={() => { setAbierto(activo ? null : c.id); setTxt(""); setImgs([]); }}>
                <span style={{ fontSize: 12 }}>{TIPO_ICO[c.tipo] || "💬"}</span>
                <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35, color: "var(--text)" }}>{c.titulo}</span>
                {d !== null && (
                  <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", color: d < 0 ? "var(--red)" : d <= 3 ? "var(--yellow)" : "var(--dim)" }}>
                    {d < 0 ? `${-d}d ⚠` : d === 0 ? "hoy" : `${d}d`}
                  </span>
                )}
              </div>

              {activo && (
                <div style={{ marginTop: 7 }}>
                  {imgs.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
                      {imgs.map((u, i) => (
                        <img key={i} src={u} alt="" style={{ height: 34, borderRadius: 5, border: "1px solid var(--border)" }} />
                      ))}
                    </div>
                  )}
                  <textarea ref={taRef} value={txt} rows={1} autoFocus
                    placeholder="Avance… (Enter envía · pega una imagen)"
                    onChange={e => setTxt(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(c.id); } }}
                    onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
                    style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", fontSize: 11.5, color: "var(--text)", outline: "none", resize: "none", lineHeight: 1.4, maxHeight: 120 }} />
                  <div style={{ display: "flex", gap: 5, marginTop: 5, alignItems: "center" }}>
                    <button className="btn" style={{ padding: "3px 9px", fontSize: 10.5 }}
                      disabled={(!txt.trim() && !imgs.length) || ocupado} onClick={() => enviar(c.id)}>➤</button>
                    <label className="btn btn-ghost" title="Adjuntar" style={{ padding: "3px 7px", fontSize: 10.5, cursor: "pointer" }}>
                      📷
                      <input type="file" accept="image/*" multiple style={{ display: "none" }}
                        onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
                    </label>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-ghost" title="Marcar como resuelta"
                      style={{ padding: "3px 8px", fontSize: 10.5, color: "var(--green)" }}
                      disabled={ocupado} onClick={() => resolver(c.id)}>✓ resolver</button>
                  </div>
                  <Link href={`/caso/${c.id}`}
                    style={{ display: "block", marginTop: 6, color: "var(--dim)", fontSize: 10.5, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                    abrir el caso →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
