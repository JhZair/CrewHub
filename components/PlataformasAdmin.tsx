"use client";
import { guardarPlataforma, borrarPlataforma, guardarPuerta, borrarPuerta } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Las puertas del sistema, en un solo sitio.
   Antes el link de SUNAT estaba quemado en un componente y el de DAFO
   repetido en cada credencial: cambiar una URL era tocar código o cinco
   filas. Aquí se cambia una vez y las credenciales sin puerta propia la
   heredan solas.

   Una plataforma tiene una puerta principal (`url`) y, si hace falta,
   entradas adicionales con nombre. Clave SOL es el caso: una cuenta, tres
   entradas —menú general, declaraciones y pagos, renta anual—. Nadie entra
   «a SUNAT»: entra a declarar el IGV. */

type P = { id?: string; nombre: string; url: string; requiereCuenta: boolean; notas: string };
const vacia: P = { nombre: "", url: "", requiereCuenta: true, notas: "" };
type Q = { id?: string; titulo: string; url: string; notas: string };
const puertaVacia: Q = { titulo: "", url: "", notas: "" };

const inp: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "7px 10px", fontSize: 12.5, color: "var(--text)", outline: "none",
};

const linkOk = (u: string) => /^https?:\/\/\S+$/.test(u.trim());

/* El ↗ que comprueba: un link que nadie abrió es un link que no sabemos si
   sirve. Apagado mientras no sea un link completo. */
function Probar({ url }: { url: string }) {
  const ok = linkOk(url);
  return (
    <a href={ok ? url.trim() : undefined} target="_blank" rel="noopener noreferrer"
      className="btn btn-ghost" title={ok ? "Abrir para comprobarlo" : "Pega un link completo (https://…)"}
      style={{ padding: "0 10px", display: "inline-flex", alignItems: "center", opacity: ok ? 1 : .4 }}>↗</a>
  );
}

/* Formulario de una entrada adicional */
function PuertaForm({ v, set, onSave, onCancel, guardando }: {
  v: Q; set: (x: Q) => void; onSave: () => void; onCancel: () => void; guardando: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "8px 0 8px 22px" }}>
      <input placeholder="¿Para qué sirve? (ej. Declaraciones y pagos) *" value={v.titulo}
        onChange={e => set({ ...v, titulo: e.target.value })} style={{ ...inp, width: 230, fontSize: 12 }} />
      <span style={{ display: "flex", gap: 4, flex: 1, minWidth: 220 }}>
        <input placeholder="Link (https://…) *" value={v.url} inputMode="url"
          onChange={e => set({ ...v, url: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0, fontSize: 12 }} />
        <Probar url={v.url} />
      </span>
      <input placeholder="Nota (opcional)" value={v.notas}
        onChange={e => set({ ...v, notas: e.target.value })} style={{ ...inp, flex: 1, minWidth: 150, fontSize: 12 }} />
      <button className="btn" style={{ padding: "6px 12px", fontSize: 11.5 }}
        disabled={!v.titulo.trim() || !linkOk(v.url) || guardando} onClick={onSave}>
        {guardando ? "…" : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ padding: "6px 9px", fontSize: 11.5 }} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

function Form({ v, set, onSave, onCancel, guardando }: {
  v: P; set: (x: P) => void; onSave: () => void; onCancel: () => void; guardando: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
      <input placeholder="Nombre de la plataforma *" value={v.nombre}
        onChange={e => set({ ...v, nombre: e.target.value })} style={{ ...inp, width: 190 }} />
      <span style={{ display: "flex", gap: 6, flex: 1, minWidth: 240 }}>
        <input placeholder="Puerta principal (https://…)" value={v.url} inputMode="url"
          onChange={e => set({ ...v, url: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0 }} />
        <Probar url={v.url} />
      </span>
      {/* Distingue una cuenta de una herramienta pública: sin esto, «SUNAT»
          tendría dos links y nadie sabría cuál es cuál. */}
      <select value={v.requiereCuenta ? "si" : "no"}
        onChange={e => set({ ...v, requiereCuenta: e.target.value === "si" })}
        title="¿Hay que iniciar sesión, o cualquiera entra?" style={inp}>
        <option value="si">🔑 Con cuenta</option>
        <option value="no">🌐 Herramienta pública</option>
      </select>
      <input placeholder="Nota para quien entre (opcional)" value={v.notas}
        onChange={e => set({ ...v, notas: e.target.value })} style={{ ...inp, flex: 1, minWidth: 180 }} />
      <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
        disabled={!v.nombre.trim() || guardando} onClick={onSave}>
        {guardando ? "…" : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

export default function PlataformasAdmin({ plataformas }: { plataformas: any[] }) {
  const [agregando, setAgregando] = useState(false);
  const [f, setF] = useState<P>(vacia);
  const [editando, setEditando] = useState<string | null>(null);
  const [ef, setEf] = useState<P>(vacia);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Puertas: agregando cuelga de una plataforma; editando, de una puerta
  const [addPuerta, setAddPuerta] = useState<string | null>(null);
  const [np, setNp] = useState<Q>(puertaVacia);
  const [edPuerta, setEdPuerta] = useState<string | null>(null);
  const [epf, setEpf] = useState<Q>(puertaVacia);
  const router = useRouter();

  const salvarPuerta = async (plataformaId: string, v: Q, orden: number, cerrar: () => void) => {
    if (guardando) return;
    setGuardando(true); setError("");
    const r: any = await guardarPuerta({ ...v, plataformaId, orden });
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    cerrar(); router.refresh();
  };
  const quitarPuerta = async (id: string) => {
    setGuardando(true);
    const r: any = await borrarPuerta(id);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  const salvar = async (v: P, cerrar: () => void) => {
    if (guardando) return;
    setGuardando(true); setError("");
    const r: any = await guardarPlataforma(v);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    cerrar(); router.refresh();
  };
  const borrar = async (id: string) => {
    setGuardando(true);
    const r: any = await borrarPlataforma(id);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    setBorrando(null); router.refresh();
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
          🔗 Plataformas · {plataformas.length}
        </span>
        <span style={{ flex: 1 }} />
        {!agregando && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => { setF(vacia); setAgregando(true); }}>＋ Plataforma</button>
        )}
      </div>

      {error && (
        <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 8 }}>⚠ {error}</div>
      )}
      {agregando && (
        <Form v={f} set={setF} guardando={guardando}
          onSave={() => salvar(f, () => setAgregando(false))} onCancel={() => setAgregando(false)} />
      )}

      {plataformas.map((p: any) => (
        <div key={p.id}>
        {editando === p.id ? (
        <Form v={ef} set={setEf} guardando={guardando}
          onSave={() => salvar({ ...ef, id: p.id }, () => setEditando(null))}
          onCancel={() => setEditando(null)} />
      ) : (
        <div className="info-row" style={{ gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 13, minWidth: 150 }}>{p.nombre}</b>
          <span className="badge" style={{
            color: p.requiere_cuenta ? "var(--muted)" : "var(--teal)", background: "#1c1c2c",
          }}>{p.requiere_cuenta ? "🔑 con cuenta" : "🌐 pública"}</span>
          {/* Sin link, la plataforma no sirve de nada: se dice en rojo */}
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--violet)", fontSize: 11.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.url} ↗
            </a>
          ) : (
            <span style={{ color: "var(--red)", fontSize: 11.5, fontWeight: 700, flex: 1 }}>⚠ sin link</span>
          )}
          {/* Cuántas credenciales entran por esta puerta: dice si importa */}
          {p.usos > 0 && (
            <span style={{ color: "var(--dim)", fontSize: 11 }} title={`${p.usos} credencial(es) usan esta plataforma`}>
              🔑 {p.usos}
            </span>
          )}
          {p.clave && (
            <span className="badge" title={`El código la busca por «${p.clave}» — si la renombras, sigue funcionando`}
              style={{ color: "var(--dim)", background: "#1c1c2c", fontSize: 10 }}>⚙ {p.clave}</span>
          )}
          <button onClick={() => {
            setEditando(p.id);
            setEf({ nombre: p.nombre || "", url: p.url || "", requiereCuenta: p.requiere_cuenta !== false, notas: p.notas || "" });
          }} style={{ color: "var(--dim)", fontSize: 11.5, background: "none", border: "none", cursor: "pointer" }}>✎</button>
          {borrando === p.id ? (
            <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
              {p.usos > 0
                ? <span style={{ color: "var(--yellow)" }}>la usan {p.usos} credenciales · </span>
                : null}
              ¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => borrar(p.id)}>sí</button>
              {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
            </span>
          ) : (
            <button onClick={() => setBorrando(p.id)}
              style={{ color: "var(--dim)", fontSize: 11.5, background: "none", border: "none", cursor: "pointer" }}>✕</button>
          )}
        </div>
      )}

        {/* Las entradas adicionales. Casi ninguna plataforma tiene; Clave SOL
            sí: una cuenta, tres sitios. Cada una dice para qué sirve, porque
            nadie entra «a SUNAT» — entra a declarar el IGV. */}
        {(p.puertas || []).map((q: any) => edPuerta === q.id ? (
          <PuertaForm key={q.id} v={epf} set={setEpf} guardando={guardando}
            onSave={() => salvarPuerta(p.id, { ...epf, id: q.id }, q.orden ?? 0, () => setEdPuerta(null))}
            onCancel={() => setEdPuerta(null)} />
        ) : (
          <div key={q.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "5px 0 5px 22px", fontSize: 11.5 }}>
            <span style={{ color: "var(--dim)" }}>↳</span>
            <a href={q.url} target="_blank" rel="noopener noreferrer"
              title={q.notas || q.url}
              style={{ color: "var(--violet)", fontWeight: 600, minWidth: 150 }}>{q.titulo} ↗</a>
            {q.notas && (
              <span style={{ color: "var(--dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {q.notas}
              </span>
            )}
            <button title="Editar entrada" onClick={() => {
              setEdPuerta(q.id);
              setEpf({ titulo: q.titulo || "", url: q.url || "", notas: q.notas || "" });
            }} style={{ color: "var(--dim)", background: "none", border: "none", cursor: "pointer" }}>✎</button>
            <button title="Quitar entrada" onClick={() => quitarPuerta(q.id)}
              style={{ color: "var(--dim)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        ))}
        {addPuerta === p.id ? (
          <PuertaForm v={np} set={setNp} guardando={guardando}
            onSave={() => salvarPuerta(p.id, np, (p.puertas || []).length + 1, () => setAddPuerta(null))}
            onCancel={() => setAddPuerta(null)} />
        ) : editando !== p.id && (
          <button onClick={() => { setAddPuerta(p.id); setNp(puertaVacia); }}
            style={{ color: "var(--dim)", fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: "2px 0 6px 22px" }}>
            ＋ otra entrada a esta plataforma
          </button>
        )}
        </div>
      ))}

      {!plataformas.length && !agregando && (
        <div className="empty">Sin plataformas — agrega la primera con ＋.</div>
      )}
    </div>
  );
}
