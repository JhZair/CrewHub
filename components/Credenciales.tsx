"use client";
import {
  agregarCredencial, editarCredencial, borrarCredencial,
  agregarDato, editarDato, verificarDato, borrarDato,
} from "@/app/actions";
import Copiar from "@/components/Copiar";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATAFORMAS = [
  "SUNAT-ClaveSOL", "DAFO-Estímulos", "e-Mail", "Facebook", "Instagram",
  "TikTok", "YouTube", "Vimeo", "WhatsApp Business", "Banco", "Hosting/Web",
];
const UBICACIONES = ["KeePass (Drive)", "Bitwarden", "Custodia física", "Otro"];
/* «Usuario y contraseña», no «Correo y contraseña»: en DAFO se entra con el
   RUC, en otras con el DNI. Decir «correo» contradecía al propio
   identificador de la tarjeta —un RUC de once dígitos con la etiqueta
   «correo» al lado— y hacía dudar de cuál era el bueno. `usuario` no
   promete de qué tipo es: solo dice que hay uno.

   OJO: los ya guardados dicen «Correo y contraseña» tal cual. Este cambio
   es solo para los nuevos; los viejos se normalizan con
   db/credenciales-metodo-usuario.sql. */
const METODO_CLASICO = "Usuario y contraseña";
/* Clave SOL no entra en «usuario y contraseña»: pide TRES datos —RUC,
   usuario SOL y contraseña— y esta ficha solo tiene un identificador. El
   usuario SOL es el que se pierde: no se deduce del RUC ni del nombre, lo
   asigna SUNAT o lo eligió alguien hace años. Va como dato de la cuenta
   (abajo se reclama si falta), que además se puede verificar. */
const METODO_SOL = "RUC + usuario SOL + contraseña";
const METODOS = [METODO_CLASICO, METODO_SOL, "Con Google", "Con Facebook", "Con Apple", "Con Microsoft"];
/* Lo guardado antes de renombrar: para que un chip viejo no se pinte como
   si fuera un acceso federado hasta que se corra el SQL. */
const ES_CLASICO = (m?: string | null) =>
  m === METODO_CLASICO || m === METODO_SOL || m === "Correo y contraseña";
// Sugerencias comunes para los datos de cada cuenta
const DATO_SOL = "usuario SOL";
const DATOS_SUG = ["correo de contacto", "teléfono de contacto", "correo de recuperación", "pregunta de seguridad", "quién administra", "PIN / token"];
/* Con Clave SOL el usuario SOL encabeza las sugerencias: es el dato que
   falta, no uno más de la lista. */
const sugDe = (metodo?: string | null) => metodo === METODO_SOL ? [DATO_SOL, ...DATOS_SUG] : DATOS_SUG;
const tieneSol = (c: any) => (c.datos || []).some((d: any) => /usuario\s*sol/i.test(d.etiqueta || ""));
const STALE_DIAS = 180; // a partir de aquí, un dato pide reverificación

const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none" } as const;

/* Fecha legible: «2026-07-16» → «16 jul. 2026» (nadie lee un ISO de un vistazo). */
const fmtFecha = (d?: string | null) => {
  const s = String(d ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
};
/* Nombre corto de la ubicación: «KeePass (Drive)» → «KeePass». El paréntesis es
   ruido; lo importante es en qué gestor vive la clave. */
const ubicCorta = (u?: string | null) => (u || "sin ubicar").split("(")[0].trim();

const diasDesde = (d: string) => Math.floor((Date.now() - new Date(d + "T12:00:00").getTime()) / 86400000);
const frescura = (verificado_en: string | null) => {
  if (!verificado_en) return { txt: "sin verificar", cls: "rojo" as const };
  const n = diasDesde(verificado_en);
  if (n <= 0) return { txt: "verificado hoy", cls: "verde" as const };
  if (n > STALE_DIAS) return { txt: `revisar · hace ${n}d`, cls: "ambar" as const };
  return { txt: `verificado hace ${n}d`, cls: "verde" as const };
};

type Val = { plataforma: string; identificador: string; ubicacion: string; notas: string; metodo: string; url: string };
type DVal = { etiqueta: string; valor: string };

/* Formulario de credencial (agregar y editar) — a nivel de módulo para que
   los inputs no pierdan el foco al escribir. */
function FormFila({ v, set, onSave, onCancel, guardando }: {
  v: Val; set: (x: Val) => void; onSave: () => void; onCancel: () => void; guardando: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
      {/* El nombre de la plataforma es la llave: por él se resuelve su link
          y sus entradas al leer. Escribirlo distinto («SUNAT ClaveSOL») deja
          la credencial huérfana, sin link y sin puertas — por eso la lista
          sugerida. */}
      <input list="plat-lista" placeholder="Plataforma *" value={v.plataforma}
        onChange={e => set({ ...v, plataforma: e.target.value })}
        style={{ ...inp, width: 160 }} />
      <datalist id="plat-lista">{PLATAFORMAS.map(p => <option key={p} value={p} />)}</datalist>
      {/* Con Clave SOL este campo es el RUC y punto: el usuario SOL es otro
          dato y no cabe aquí. Decirlo en el placeholder evita el «20601…/
          MJOROS» metido a la fuerza en un solo campo, que después nadie sabe
          leer. */}
      <input placeholder={v.metodo === METODO_SOL ? "RUC (el usuario SOL va como dato)" : "Usuario / RUC / correo (no la clave)"}
        value={v.identificador} inputMode={v.metodo === METODO_SOL ? "numeric" : undefined}
        onChange={e => set({ ...v, identificador: e.target.value })} style={{ ...inp, flex: 1, minWidth: 180 }} />
      <select value={v.metodo} onChange={e => set({ ...v, metodo: e.target.value })} title="Cómo se inicia sesión" style={inp}>
        {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={v.ubicacion} onChange={e => set({ ...v, ubicacion: e.target.value })} style={inp}>
        {UBICACIONES.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
      {/* Vacío es lo normal y lo correcto: el link sale de la plataforma
          (⚙ Admin → 🔗 Plataformas), y se resuelve al leer. Esto es solo la
          excepción — esta cuenta entra por otra puerta que las demás de su
          plataforma. Llenarlo «por si acaso» congela una copia que nadie
          va a actualizar cuando la plataforma cambie. */}
      <span style={{ display: "flex", gap: 6, flex: 1, minWidth: 200 }}>
        <input placeholder="Link propio (solo si entra por otra puerta)"
          title="Déjalo vacío: hereda el de su plataforma. Solo llénalo si esta cuenta entra por un sitio distinto."
          value={v.url} inputMode="url"
          onChange={e => set({ ...v, url: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0 }} />
        <a href={/^https?:\/\/\S+/.test(v.url.trim()) ? v.url.trim() : undefined}
          target="_blank" rel="noopener noreferrer" className="btn btn-ghost"
          title={/^https?:\/\/\S+/.test(v.url.trim()) ? "Abrir para revisarlo" : "Pega un link completo (https://…)"}
          style={{ padding: "0 10px", display: "inline-flex", alignItems: "center", fontSize: 14,
            opacity: /^https?:\/\/\S+/.test(v.url.trim()) ? 1 : .4 }}>↗</a>
      </span>
      <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!v.plataforma.trim() || guardando} onClick={onSave}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

/* Formulario de un dato (etiqueta + valor) */
function DatoForm({ v, set, onSave, onCancel, guardando, sug = DATOS_SUG }: {
  v: DVal; set: (x: DVal) => void; onSave: () => void; onCancel: () => void; guardando: boolean;
  sug?: string[];   // varía con el método: Clave SOL pone «usuario SOL» primero
}) {
  return (
    <div className="dato-form">
      <input list="dato-sug" placeholder="Dato (ej. correo de contacto) *" value={v.etiqueta}
        onChange={e => set({ ...v, etiqueta: e.target.value })} style={{ ...inp, width: 175 }} />
      <datalist id="dato-sug">{sug.map(s => <option key={s} value={s} />)}</datalist>
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
  const vacio: Val = { plataforma: "", identificador: "", ubicacion: UBICACIONES[0], notas: "", metodo: METODOS[0], url: "" };
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
    const res = await agregarCredencial(dueno, duenoId, f.plataforma, f.identificador, f.ubicacion, f.notas, f.metodo, f.url);
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
      /* `urlPropia`, NO `url`: el segundo es el resuelto —si esta credencial
         no tiene link propio, trae el de su plataforma—. Cargar el resuelto
         haría que abrir y guardar sin tocar nada le grabe el link de la
         plataforma como excepción propia, y la copia volvería sola. */
      url: c.urlPropia || "",
    });
  };
  const guardarEdicion = async (id: string) => {
    if (!ef.plataforma.trim() || guardando) return;
    setGuardando(true); setError("");
    const res = await editarCredencial(id, dueno, duenoId, ef.plataforma, ef.identificador, ef.ubicacion, ef.notas, ef.metodo, ef.url);
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
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {/* Línea 1: plataforma (enlace) · identificador · acciones */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="cargo"
                    title={(c.calculada
                      ? `Abre directo en ${c.identificador} — el link se arma con este mismo correo\n`
                      : c.heredado ? "Link de la plataforma (se administra en Admin → Plataformas)\n"
                      : "Link propio de esta cuenta\n") + c.url}
                    style={{ flex: "none", color: "var(--violet)", textDecoration: "none", fontWeight: 700 }}>
                    {c.plataforma} ↗
                  </a>
                ) : (
                  <span className="cargo" style={{ flex: "none", fontWeight: 700 }}
                    title="Nadie cargó el link de esta plataforma — se hace una vez en Admin → Plataformas y lo heredan todas">
                    {c.plataforma}
                  </span>
                )}
                {/* El identificador es lo que se teclea para entrar: el RUC en
                    DAFO, el correo en Gmail. El dato que más veces al día pasa
                    de esta pantalla a otro formulario. */}
                <span style={{ flex: 1, minWidth: 0, color: "#c6c6da", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.identificador
                    ? <Copiar valor={c.identificador} etiqueta={`el usuario de ${c.plataforma}`}>{c.identificador}</Copiar>
                    : "—"}
                </span>
                <button title="Editar" style={{ color: "var(--dim)", flex: "none" }} onClick={() => abrirEdicion(c)}>✎</button>
                {borrando === c.id ? (
                  <span style={{ fontSize: 11.5, whiteSpace: "nowrap", flex: "none" }}>
                    ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => borrar(c.id)}>sí</button>
                    {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
                  </span>
                ) : (
                  <button title="Quitar registro (la clave en el gestor no se toca)" style={{ color: "var(--dim)", flex: "none" }}
                    onClick={() => setBorrando(c.id)}>✕</button>
                )}
              </div>

              {/* Línea 2: método · dónde vive la clave · otras puertas · fecha */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {c.metodo_acceso && (
                  <span className="badge" style={{
                    fontSize: 10.5,
                    color: ES_CLASICO(c.metodo_acceso) ? "var(--muted)" : "var(--violet)",
                    background: ES_CLASICO(c.metodo_acceso) ? "#1c1c2c" : "rgba(167,139,250,.12)",
                  }}>
                    {ES_CLASICO(c.metodo_acceso) ? "🔑" : "🔗"} {c.metodo_acceso}
                  </span>
                )}
                <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.1)" }}
                  title={c.ubicacion || "sin ubicar"}>
                  🔒 {ubicCorta(c.ubicacion)}
                </span>
                {/* Las otras entradas de la misma cuenta. Con Clave SOL son
                    tres sitios distintos y el de arriba es solo el menú
                    general: quien viene a declarar el IGV necesita el suyo. */}
                {(c.puertas || []).map((q: any) => (
                  <a key={q.id} href={q.url} target="_blank" rel="noopener noreferrer"
                    className="badge" title={q.notas || `Entrar a ${q.titulo}`}
                    style={{ color: "var(--violet)", background: "rgba(167,139,250,.1)",
                      textTransform: "none", letterSpacing: 0, textDecoration: "none" }}>
                    ↗ {q.titulo}
                  </a>
                ))}
                <span style={{ flex: 1 }} />
                {c.actualizado_en && <span style={{ color: "var(--dim)", fontSize: 11, whiteSpace: "nowrap" }}>actualizado {fmtFecha(c.actualizado_en)}</span>}
              </div>
            </div>
          )}

          {/* Datos de la cuenta (verificables) */}
          <div className="cred-datos">
            {[...(c.datos || [])].sort((a: any, b: any) => (a.etiqueta || "").localeCompare(b.etiqueta || "")).map((d: any) => (
              edDatoId === d.id ? (
                <DatoForm key={d.id} v={ed} set={setEd} onSave={() => guardarEd(d.id)} onCancel={() => setEdDatoId(null)} guardando={ocupadoDato} sug={sugDe(c.metodo_acceso)} />
              ) : (
                <div key={d.id} className="dato-row">
                  <span className="dato-et">{d.etiqueta}</span>
                  {/* Códigos de afiliación, usuario SOL, N° de contrato: se
                      guardan justamente para copiarlos meses después. */}
                  <span className="dato-val">
                    {d.valor
                      ? <Copiar valor={d.valor} etiqueta={d.etiqueta}>{d.valor}</Copiar>
                      : "—"}
                  </span>
                  {(() => { const fr = frescura(d.verificado_en); return <span className={`dato-verif ${fr.cls}`}>{fr.cls === "verde" ? "✅" : fr.cls === "ambar" ? "⚠" : "⛔"} {fr.txt}</span>; })()}
                  <button className="dato-btn" title="Confirmé que sigue vigente" onClick={() => verificar(d.id)}>✓ verifiqué</button>
                  <button className="dato-btn" title="Editar dato" onClick={() => { setEdDatoId(d.id); setEd({ etiqueta: d.etiqueta || "", valor: d.valor || "" }); }}>✎</button>
                  <button className="dato-btn" title="Quitar dato" style={{ color: "var(--dim)" }} onClick={() => quitarDato(d.id)}>✕</button>
                </div>
              )
            ))}
            {/* Clave SOL sin usuario SOL es una credencial que no abre nada:
                están el RUC y la clave, y falta el tercero. Se reclama con un
                botón que ya deja el dato escrito, para que arreglarlo cueste
                un clic y no haya que saber cómo se llama el campo. */}
            {c.metodo_acceso === METODO_SOL && !tieneSol(c) && addDato !== c.id && (
              <div className="dato-row" style={{ color: "var(--red)", fontSize: 11.5 }}>
                <span>⛔ falta el <b>usuario SOL</b> — con el RUC y la clave solos no se entra</span>
                <button className="dato-btn" style={{ color: "var(--red)", fontWeight: 700 }}
                  onClick={() => { setAddDato(c.id); setNd({ etiqueta: DATO_SOL, valor: "" }); }}>
                  ＋ agregarlo
                </button>
              </div>
            )}
            {addDato === c.id ? (
              <DatoForm v={nd} set={setNd} onSave={() => guardarNd(c.id)} onCancel={() => setAddDato(null)} guardando={ocupadoDato} sug={sugDe(c.metodo_acceso)} />
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
