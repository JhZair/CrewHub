"use client";
import { agregarCredencial, editarCredencial, borrarCredencial } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATAFORMAS = [
  "SUNAT-ClaveSOL", "DAFO-Estímulos", "e-Mail", "Facebook", "Instagram",
  "TikTok", "YouTube", "Vimeo", "WhatsApp Business", "Banco", "Hosting/Web",
];
const UBICACIONES = ["KeePass (Drive)", "Bitwarden", "Custodia física", "Otro"];
const METODOS = ["Correo y contraseña", "Con Google", "Con Facebook", "Con Apple", "Con Microsoft"];

const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none" } as const;

type Val = { plataforma: string; identificador: string; ubicacion: string; notas: string; metodo: string };

/* Formulario reutilizable (agregar y editar) — a nivel de módulo para que
   los inputs no pierdan el foco al escribir. */
function FormFila({ v, set, onSave, onCancel, guardando }: {
  v: Val; set: (x: Val) => void; onSave: () => void; onCancel: () => void; guardando: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
      <input list="plat-lista" placeholder="Plataforma *" value={v.plataforma}
        onChange={e => set({ ...v, plataforma: e.target.value })} style={{ ...inp, width: 160 }} />
      <datalist id="plat-lista">{PLATAFORMAS.map(p => <option key={p} value={p} />)}</datalist>
      <input placeholder="Usuario / RUC / correo (no la clave)" value={v.identificador}
        onChange={e => set({ ...v, identificador: e.target.value })} style={{ ...inp, flex: 1, minWidth: 180 }} />
      <select value={v.metodo} onChange={e => set({ ...v, metodo: e.target.value })} title="Cómo se inicia sesión" style={inp}>
        {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={v.ubicacion} onChange={e => set({ ...v, ubicacion: e.target.value })} style={inp}>
        {UBICACIONES.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
      <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!v.plataforma.trim() || guardando} onClick={onSave}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

export default function Credenciales({ dueno, duenoId, credenciales }: {
  dueno: "empresa" | "persona"; duenoId: string; credenciales: any[];
}) {
  const vacio: Val = { plataforma: "", identificador: "", ubicacion: UBICACIONES[0], notas: "", metodo: METODOS[0] };
  const [agregando, setAgregando] = useState(false);
  const [f, setF] = useState<Val>(vacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [ef, setEf] = useState<Val>(vacio);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (!f.plataforma.trim() || guardando) return;
    setGuardando(true); setError("");
    const res = await agregarCredencial(dueno, duenoId, f.plataforma, f.identificador, f.ubicacion, f.notas, f.metodo);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setF(vacio); setAgregando(false); router.refresh();
  };

  const abrirEdicion = (c: any) => {
    setEditando(c.id); setError("");
    setEf({
      plataforma: c.plataforma || "", identificador: c.identificador || "",
      ubicacion: c.ubicacion || UBICACIONES[0], notas: c.notas || "",
      metodo: c.metodo_acceso || METODOS[0],
    });
  };
  const guardarEdicion = async (id: string) => {
    if (!ef.plataforma.trim() || guardando) return;
    setGuardando(true); setError("");
    const res = await editarCredencial(id, dueno, duenoId, ef.plataforma, ef.identificador, ef.ubicacion, ef.notas, ef.metodo);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setEditando(null); router.refresh();
  };

  const borrar = async (id: string) => {
    const res = await borrarCredencial(id, dueno, duenoId);
    setBorrando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🔑 Credenciales · {credenciales.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Registrar</button>}
      </div>
      <p style={{ color: "var(--dim)", fontSize: 11, marginBottom: 10 }}>
        Aquí solo el inventario: plataforma, usuario y dónde vive la clave. La contraseña real va en el gestor cifrado — nunca aquí.
      </p>

      {error && <div className="err-inline">⚠ {error}</div>}
      {agregando && <FormFila v={f} set={setF} onSave={guardar} onCancel={() => setAgregando(false)} guardando={guardando} />}

      {credenciales.map(c => (
        editando === c.id ? (
          <FormFila key={c.id} v={ef} set={setEf} onSave={() => guardarEdicion(c.id)} onCancel={() => setEditando(null)} guardando={guardando} />
        ) : (
          <div key={c.id} className="eq-row" style={{ alignItems: "center" }}>
            <span className="cargo" style={{ minWidth: 130 }}>{c.plataforma}</span>
            <span style={{ flex: 1, color: "#c6c6da" }}>{c.identificador || "—"}</span>
            {c.metodo_acceso && (
              <span className="badge" style={{
                fontSize: 10.5,
                color: c.metodo_acceso === "Correo y contraseña" ? "var(--muted)" : "var(--violet)",
                background: c.metodo_acceso === "Correo y contraseña" ? "#1c1c2c" : "rgba(167,139,250,.12)",
              }}>
                {c.metodo_acceso === "Correo y contraseña" ? "🔑" : "🔗"} {c.metodo_acceso}
              </span>
            )}
            <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.1)" }}>
              🔒 {c.ubicacion || "sin ubicar"}
            </span>
            {c.actualizado_en && <span style={{ color: "var(--dim)", fontSize: 11 }}>{c.actualizado_en}</span>}
            <button title="Editar" style={{ color: "var(--dim)", marginLeft: 6 }} onClick={() => abrirEdicion(c)}>✎</button>
            {borrando === c.id ? (
              <span style={{ fontSize: 11.5, marginLeft: 6, whiteSpace: "nowrap" }}>
                ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => borrar(c.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
              </span>
            ) : (
              <button title="Quitar registro (la clave en el gestor no se toca)" style={{ color: "var(--dim)", marginLeft: 4 }}
                onClick={() => setBorrando(c.id)}>✕</button>
            )}
          </div>
        )
      ))}
      {!credenciales.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>Sin credenciales registradas.</div>
      )}
    </div>
  );
}
