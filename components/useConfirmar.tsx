"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/* Confirmación en la app, no del navegador. El `confirm()` nativo saca un
   cuadro gris feo que dice «localhost:3000 dice»; esto es un modal con el
   lenguaje visual de la ficha.
   Uso:
     const { pedir, dialogo } = useConfirmar();
     ...  if (!(await pedir("¿Borrar?", { peligro: true, aceptar: "Borrar" }))) return;
     ...  return (<>{dialogo}<div>…</div></>);
   `pedir` devuelve una promesa que resuelve true/false. */

type Opts = { titulo?: string; aceptar?: string; cancelar?: string; peligro?: boolean };
type Estado = { msg: ReactNode; opts: Opts; resolver: (v: boolean) => void };

export function useConfirmar() {
  const [e, setE] = useState<Estado | null>(null);

  const pedir = useCallback(
    (msg: ReactNode, opts: Opts = {}) =>
      new Promise<boolean>(res => setE({ msg, opts, resolver: res })),
    [],
  );

  // Escape cancela: es lo que la mano hace sin pensar.
  useEffect(() => {
    if (!e) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") { e.resolver(false); setE(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [e]);

  const cerrar = (v: boolean) => { e?.resolver(v); setE(null); };

  const dialogo = e ? (
    <div className="modal-fondo" style={{ zIndex: 400 }} onClick={() => cerrar(false)}>
      <div className="modal-caja" style={{ maxWidth: 400 }} onClick={ev => ev.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{e.opts.titulo || "Confirmar"}</div>
        <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>{e.msg}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: "7px 14px" }} onClick={() => cerrar(false)}>
            {e.opts.cancelar || "Cancelar"}
          </button>
          <button className="btn" autoFocus onClick={() => cerrar(true)}
            style={{ fontSize: 12.5, padding: "7px 14px", ...(e.opts.peligro ? { background: "var(--red)", color: "#fff" } : {}) }}>
            {e.opts.aceptar || "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { pedir, dialogo };
}

/* Aviso de error DENTRO de la caja, no el `alert()` gris del navegador. Se
   cierra con la ✕ o al llamar `avisar("")`. Igual de simple que un alert:
     const { avisar, aviso } = useAviso();
     ...  if (r?.error) { avisar(r.error); return; }
     ...  return (<div>{aviso} …</div>); */
export function useAviso() {
  const [msg, setMsg] = useState("");
  const avisar = useCallback((m: string) => setMsg(m || ""), []);
  const aviso = msg ? (
    <div className="err-inline" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span>⚠ {msg}</span>
      <button onClick={() => setMsg("")} title="Cerrar"
        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>✕</button>
    </div>
  ) : null;
  return { avisar, aviso };
}
