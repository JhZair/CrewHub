"use client";
import {
  agregarCredencial, editarCredencial, borrarCredencial,
  agregarDato, editarDato, verificarDato, borrarDato,
} from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATAFORMAS = [
  "SUNAT-ClaveSOL", "DAFO-Estímulos", "e-Mail", "Facebook", "Instagram",
  "TikTok", "YouTube", "Vimeo", "WhatsApp Business", "Banco", "Hosting/Web",
];
const UBICACIONES = ["KeePass (Drive)", "Bitwarden", "Custodia física", "Otro"];
/* «Usuario y contraseña», no «Correo y contraseña»: en DAFO se entra con el
   RUC, en SUNAT con RUC + clave SOL, en otras con el DNI. Decir «correo»
   contradecía al propio identificador de la tarjeta —un RUC de once dígitos
   con la etiqueta «correo» al lado— y hacía dudar de cuál era el bueno.
   `usuario` no promete de qué tipo es: solo dice que hay uno.

   OJO: los ya guardados dicen «Correo y contraseña» tal cual. Este cambio
   es solo para los nuevos; los viejos se normalizan con
   db/credenciales-metodo-usuario.sql. */
const METODO_CLASICO = "Usuario y contraseña";
const METODOS = [METODO_CLASICO, "Con Google", "Con Facebook", "Con Apple", "Con Microsoft"];
/* Lo guardado antes de renombrar: para que un chip viejo no se pinte como
   si fuera un acceso federado hasta que se corra el SQL. */
const ES_CLASICO = (m?: string | null) =>
  m === METODO_CLASICO || m === "Correo y contraseña";
// Sugerencias comunes para los datos de cada cuenta
const DATOS_SUG = ["correo de contacto", "teléfono de contacto", "correo de recuperación", "pregunta de seguridad", "quién administra", "PIN / token"];
const STALE_DIAS = 180; // a partir de aquí, un dato pide reverificación

const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none" } as const;

const diasDesde = (d: string) => Math.floor((Date.now() - new Date(d + "T12:00:00").getTime()) / 86400000);
const frescura = (verificado_en: string | null) => {
  if (!verificado_en) return { txt: "sin verificar", cls: "rojo" as const };
  const n = diasDesde(verificado_en);
  if (n <= 0) return { txt: "verificado hoy", cls: "verde" as const };
  if (n > STALE_DIAS) return { txt: `revisar · hace ${n}d`, cls: "ambar" as const };
  return { txt: `verificado hace ${n}d`, cls: "verde" as const };
};

type Val = { plataforma: string; identificador: string; ubicacion: string; notas: string; metodo: string };
type DVal = { etiqueta: string; valor: string };

/* Formulario de credencial (agregar y editar) — a nivel de módulo para que
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

/* Formulario de un dato (etiqueta + valor) */
function DatoForm({ v, set, onSave, onCancel, guardando }: {
  v: DVal; set: (x: DVal) => void; onSave: () => void; onCancel: () => void; guardando: boolean;
}) {
  return (
    <div className="dato-form">
      <input list="dato-sug" placeholder="Dato (ej. correo de contacto) *" value={v.etiqueta}
        onChange={e => set({ ...v, etiqueta: e.target.value })} style={{ ...inp, width: 175 }} />
      <datalist id="dato-sug">{DATOS_SUG.map(s => <option key={s} value={s} />)}</datalist>
      <input placeholder="Valor (correo, número…)" value={v.valor}
        onChange={e => set({ ...v, valor: e.target.value })} style={{ ...inp, flex: 1, minWidth: 140 }} />
      <button className="btn" style={{ padding: "6px 12px", fontSize: 11.5 }} disabled={!v.etiqueta.trim() || guardando} onClick={onSave}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ padding: "6px 9px", fontSize: 11.5 }} onClick={onCancel}>Cancelar</button>
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
  // Estado de los datos por credencial
  const [addDato, setAddDato] = useState<string | null>(null);     // credencial id
  const [nd, setNd] = useState<DVal>({ etiqueta: "", valor: "" });
  const [edDatoId, setEdDatoId] = useState<string | null>(null);   // dato id
  const [ed, setEd] = useState<DVal>({ etiqueta: "", valor: "" });
  const [ocupadoDato, setOcupadoDato] = useState(false);
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

  // ── Datos ──
  const guardarNd = async (credId: string) => {
    if (!nd.etiqueta.trim() || ocupadoDato) return;
    setOcupadoDato(true); setError("");
    const res = await agregarDato(credId, dueno, duenoId, nd.etiqueta, nd.valor);
    setOcupadoDato(false);
    if (res?.error) { setError(res.error); return; }
    setNd({ etiqueta: "", valor: "" }); setAddDato(null); router.refresh();
  };
  const guardarEd = async (id: string) => {
    if (!ed.etiqueta.trim() || ocupadoDato) return;
    setOcupadoDato(true); setError("");
    const res = await editarDato(id, dueno, duenoId, ed.etiqueta, ed.valor);
    setOcupadoDato(false);
    if (res?.error) { setError(res.error); return; }
    setEdDatoId(null); router.refresh();
  };
  const verificar = async (id: string) => {
    const res = await verificarDato(id, dueno, duenoId);
    if (res?.error) setError(res.error); else router.refresh();
  };
  const quitarDato = async (id: string) => {
    const res = await borrarDato(id, dueno, duenoId);
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
        <div key={c.id} className="cred-bloque">
          {editando === c.id ? (
            <FormFila v={ef} set={setEf} onSave={() => guardarEdicion(c.id)} onCancel={() => setEditando(null)} guardando={guardando} />
          ) : (
            <div className="eq-row" style={{ alignItems: "center" }}>
              <span className="cargo" style={{ minWidth: 130 }}>{c.plataforma}</span>
              <span style={{ flex: 1, color: "#c6c6da" }}>{c.identificador || "—"}</span>
              {c.metodo_acceso && (
                <span className="badge" style={{
                  fontSize: 10.5,
                  color: ES_CLASICO(c.metodo_acceso) ? "var(--muted)" : "var(--violet)",
                  background: ES_CLASICO(c.metodo_acceso) ? "#1c1c2c" : "rgba(167,139,250,.12)",
                }}>
                  {ES_CLASICO(c.metodo_acceso) ? "🔑" : "🔗"} {c.metodo_acceso}
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
          )}

          {/* Datos de la cuenta (verificables) */}
          <div className="cred-datos">
            {[...(c.datos || [])].sort((a: any, b: any) => (a.etiqueta || "").localeCompare(b.etiqueta || "")).map((d: any) => (
              edDatoId === d.id ? (
                <DatoForm key={d.id} v={ed} set={setEd} onSave={() => guardarEd(d.id)} onCancel={() => setEdDatoId(null)} guardando={ocupadoDato} />
              ) : (
                <div key={d.id} className="dato-row">
                  <span className="dato-et">{d.etiqueta}</span>
                  <span className="dato-val">{d.valor || "—"}</span>
                  {(() => { const fr = frescura(d.verificado_en); return <span className={`dato-verif ${fr.cls}`}>{fr.cls === "verde" ? "✅" : fr.cls === "ambar" ? "⚠" : "⛔"} {fr.txt}</span>; })()}
                  <button className="dato-btn" title="Confirmé que sigue vigente" onClick={() => verificar(d.id)}>✓ verifiqué</button>
                  <button className="dato-btn" title="Editar dato" onClick={() => { setEdDatoId(d.id); setEd({ etiqueta: d.etiqueta || "", valor: d.valor || "" }); }}>✎</button>
                  <button className="dato-btn" title="Quitar dato" style={{ color: "var(--dim)" }} onClick={() => quitarDato(d.id)}>✕</button>
                </div>
              )
            ))}
            {addDato === c.id ? (
              <DatoForm v={nd} set={setNd} onSave={() => guardarNd(c.id)} onCancel={() => setAddDato(null)} guardando={ocupadoDato} />
            ) : (
              <button className="dato-add" onClick={() => { setAddDato(c.id); setNd({ etiqueta: "", valor: "" }); }}>
                ＋ dato de esta cuenta
              </button>
            )}
          </div>
        </div>
      ))}
      {!credenciales.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>Sin credenciales registradas.</div>
      )}
    </div>
  );
}
