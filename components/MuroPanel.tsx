"use client";
import { useCallback, useEffect, useState } from "react";
import { muroMensajes, publicarMuro, borrarMuro, toggleVistoMuro } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { hace } from "@/lib/notificaciones";

/* MURO — mensajes efímeros de oficina, embebido como sección DENTRO del banco de
   trabajo (un solo panel lateral). "prendí el hervidor", "almuerzo listo". Se ven
   los de HOY, se limpian solos, con 👀 de un toque como acuse. En vivo. */

const corto = (s?: string) => (s || "").trim().split(/\s+/)[0] || "Alguien";

export default function MuroPanel() {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [yo, setYo] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => { try { setAbierto(localStorage.getItem("muro-sec") !== "cerrado"); } catch {} }, []);
  const alternar = () => {
    const n = !abierto; setAbierto(n);
    try { localStorage.setItem("muro-sec", n ? "abierto" : "cerrado"); } catch {}
  };

  const cargar = useCallback(async () => {
    const r: any = await muroMensajes();
    if (r) { setMsgs(r.mensajes || []); setYo(r.yo || null); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // En vivo: canal único por montaje.
  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    const canal = supabase.channel(`muro-${Math.random().toString(36).slice(2)}`);
    canal.on("postgres_changes", { event: "*", schema: "public", table: "muro_mensajes" }, () => { if (vivo) cargar(); });
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      canal.subscribe();
    })();
    return () => { vivo = false; supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publicar = async () => {
    const t = txt.trim();
    if (!t || ocupado) return;
    setOcupado(true); setTxt("");
    const r: any = await publicarMuro(t);
    setOcupado(false);
    if (r?.error) { alert(r.error); setTxt(t); return; }
    cargar();
  };

  const like = async (m: any) => {
    if (!yo) return;
    setMsgs(prev => prev.map(x => x.id === m.id
      ? { ...x, vistos: (x.vistos || []).includes(yo) ? x.vistos.filter((v: string) => v !== yo) : [...(x.vistos || []), yo] }
      : x));
    const r: any = await toggleVistoMuro(m.id);
    if (r?.error) cargar();
  };

  const borrar = async (m: any) => {
    setMsgs(prev => prev.filter(x => x.id !== m.id));
    const r: any = await borrarMuro(m.id);
    if (r?.error) { alert(r.error); cargar(); }
  };

  return (
    <div className="muro-sec">
      <button className="muro-sec-h" onClick={alternar}>
        <span>{abierto ? "▾" : "▸"}</span>
        <span style={{ flex: 1, textAlign: "left" }}>🧱 Muro · hoy</span>
        {msgs.length > 0 && <b>{msgs.length}</b>}
      </button>

      {abierto && (
        <>
          <div className="muro-compose">
            <input value={txt} placeholder="Aviso del momento…" maxLength={280}
              onChange={e => setTxt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); publicar(); } }} />
            <button className="btn" style={{ padding: "4px 9px", fontSize: 12 }} disabled={!txt.trim() || ocupado} onClick={publicar}>➤</button>
          </div>

          <div className="muro-lista">
            {msgs.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 11, textAlign: "center", padding: "10px 8px" }}>
                Nada por ahora. Deja el primer aviso 🫧
              </div>
            )}
            {msgs.map(m => {
              const n = (m.vistos || []).length;
              const mio = yo && (m.vistos || []).includes(yo);
              return (
                <div key={m.id} className="muro-msg">
                  <div className="muro-msg-txt">{m.texto}</div>
                  <div className="muro-msg-meta">
                    <span><b style={{ color: "var(--muted)" }}>{corto(m.autor?.nombre)}</b> · {hace(m.creado_en)}</span>
                    <button className={`muro-like ${mio ? "on" : ""}`} onClick={() => like(m)} title="Lo vi">
                      👀{n > 0 ? ` ${n}` : ""}
                    </button>
                    {yo === m.autor_id && (
                      <button className="muro-del" onClick={() => borrar(m)} title="Borrar">✕</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
