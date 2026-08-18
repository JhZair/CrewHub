"use client";
import { agregarEquipoPostulacion, quitarEquipoPostulacion, guardarCvEquipo,
  cambiarRolPostulacion } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import { ROLES_EQUIPO as ROLES, ordenarEquipo } from "@/lib/rolesEquipo";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function EquipoPostulacion({ postulacionId, equipo, personas }: {
  postulacionId: string;
  equipo: any[];
  personas: CatalogoItem[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [rol, setRol] = useState("");   // vacío: obliga a elegir, no se queda pegado en «Director/a»
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState("");
  // CV presentado: qué fila está editando su link y qué URL se está pegando.
  const [cvEditando, setCvEditando] = useState<string | null>(null);
  const [cvUrl, setCvUrl] = useState("");
  const [cvGuardando, setCvGuardando] = useState(false);
  /* Qué fila está corrigiendo su cargo y qué se está escribiendo. Igual que el
     CV: se edita SOBRE la tarjeta, no en un formulario aparte. El cargo que hay
     que corregir es el que se está mirando. */
  const [rolEditando, setRolEditando] = useState<string | null>(null);
  const [rolNuevo, setRolNuevo] = useState("");
  const [rolGuardando, setRolGuardando] = useState(false);
  const router = useRouter();

  const guardarRol = async (filaId: string) => {
    if (rolGuardando || !rolNuevo.trim()) return;
    setRolGuardando(true); setError("");
    const res: any = await cambiarRolPostulacion(filaId, postulacionId, rolNuevo);
    setRolGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setRolEditando(null); setRolNuevo("");
    router.refresh();
  };

  /* ── DEL CHIP A DONDE SE EDITA ──
   *
   * «sin precontrato» nombraba una cosa y no llevaba a ella. Y llevar no era
   * tan simple como parecía: el precontrato se rellena en la pestaña
   * «🗂 Expediente», mientras el equipo vive en «👥 Equipo». Dos pestañas.
   *
   * El primer intento solo desplegaba la sección y hacía scroll, y no pasaba
   * NADA: los paneles de las pestañas se montan todos y se ocultan con
   * `display:none`, así que el elemento existe —`getElementById` lo
   * encuentra— pero no tiene posición en la página. Un `scrollIntoView` sobre
   * algo oculto no falla: no hace nada, que es peor.
   *
   * La ruta correcta es el hash de dos partes que TabsPanel ya entiende:
   * `#<pestaña>/<ancla>`. Abre la pestaña, despliega la sección y baja hasta
   * ella. Y como queda en la URL, el enlace se puede pasar por WhatsApp: «ve a
   * llenar el precontrato de Roxana».
   */
  const DESTINO_PRE = "expediente/sec-precontratos";
  const irAPrecontratos = () => {
    if (window.location.hash === `#${DESTINO_PRE}`) {
      /* Mismo hash: el navegador no dispara `hashchange` y el salto se
         perdería. Pasa al pulsar dos chips seguidos, que es lo normal cuando
         se están llenando los seis precontratos de un equipo. */
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    window.location.hash = DESTINO_PRE;
  };

  const guardarCv = async (filaId: string, url: string) => {
    if (cvGuardando) return;
    setCvGuardando(true); setError("");
    const res = await guardarCvEquipo(filaId, postulacionId, url);
    setCvGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setCvEditando(null); setCvUrl("");
    router.refresh();
  };

  const guardar = async () => {
    if (!sel || guardando) return;
    setGuardando(true); setError("");
    const res = await agregarEquipoPostulacion(postulacionId, sel.id, rol);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setSel(null); setRol(""); setAgregando(false);
    router.refresh();
  };

  const quitar = async (id: string) => {
    const res = await quitarEquipoPostulacion(id, postulacionId);
    setQuitando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  /* El equipo se ordena por jerarquía del rol (fuente única en lib/rolesEquipo:
     dirección → producción → técnicos…), no por cómo se fueron agregando. */
  const equipoOrd = ordenarEquipo(equipo);

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          👥 Equipo de postulación · {equipo.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Agregar</button>}
      </div>

      {/* La lista de cargos vive FUERA del formulario de alta. Estaba dentro, y
          por eso al corregir el cargo de alguien —que no abre ese formulario—
          el campo se quedaba sin sugerencias: se escribía a mano y cada quien
          tecleaba «Director de fotografía», «Director/a de Fotografía» o
          «DF», que es exactamente lo que un catálogo existe para evitar. */}
      <datalist id="roles-postulacion">{ROLES.map(r => <option key={r} value={r} />)}</datalist>

      {error && <div className="err-inline">⚠ {error}</div>}
      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={personas}
            onPick={id => { const p = personas.find(x => x.id === id); if (p) setSel({ id: p.id, nombre: p.nombre }); }} />
          <input list="roles-postulacion" value={rol} onChange={e => setRol(e.target.value)}
            placeholder="Rol / cargo…"
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", width: 180 }} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
            title={!sel ? "Elige la persona" : !rol.trim() ? "Elige el cargo" : "Guardar"}
            disabled={!sel || !rol.trim() || guardando} onClick={guardar}>
            {guardando ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setAgregando(false); setSel(null); }}>Cancelar</button>
        </div>
      )}

      {equipoOrd.map((m: any) => {
        const p = m.persona || {};
        // Contexto que pesa en el fondo: qué es, de dónde, y si es comunero/a
        // (la reserva regional y la participación comunitaria puntúan en DAFO).
        const ctx = [p.tipo, p.region, p.es_comunero ? "🌱 comunero/a" : ""].filter(Boolean).join(" · ");
        return (
          <div key={m.id} className="eq-card">
            <Avatar nombre={p.nombre} src={p.foto_url} size={60} />
            <div className="eq-card-main">
              <div className="eq-card-top">
                <Link href={`/entidad/persona/${p.id}`} className="eq-card-nom" title={p.nombre}>{p.alias || p.nombre} →</Link>
                {/* ── EL CARGO SE CORRIGE AQUÍ ──
                    Antes había que quitar a la persona y volver a sumarla, y
                    eso se llevaba por delante el CV presentado —que cuelga de
                    esta fila— y dejaba en la bitácora una baja y un alta que
                    nunca ocurrieron. El cargo es un dato, no una identidad:
                    se edita como cualquier otro.
                    Es el propio badge el que se pulsa, no un ✎ al lado: el
                    cargo ya está ahí y es lo que se quiere cambiar. */}
                <button type="button" className="eq-card-cargo eq-cargo-btn"
                  title="Cambiar el cargo — el CV presentado no se toca"
                  onClick={() => { setRolEditando(m.id); setRolNuevo(m.cargo || ""); }}>
                  {m.cargo || "— sin cargo"}
                </button>
              </div>
              {ctx && <div className="eq-card-ctx">{ctx}</div>}
              {/* Los datos que el fondo revisa por persona: CV y precontrato.
                  El CV que vale es el PRESENTADO (cv_url de esta fila, hecho
                  para esta postulación y este cargo). Si aún no está, el CV
                  general de la persona aparece como base sugerida — abre el
                  documento del cual partir, pero no cuenta como entregado. */}
              <div className="eq-card-chips">
                {m.cv_url ? (
                  <>
                    <a href={m.cv_url} target="_blank" rel="noopener noreferrer"
                      className="eq-chip eq-chip-link ok">📄 CV ↗</a>
                    <button className="eq-chip dim" title="Cambiar o quitar el CV presentado"
                      onClick={() => { setCvEditando(m.id); setCvUrl(m.cv_url); }}>✎</button>
                  </>
                ) : (
                  <>
                    {m._cv ? (
                      <a href={m._cv.url || `/objeto/${m._cv.id}`} target="_blank" rel="noopener noreferrer"
                        className="eq-chip eq-chip-link warn" title="CV general de la persona: sirve de base, no cuenta como presentado">
                        📄 base: CV general ↗
                      </a>
                    ) : <span className="eq-chip falta">📄 sin CV</span>}
                    <button className="eq-chip dim" title="Registrar el link del CV preparado para esta postulación"
                      onClick={() => { setCvEditando(m.id); setCvUrl(""); }}>＋ CV</button>
                  </>
                )}
                {m._pre ? (
                  m._pre.id ? (
                    <>
                      {/* Con documento: el chip DESCARGA el .docx, que es lo
                          que se hace con un precontrato ya hecho. Editarlo es
                          otra cosa y lleva su propio botón al lado. */}
                      <a href={`/api/precontrato?post=${postulacionId}&pre=${m._pre.id}`} target="_blank" rel="noopener noreferrer"
                        className={`eq-chip eq-chip-link ${m._pre.estado === "firmado" ? "ok" : "warn"}`}
                        title="Descargar el precontrato en Word">
                        📝 {m._pre.estado} ↗
                      </a>
                      <button className="eq-chip dim" title="Editar el precontrato (monto, forma de pago, firma)"
                        onClick={irAPrecontratos}>✎</button>
                    </>
                  ) : (
                    <button className={`eq-chip ${m._pre.estado === "firmado" ? "ok" : "warn"}`}
                      title="Abrir la sección de precontratos para completarlo"
                      onClick={irAPrecontratos}>📝 {m._pre.estado}</button>
                  )
                ) : (
                  /* Sin precontrato: el chip ES la puerta. Un hueco que se
                     puede rellenar tiene que decir dónde, o es un reproche. */
                  <button className="eq-chip dim" title="Ir a Precontratos y crear el suyo"
                    onClick={irAPrecontratos}>📝 ＋ precontrato</button>
                )}
              </div>
              {rolEditando === m.id && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <input list="roles-postulacion" value={rolNuevo} autoFocus
                    onChange={e => setRolNuevo(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") guardarRol(m.id);
                      if (e.key === "Escape") { setRolEditando(null); setRolNuevo(""); }
                    }}
                    placeholder="Rol / cargo en esta postulación…"
                    style={{ background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none",
                      flex: 1, minWidth: 200 }} />
                  <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}
                    disabled={rolGuardando || !rolNuevo.trim()} onClick={() => guardarRol(m.id)}>
                    {rolGuardando ? "..." : "Guardar"}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => { setRolEditando(null); setRolNuevo(""); }}>Cancelar</button>
                  {/* Se dice lo que NO pasa. Quien corrige un cargo teme perder
                      el CV justo porque antes lo perdía. */}
                  <span style={{ color: "var(--dim)", fontSize: 11, width: "100%" }}>
                    El CV presentado y el precontrato se quedan como están.
                  </span>
                </div>
              )}
              {cvEditando === m.id && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <input value={cvUrl} onChange={e => setCvUrl(e.target.value)} autoFocus
                    placeholder="https://drive.google.com/… (CV de esta postulación)"
                    style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", flex: 1, minWidth: 220 }} />
                  <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}
                    disabled={cvGuardando || !cvUrl.trim()} onClick={() => guardarCv(m.id, cvUrl)}>
                    {cvGuardando ? "..." : "Guardar"}
                  </button>
                  {m.cv_url && (
                    <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12, color: "var(--red)" }}
                      disabled={cvGuardando} title="Quitar el CV presentado de esta fila"
                      onClick={() => guardarCv(m.id, "")}>Quitar</button>
                  )}
                  <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => { setCvEditando(null); setCvUrl(""); }}>Cancelar</button>
                </div>
              )}
            </div>
            {quitando === m.id ? (
              <span className="eq-card-conf">
                ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(m.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
              </span>
            ) : (
              <button className="eq-card-x" title="Quitar del equipo" onClick={() => setQuitando(m.id)}>✕</button>
            )}
          </div>
        );
      })}
      {!equipo.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Sin equipo registrado — el equipo técnico y artístico de esta postulación.
        </div>
      )}
    </div>
  );
}
