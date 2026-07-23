"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarVersionFondo, marcarVersionVigente, borrarVersionFondo } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";

/* Historial de versiones del presupuesto o el cronograma de un fondo. Cada
   «foto» guardada tiene su etiqueta (Postulado / Reformulado / Prórroga) y su
   motivo. Una es la VIGENTE: la que manda para rendir y contra la que se
   compara lo ejecutado. Solo administración escribe. */

type Version = {
  id: string; etiqueta: string; motivo: string | null;
  vigente: boolean; creado_en: string; autor?: string | null;
};
const ETIQUETAS = ["Postulado", "Reformulado", "Prórroga", "Otro"];
const COLOR: Record<string, string> = {
  Postulado: "var(--dim)", Reformulado: "var(--teal)", "Prórroga": "var(--yellow)", Otro: "var(--muted)",
};
const fecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
};

export default function VersionesFondo({ postulacionId, tipo, esAdmin, versiones }: {
  postulacionId: string; tipo: "presupuesto" | "cronograma"; esAdmin: boolean; versiones: Version[];
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [abrir, setAbrir] = useState(false);
  const [etiqueta, setEtiqueta] = useState("Reformulado");
  const [motivo, setMotivo] = useState("");
  const [vig, setVig] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await guardarVersionFondo({ postulacionId, tipo, etiqueta, motivo, vigente: vig });
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    setMotivo(""); setAbrir(false); router.refresh();
  };

  const cual = tipo === "presupuesto" ? "presupuesto" : "cronograma";

  return (
    <div className="linked" style={{ marginBottom: 12 }}>
      {dialogo}{aviso}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>🗂 Versiones del {cual}</b>
        <span style={{ color: "var(--dim)", fontSize: 11 }}>{versiones.length || "sin"} versión(es)</span>
        <span style={{ flex: 1 }} />
        {esAdmin && !abrir && (
          <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
            onClick={() => setAbrir(true)}>📸 Guardar versión</button>
        )}
      </div>

      {/* Alta de una versión: congela el vivo con su etiqueta y motivo. */}
      {esAdmin && abrir && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select value={etiqueta} onChange={e => setEtiqueta(e.target.value)}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: "var(--text)" }}>
              {ETIQUETAS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo (ej. modificación aprobada, prórroga…)"
              style={{ flex: 1, minWidth: 180, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: "var(--text)" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={vig} onChange={e => setVig(e.target.checked)} /> vigente
            </label>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" disabled={ocupado} onClick={guardar} style={{ fontSize: 12, padding: "6px 14px" }}>
              {ocupado ? "…" : `Congelar el ${cual} actual`}
            </button>
            <button className="btn btn-ghost" onClick={() => setAbrir(false)} style={{ fontSize: 12, padding: "6px 12px" }}>Cancelar</button>
          </div>
        </div>
      )}

      {versiones.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {versiones.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              borderTop: "1px solid var(--border)", paddingTop: 5 }}>
              <span className="badge" style={{ color: COLOR[v.etiqueta] || "var(--muted)", background: "rgba(255,255,255,.05)", fontWeight: 700 }}>
                {v.etiqueta}
              </span>
              {v.vigente && (
                <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)", fontWeight: 700 }}>✓ vigente</span>
              )}
              <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 0 }}>{v.motivo || <i style={{ color: "var(--dim)" }}>sin motivo</i>}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--dim)", fontSize: 11 }}>{v.autor ? `${v.autor} · ` : ""}{fecha(v.creado_en)}</span>
              {esAdmin && !v.vigente && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }}
                  onClick={async () => {
                    const r: any = await marcarVersionVigente(v.id, postulacionId, tipo);
                    if (r?.error) avisar(r.error); else router.refresh();
                  }}>Hacer vigente</button>
              )}
              {esAdmin && (
                <button title="Borrar versión" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}
                  onClick={async () => {
                    if (!(await pedir(`¿Borrar la versión «${v.etiqueta}»?`, { peligro: true, aceptar: "Borrar" }))) return;
                    const r: any = await borrarVersionFondo(v.id, postulacionId);
                    if (r?.error) avisar(r.error); else router.refresh();
                  }}>✕</button>
              )}
            </div>
          ))}
          <p style={{ color: "var(--dim)", fontSize: 10.5, margin: "4px 0 0", lineHeight: 1.5 }}>
            La versión <b style={{ color: "var(--green)" }}>vigente</b> es contra la que se compara el {cual} vivo (abajo) y la que manda para rendir.
          </p>
        </div>
      )}
    </div>
  );
}
