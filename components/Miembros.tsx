"use client";
import { agregarMiembro, bajaMiembro } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const CARGOS = [
  "Representante Legal", "Titular-Gerente", "Gerente General",
  "Presidente/a", "Vicepresidente/a", "Secretario/a", "Tesorero/a",
  "Socio/a", "Accionista", "Asociado/a",
];

export default function Miembros({ empresaId, miembros, personas }: {
  empresaId: string;
  miembros: any[];
  personas: CatalogoItem[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [cargo, setCargo] = useState("Representante Legal");
  const [desde, setDesde] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (!sel || guardando) return;
    setGuardando(true); setError("");
    const res = await agregarMiembro(empresaId, sel.id, cargo, desde || null);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setSel(null); setCargo("Representante Legal"); setDesde(""); setAgregando(false);
    router.refresh();
  };

  const baja = async (id: string) => {
    const res = await bajaMiembro(id, empresaId);
    setBajando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  const activos = miembros.filter(m => m.estado === "activo");
  const inactivos = miembros.filter(m => m.estado !== "activo");

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          👥 Miembros y cargos · {activos.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Agregar</button>}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={personas}
            onPick={id => { const p = personas.find(x => x.id === id); if (p) setSel({ id: p.id, nombre: p.nombre }); }} />
          <input list="cargos-lista" value={cargo} onChange={e => setCargo(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", width: 190 }} />
          <datalist id="cargos-lista">{CARGOS.map(c => <option key={c} value={c} />)}</datalist>
          <input type="date" title="Desde (fecha real del cargo, ej. la de SUNAT)" value={desde}
            onChange={e => setDesde(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!sel || guardando} onClick={guardar}>
            {guardando ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setAgregando(false); setSel(null); }}>Cancelar</button>
        </div>
      )}

      {activos.map(m => (
        <div key={m.id} className="eq-row" style={{ alignItems: "center" }}>
          <span className="cargo">{m.cargo}</span>
          <span style={{ flex: 1, textAlign: "right" }}>
            <Link href={`/entidad/persona/${m.persona?.id}`} style={{ color: "var(--text)" }}>
              {m.persona?.nombre} →
            </Link>
            {m.fecha_inicio && <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8 }}>desde {m.fecha_inicio}</span>}
          </span>
          {bajando === m.id ? (
            <span style={{ fontSize: 11.5, marginLeft: 8, whiteSpace: "nowrap" }}>
              ¿dar de baja? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => baja(m.id)}>sí</button>
              {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBajando(null)}>no</button>
            </span>
          ) : (
            <button title="Dar de baja (se conserva en el historial)" style={{ color: "var(--dim)", marginLeft: 10 }}
              onClick={() => setBajando(m.id)}>✕</button>
          )}
        </div>
      ))}
      {!activos.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Sin cargos registrados — agrega al representante legal.
        </div>
      )}

      {inactivos.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ color: "var(--dim)", fontSize: 11.5, cursor: "pointer" }}>
            Historial de cargos anteriores ({inactivos.length})
          </summary>
          {inactivos.map(m => (
            <div key={m.id} className="eq-row" style={{ opacity: .55 }}>
              <span className="cargo">{m.cargo}</span>
              <span style={{ flex: 1, textAlign: "right" }}>
                {m.persona?.nombre}
                <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8 }}>
                  {m.fecha_inicio} → {m.fecha_fin || "—"}
                </span>
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
