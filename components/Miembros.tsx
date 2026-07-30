"use client";
import { agregarMiembro, bajaMiembro, editarFechaMiembro, editarCargoMiembro } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import MiniSelect from "@/components/MiniSelect";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const fmtF = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

/* Cuánto lleva en el cargo: años y meses cumplidos desde la fecha de inicio. */
const tiempoEnCargo = (f?: string | null): string | null => {
  if (!f) return null;
  const ini = new Date(f + "T12:00:00");
  if (isNaN(+ini)) return null;
  const hoy = new Date();
  let meses = (hoy.getFullYear() - ini.getFullYear()) * 12 + (hoy.getMonth() - ini.getMonth());
  if (hoy.getDate() < ini.getDate()) meses -= 1;
  if (meses < 0) return null;
  const a = Math.floor(meses / 12), m = meses % 12;
  if (a === 0 && m === 0) return "menos de 1 mes";
  const partes: string[] = [];
  if (a) partes.push(`${a} año${a === 1 ? "" : "s"}`);
  if (m) partes.push(`${m} mes${m === 1 ? "" : "es"}`);
  return partes.join(" ");
};

const CARGOS = [
  "Representante Legal", "Titular-Gerente", "Gerente General", "CEO",
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
  const [cargo, setCargo] = useState("");       // en limpio: obliga a elegir
  const [desde, setDesde] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const [editandoF, setEditandoF] = useState<string | null>(null);
  const [nuevaF, setNuevaF] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const OPC_CARGOS = CARGOS.map(c => [c, c]);

  const guardarCargo = async (id: string, nuevo: string) => {
    const res = await editarCargoMiembro(id, empresaId, nuevo);
    if (res?.error) setError(res.error); else router.refresh();
  };

  const guardarFecha = async (id: string) => {
    if (!nuevaF) { setEditandoF(null); return; }
    const res = await editarFechaMiembro(id, empresaId, nuevaF);
    setEditandoF(null); setNuevaF("");
    if (res?.error) setError(res.error); else router.refresh();
  };

  const guardar = async () => {
    if (!sel || guardando) return;
    setGuardando(true); setError("");
    const res = await agregarMiembro(empresaId, sel.id, cargo, desde || null);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setSel(null); setCargo(""); setDesde(""); setAgregando(false);
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
          {/* El catálogo trae "Nombre · Alias" para poder buscar por ambos,
              pero el chip muestra solo el nombre corto. */}
          <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={personas}
            onPick={id => {
              const p: any = personas.find(x => x.id === id);
              if (p) setSel({ id: p.id, nombre: p.alias || p.nombre });
            }} />
          <MiniSelect value={cargo} options={[["", "— elegir cargo —"], ...OPC_CARGOS]}
            onSelect={v => setCargo(v)}
            buttonStyle={{ background: "var(--card)", border: `1px solid ${cargo ? "var(--border)" : "var(--border2)"}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: cargo ? "var(--text)" : "var(--dim)", minWidth: 190, justifyContent: "space-between" }} />
          <input type="date" title="Desde (fecha real del cargo, ej. la de SUNAT)" value={desde}
            onChange={e => setDesde(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
            title={!sel ? "Elige la persona" : !cargo ? "Elige el cargo" : "Guardar"}
            disabled={!sel || !cargo || guardando} onClick={guardar}>
            {guardando ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setAgregando(false); setSel(null); setCargo(""); }}>Cancelar</button>
        </div>
      )}

      {activos.map(m => (
        <div key={m.id} className="eq-row" style={{ alignItems: "center" }}>
          {/* Foto de la persona: pone cara al cargo. */}
          <Avatar nombre={m.persona?.nombre} src={m.persona?.foto_url} size={40} />
          {/* El cargo es siempre un combo: un clic abre, elegir guarda.
              Sin modo edición aparte, no hay estado que se quede pegado. */}
          <MiniSelect value={m.cargo || ""} options={OPC_CARGOS}
            onSelect={v => guardarCargo(m.id, v)}
            buttonClass="cargo"
            buttonStyle={{ cursor: "pointer", border: "none" }} />
          <span style={{ flex: 1, textAlign: "right" }}>
            <Link href={`/entidad/persona/${m.persona?.id}`} style={{ color: "var(--text)" }}>
              {m.persona?.alias || m.persona?.nombre} →
            </Link>
            {editandoF === m.id ? (
              <span style={{ marginLeft: 8, whiteSpace: "nowrap" }}>
                <input type="date" value={nuevaF} autoFocus
                  onChange={e => setNuevaF(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", fontSize: 11, color: "var(--text)", outline: "none" }} />
                {" "}<button style={{ color: "var(--green)", fontWeight: 700, fontSize: 11.5 }} onClick={() => guardarFecha(m.id)}>✓</button>
                {" "}<button style={{ color: "var(--dim)", fontSize: 11.5 }} onClick={() => { setEditandoF(null); setNuevaF(""); }}>✕</button>
              </span>
            ) : (
              <>
                <button title="Corregir la fecha real del cargo (la de SUNAT)"
                  style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8, cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline dotted", textUnderlineOffset: 3 }}
                  onClick={() => { setEditandoF(m.id); setNuevaF(m.fecha_inicio || ""); }}>
                  {m.fecha_inicio ? `desde ${fmtF(m.fecha_inicio)}` : "¿desde cuándo?"}
                </button>
                {tiempoEnCargo(m.fecha_inicio) && (
                  <span title="Tiempo en el cargo"
                    style={{ color: "var(--teal)", fontSize: 11, fontWeight: 700, marginLeft: 6, whiteSpace: "nowrap" }}>
                    · {tiempoEnCargo(m.fecha_inicio)}
                  </span>
                )}
              </>
            )}
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
                {m.persona?.alias || m.persona?.nombre}
                <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8 }}>
                  {m.fecha_inicio ? fmtF(m.fecha_inicio) : "—"} → {m.fecha_fin ? fmtF(m.fecha_fin) : "—"}
                </span>
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
