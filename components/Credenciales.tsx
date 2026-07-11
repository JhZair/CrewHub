"use client";
import { agregarCredencial, borrarCredencial } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATAFORMAS = [
  "SUNAT-ClaveSOL", "DAFO-Estímulos", "e-Mail", "Facebook", "Instagram",
  "TikTok", "YouTube", "Vimeo", "WhatsApp Business", "Banco", "Hosting/Web",
];
const UBICACIONES = ["KeePass (Drive)", "Bitwarden", "Custodia física", "Otro"];

export default function Credenciales({ dueno, duenoId, credenciales }: {
  dueno: "empresa" | "persona"; duenoId: string; credenciales: any[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [f, setF] = useState({ plataforma: "", identificador: "", ubicacion: UBICACIONES[0], notas: "" });
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (!f.plataforma.trim() || guardando) return;
    setGuardando(true); setError("");
    const res = await agregarCredencial(dueno, duenoId, f.plataforma, f.identificador, f.ubicacion, f.notas);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setF({ plataforma: "", identificador: "", ubicacion: UBICACIONES[0], notas: "" });
    setAgregando(false);
    router.refresh();
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
      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <input list="plat-lista" placeholder="Plataforma *" value={f.plataforma}
            onChange={e => setF({ ...f, plataforma: e.target.value })}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", width: 160 }} />
          <datalist id="plat-lista">{PLATAFORMAS.map(p => <option key={p} value={p} />)}</datalist>
          <input placeholder="Usuario / RUC / correo (no la clave)" value={f.identificador}
            onChange={e => setF({ ...f, identificador: e.target.value })}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", flex: 1, minWidth: 180 }} />
          <select value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none" }}>
            {UBICACIONES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
            disabled={!f.plataforma.trim() || guardando} onClick={guardar}>
            {guardando ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => setAgregando(false)}>Cancelar</button>
        </div>
      )}

      {credenciales.map(c => (
        <div key={c.id} className="eq-row" style={{ alignItems: "center" }}>
          <span className="cargo" style={{ minWidth: 130 }}>{c.plataforma}</span>
          <span style={{ flex: 1, color: "#c6c6da" }}>{c.identificador || "—"}</span>
          <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.1)" }}>
            🔒 {c.ubicacion || "sin ubicar"}
          </span>
          {c.actualizado_en && <span style={{ color: "var(--dim)", fontSize: 11 }}>{c.actualizado_en}</span>}
          {borrando === c.id ? (
            <span style={{ fontSize: 11.5, marginLeft: 6, whiteSpace: "nowrap" }}>
              ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => borrar(c.id)}>sí</button>
              {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
            </span>
          ) : (
            <button title="Quitar registro (la clave en el gestor no se toca)" style={{ color: "var(--dim)", marginLeft: 6 }}
              onClick={() => setBorrando(c.id)}>✕</button>
          )}
        </div>
      ))}
      {!credenciales.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>Sin credenciales registradas.</div>
      )}
    </div>
  );
}
