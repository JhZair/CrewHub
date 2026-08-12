"use client";
import { ESTADOS_EQUIPO } from "@/lib/estadosEquipo";
import { prestarEquipo, devolverEquipo, comentarEquipo, comentarPrestamo, editarComentarioEquipo } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import LinkPreviews from "@/components/LinkPreviews";
import { menciones, MencionesMenu, type Perfil } from "@/components/Menciones";
import EditorImagenes from "@/components/EditorImagenes";
import Foto from "@/components/Foto";
import RespuestaBox from "@/components/RespuestaBox";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { hoyLima } from "@/lib/fechas";

const fmtF = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
const fmtH = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tagEsDano = (t: string) => nrm(t).includes("dano");
const tagEsMant = (t: string) => nrm(t).includes("manten");
const MANT = "#4a9d9d"; // color tenue del mantenimiento (verde azulado)
/* Rótulo + color del estado: de lib/estadosEquipo, no de una copia. Ésta
   pintaba «perdido» en var(--dano) y el carné en var(--red) — el mismo
   estado, dos rojos, en dos sitios de la misma pantalla. */
const EST: Record<string, [string, string]> = Object.fromEntries(
  ESTADOS_EQUIPO.map(e => [e.k, [`${e.ico} ${e.txt}`, e.color] as [string, string]]));

type Modo = "nota" | "dano" | "mant" | "uso";

/* LÍNEA DE TIEMPO DEL EQUIPO — un solo lugar donde vive todo el ciclo de vida del
   equipo: notas, daños, mantenimientos y usos (préstamos), intercalados por
   fecha. Un compositor con modos permite registrar lo que toque; arriba, el
   estado vivo (quién lo tiene ahora). No es un muro más: los usos son eventos
   de la propia línea, no comentarios. */
export default function PrestamoEquipo({ equipoId, prestamos, personas, proyectos, userId, perfiles = [], bitacora = [], estado }: {
  equipoId: string;
  prestamos: any[];
  personas: CatalogoItem[];
  proyectos: CatalogoItem[];
  userId?: string;
  perfiles?: Perfil[];
  /** Comentarios sueltos de la bitácora del equipo (cuelgan del equipamiento). */
  bitacora?: any[];
  /** Estado del equipo (disponible, en_reparacion, …) para el banner. */
  estado?: string | null;
}) {
  const router = useRouter();
  // Compositor
  const [modo, setModo] = useState<Modo>("nota");
  const [texto, setTexto] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [fechaEvento, setFechaEvento] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Poner en uso
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);
  const [proy, setProy] = useState<{ id: string; nombre: string } | null>(null);
  const [notaUso, setNotaUso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Timeline
  const [filtro, setFiltro] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const { candidatos, aplicar } = menciones(texto, perfiles);
  const actual = prestamos.find((p: any) => !p.hasta);
  const estInfo = estado ? EST[estado] : null;

  // Todos los comentarios en un solo flujo: la bitácora suelta + los de cada uso.
  const comentariosTodos = [
    ...bitacora,
    ...prestamos.flatMap((p: any) => p.comentarios || []),
  ];
  const comMap = new Map<string, any>(comentariosTodos.map((c: any) => [c.id, c]));
  const hijosDe = new Map<string, any[]>();
  comentariosTodos.forEach((c: any) => {
    if (c.responde_a && comMap.has(c.responde_a)) {
      const l = hijosDe.get(c.responde_a) || []; l.push(c); hijosDe.set(c.responde_a, l);
    }
  });
  const raices = comentariosTodos.filter((c: any) => !c.responde_a || !comMap.has(c.responde_a));
  // Las raíces de la bitácora suelta van en el flujo principal; las de un uso
  // (prestamo_id) cuelgan bajo su propio evento «Puesto en uso».
  const raicesBita = raices.filter((c: any) => !c.prestamo_id);
  const comsDeUso = (pid: string) => raices.filter((c: any) => c.prestamo_id === pid);

  // Eventos de uso: puesto en uso (desde) y liberado (hasta).
  const eventosUso: any[] = [];
  prestamos.forEach((p: any) => {
    eventosUso.push({ t: "uso_ini", at: p.desde + "T12:00:00", p });
    if (p.hasta) eventosUso.push({ t: "uso_fin", at: p.hasta + "T12:00:00", p });
  });

  /* Línea de tiempo: raíces de la bitácora + eventos de uso, LO MÁS RECIENTE
     ARRIBA. Con filtro activo solo comentarios de esa etiqueta (los eventos se
     ocultan).
     Iba ascendente, que es el orden de un diario que se lee entero de una
     vez. Pero a una bitácora de equipo no se viene a leerla entera: se viene
     a saber qué le pasó A ESTE DRONE ÚLTIMAMENTE —«¿ya lo llevaron al
     técnico?»—, y eso estaba al final, después de once entradas y de todo el
     historial de préstamos. La pregunta más frecuente exigía el scroll más
     largo. Además el cuadro para escribir está arriba: con ascendente, lo que
     acabas de anotar aparecía a pantallas de distancia del sitio donde lo
     escribiste.
     Las RESPUESTAS de dentro de cada entrada siguen ascendentes: una
     conversación se lee del principio, y darla vuelta haría que las
     respuestas contestaran a algo que todavía no se ha leído. Es una lista de
     novedades por fuera y una conversación por dentro. */
  const items = (filtro
    ? raicesBita.filter((c: any) => (c.etiquetas || []).includes(filtro)).map((c: any) => ({ t: "com", at: c.creado_en, c }))
    : [
        ...raicesBita.map((c: any) => ({ t: "com", at: c.creado_en, c })),
        ...eventosUso,
      ]
  ).sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const usadas = [...new Set(comentariosTodos.flatMap((c: any) => c.etiquetas || []))] as string[];
  const sugTags = [...new Set(["daño", "mantenimiento", "cargador faltante", "pendiente", "revisar", ...usadas])].filter(Boolean);
  const sugueridas = sugTags.filter(t => !tags.includes(t)).slice(0, 8);
  const hayDano = tags.some(tagEsDano);
  const hayFecha = modo === "dano" || modo === "mant";
  const hay = comentariosTodos.length + eventosUso.length;

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };
  const agregarTag = (t: string) => {
    const v = t.trim();
    if (v && !tags.includes(v)) setTags(prev => [...prev, v]);
    setTagInput("");
  };
  // Al cambiar de modo, se SUMA la etiqueta que le da naturaleza («daño»,
  // «mantenimiento») sin pisar lo que el usuario ya escribió; "nota"/"uso" no
  // tocan las etiquetas. Quitar la etiqueta es manual (clic en su ✕).
  const irAModo = (m: Modo) => {
    setModo(m); setError("");
    if (m === "dano") setTags(prev => prev.some(tagEsDano) ? prev : [...prev, "daño"]);
    else if (m === "mant") setTags(prev => prev.some(tagEsMant) ? prev : [...prev, "mantenimiento"]);
  };

  const enviarComentario = async () => {
    if (enviando || (!texto.trim() && !imgs.length)) return;
    setEnviando(true);
    const r: any = await comentarEquipo(equipoId, texto.trim(), imgs, tags, null, fechaEvento || null);
    setEnviando(false);
    if (r?.error) { alert(r.error); return; }
    setTexto(""); setImgs([]); setFechaEvento(""); setTagInput("");
    setTags(modo === "dano" ? ["daño"] : modo === "mant" ? ["mantenimiento"] : []);
    router.refresh();
  };
  const prestar = async () => {
    if (!quien || ocupado) return;
    setOcupado(true); setError("");
    const res: any = await prestarEquipo(equipoId, quien.id, proy?.id || null, notaUso);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setQuien(null); setProy(null); setNotaUso(""); setModo("nota");
    router.refresh();
  };
  const devolver = async (id: string) => {
    const res: any = await devolverEquipo(id, equipoId);
    setDevolviendo(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  // Un comentario + su sub-hilo de respuestas (recursivo, indentado).
  const nodo = (c: any, depth: number): any => {
    const kids = hijosDe.get(c.id) || [];
    const esMant = (c.etiquetas || []).some(tagEsMant);
    const acento = c.es_dano ? "var(--dano)" : esMant ? MANT : null;
    return (
      /* CADA HILO, SU TARJETA. Un comentario de primer nivel y sus respuestas
         son UNA conversación; catorce seguidas sin nada que las separe se leen
         como una sola, y ahí es donde alguien responde en el hilo equivocado.
         Las respuestas van dentro, sangradas: pertenecen a este hilo, no a la
         bitácora. */
      <div key={c.id} className={depth ? "pe-rama" : "pe-tarjeta"}>
        <div className="pe-coment"
          style={acento ? { borderLeft: `2px solid ${acento}`, background: c.es_dano ? "rgba(207,139,147,.05)" : "rgba(74,157,157,.05)", borderRadius: 8, padding: "3px 8px" } : undefined}>
          <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={26} src={c.autor?.avatar_url} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{c.autor?.nombre || "Alguien"}</span>
            <span style={{ color: "var(--dim)", fontSize: 11.5, marginLeft: 6 }}>{fmtH(c.creado_en)}</span>
            {c.fecha_evento && editId !== c.id && (
              <span style={{ marginLeft: 8, fontSize: 11.5, color: acento || "var(--dim)", fontWeight: 600 }}>
                📅 ocurrió {fmtF(c.fecha_evento)}
              </span>
            )}
            {editId === c.id ? (
              <EditorComentario c={c} perfiles={perfiles} sugTags={sugTags}
                onDone={() => { setEditId(null); router.refresh(); }} onCancel={() => setEditId(null)} />
            ) : (
              <>
                {c.cuerpo && c.cuerpo !== "📷" && (
                  <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>{c.cuerpo}</div>
                )}
                {c.cuerpo !== "📷" && <LinkPreviews texto={c.cuerpo} />}
                {c.editado_en && <span style={{ fontSize: 10.5, color: "var(--dim)", marginLeft: 2 }}>· editado</span>}
                {(c.imagenes || []).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                    {(c.imagenes as string[]).map((u, i) => <Foto key={i} src={u} maxHeight={130} />)}
                  </div>
                )}
                {(c.etiquetas || []).length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {(c.etiquetas as string[]).map((t, i) => {
                      const col = tagEsDano(t) ? "var(--dano)" : tagEsMant(t) ? MANT : null;
                      return (
                        <span key={i} className="muro-tag muro-tag-chip"
                          style={col ? { color: col, borderColor: col, cursor: "default" } : { cursor: "default" }}>
                          {tagEsDano(t) ? "🔧" : tagEsMant(t) ? "🛠" : "🏷"} {t}
                        </span>
                      );
                    })}
                  </div>
                )}
                {userId && (
                  <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Reacciones pubId={null} comentarioId={c.id} reacciones={(c.reacciones || []) as Reaccion[]} userId={userId} />
                    <RespuestaBox bitacoraEquipoId={equipoId} comentarioId={c.id} />
                    {c.autor_id === userId && (
                      <button className="btn-responder" onClick={() => setEditId(c.id)}>✎ Editar</button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {kids.length > 0 && (
          <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 9 }}>
            {kids.map((k: any) => nodo(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Un evento de uso (puesto en uso / liberado): fila compacta, distinta a un
  // comentario, para que la línea se lea como historia y no como chat.
  const eventoUso = (it: any) => {
    const p = it.p;
    const nom = p.persona?.alias || p.persona?.nombre || "alguien";
    if (it.t === "uso_ini") {
      const coms = comsDeUso(p.id);
      return (
        <div key={`ini-${p.id}`}>
          <div className="pe-evento" style={{ borderLeft: "2px solid var(--yellow)" }}>
            <span style={{ fontSize: 14 }}>🤝</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12.5 }}>
                <b>Puesto en uso</b> — <Link href={`/entidad/persona/${p.persona?.id}`} style={{ color: "var(--text)", fontWeight: 700 }}>{nom}</Link>
                {p.proy && <> · <Link href={`/entidad/proyecto/${p.proy.id}`} style={{ color: "var(--violet)" }}>📁 {p.proy.nombre}</Link></>}
                {!p.hasta && <span style={{ color: "var(--yellow)", fontWeight: 700 }}> · lo tiene ahora</span>}
              </span>
              <span style={{ color: "var(--dim)", fontSize: 11.5, marginLeft: 8 }}>{fmtF(p.desde)}</span>
              {p.nota && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>📝 {p.nota}</div>}
            </div>
          </div>
          {/* Comentarios PROPIOS de este uso (cuelgan del préstamo) + caja para
             sumar uno. Van indentados bajo el evento para leerse como su hilo. */}
          <div style={{ marginLeft: 18, borderLeft: "2px solid var(--border)", paddingLeft: 10, marginTop: coms.length ? 9 : 6, display: "flex", flexDirection: "column", gap: 9 }}>
            {coms.map((c: any) => nodo(c, 0))}
            {userId && <CajaUso prestamoId={p.id} equipoId={equipoId} perfiles={perfiles} onSent={() => router.refresh()} />}
          </div>
        </div>
      );
    }
    return (
      <div key={`fin-${p.id}`} className="pe-evento" style={{ borderLeft: "2px solid var(--border2)" }}>
        <span style={{ fontSize: 14 }}>↩</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12.5 }}><b>Liberado</b> — {nom}</span>
          <span style={{ color: "var(--dim)", fontSize: 11.5, marginLeft: 8 }}>{fmtF(p.hasta)}</span>
        </div>
      </div>
    );
  };

  const enviarLabel = enviando ? "…" : modo === "dano" ? "Reportar daño" : modo === "mant" ? "Registrar mantenimiento" : "Comentar";

  return (
    /* SIN MARCO. `.linked` es una tarjeta —borde y fondo— y metía el estado, el
       compositor y toda la conversación dentro de una sola caja: catorce
       comentarios, sus respuestas y los eventos de uso leídos como un unico
       hilo continuo. Igual que pasaba en el muro de una empresa, y por la
       misma razón: la caja que agrupa dice «esto es una cosa».
       Aquí el contenedor solo separa de lo de arriba; lo que agrupa son las
       tarjetas de cada hilo, más abajo. */
    <div className="pe-bitacora">
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🗒 Bitácora del equipo
        </h4>
      </div>
      {error && <div className="err-inline" style={{ marginBottom: 8 }}>⚠ {error}</div>}

      {/* Estado vivo: estado del equipo + ¿en manos de quién? */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 12px",
        background: "var(--bg)", borderRadius: 10, borderLeft: `3px solid ${estInfo ? estInfo[1] : actual ? "var(--yellow)" : "var(--border2)"}` }}>
        {estInfo && (
          <span style={{ fontSize: 12, fontWeight: 700, color: estInfo[1], border: `1px solid ${estInfo[1]}`,
            borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap" }}>{estInfo[0]}</span>
        )}
        {actual ? (
          <span style={{ fontSize: 13 }}>
            👤 <Link href={`/entidad/persona/${actual.persona?.id}`} style={{ fontWeight: 700, color: "var(--text)" }}>
              {actual.persona?.alias || actual.persona?.nombre}</Link> lo tiene
            <span style={{ color: "var(--dim)", marginLeft: 6 }}>desde {fmtF(actual.desde)}</span>
            {actual.proy && <Link href={`/entidad/proyecto/${actual.proy.id}`} className="badge" style={{ marginLeft: 8, color: "var(--violet)", background: "rgba(167,139,250,.12)", fontSize: 11.5 }}>📁 {actual.proy.nombre}</Link>}
          </span>
        ) : (
          <span style={{ color: "var(--dim)", fontSize: 12.5 }}>📦 En el almacén — nadie lo tiene ahora.</span>
        )}
        <span style={{ flex: 1 }} />
        {actual && (devolviendo === actual.id ? (
          <span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
            ¿liberar? <button style={{ color: "var(--green)", fontWeight: 700 }} onClick={() => devolver(actual.id)}>sí</button>
            {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setDevolviendo(null)}>no</button>
          </span>
        ) : (
          <button className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 12.5 }} onClick={() => setDevolviendo(actual.id)}>↩ Liberar</button>
        ))}
      </div>

      {/* Compositor con modos — en su propia tarjeta, separado del estado, y
          con el acento violeta de todo lo que CREA algo en la aplicación. En
          gris era una tarjeta más de la columna: bajando la página, la primera
          caja de escribir que aparece es la de responder a un comentario. */}
      <div className="pe-compositor">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: .4, marginRight: 2 }}>✍ Registrar:</span>
          {([["nota", "📝 Nota"], ["dano", "🔧 Daño"], ["mant", "🛠 Mantenimiento"], ...(!actual ? [["uso", "🤝 Poner en uso"]] : [])] as [Modo, string][]).map(([m, lbl]) => (
            <button key={m} type="button" className={`muro-tag ${modo === m ? "on" : ""}`} onClick={() => irAModo(m)}>{lbl}</button>
          ))}
        </div>

        {modo === "uso" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
            <EntPicker etiqueta={quien ? `👤 ${quien.nombre}` : "👤 ¿A quién?"} items={personas}
              onPick={id => { const p = personas.find(x => x.id === id); if (p) setQuien({ id: p.id, nombre: p.nombre }); }} />
            <EntPicker etiqueta={proy ? `📁 ${proy.nombre}` : "📁 ¿Para qué proyecto? (opcional)"} items={proyectos}
              onPick={id => { const p = proyectos.find(x => x.id === id); if (p) setProy({ id: p.id, nombre: p.nombre }); }} />
            <input value={notaUso} placeholder="Nota (opcional)" onChange={e => setNotaUso(e.target.value)}
              style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", flex: 1, minWidth: 140, color: "var(--text)" }} />
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!quien || ocupado} onClick={prestar}>
              {ocupado ? "..." : "Poner en uso"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
              onClick={() => { setModo("nota"); setQuien(null); setProy(null); setNotaUso(""); }}>Cancelar</button>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div style={{ position: "relative" }}>
              <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
              <textarea value={texto} rows={3} className="muro-textarea"
                placeholder={modo === "dano" ? "¿Qué daño tiene? (@nombre · Ctrl+V pega fotos)" : modo === "mant" ? "¿Qué mantenimiento se hizo? (@nombre · Ctrl+V pega fotos)" : "Nota del equipo, una foto… (@nombre para invocar · Ctrl+V pega fotos)"}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (candidatos.length) { e.preventDefault(); setTexto(aplicar(candidatos[0].nombre)); return; }
                    e.preventDefault(); enviarComentario();
                  }
                }}
                onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }} />
            </div>
            <EditorImagenes imgs={imgs} setImgs={setImgs} />
            <div className="muro-tagsel">
              {tags.map(t => {
                const col = tagEsDano(t) ? "var(--dano)" : tagEsMant(t) ? MANT : null;
                return (
                  <button key={t} type="button" className="muro-tag on" title="Quitar"
                    style={col ? { background: col, borderColor: col } : undefined}
                    onClick={() => setTags(tags.filter(x => x !== t))}>{t} ✕</button>
                );
              })}
              <input value={tagInput} placeholder="+ etiqueta" className="muro-tag-input"
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregarTag(tagInput); } }} />
              {sugueridas.map(t => (
                <button key={t} type="button" className="muro-tag" onClick={() => agregarTag(t)}>
                  {tagEsDano(t) ? "🔧 " : tagEsMant(t) ? "🛠 " : ""}{t}
                </button>
              ))}
            </div>
            {hayFecha && (
              <div className="muro-tagsel" style={{ marginTop: 8 }}>
                <span className="muro-tagsel-lbl">📅 ¿Cuándo ocurrió?</span>
                <input type="date" value={fechaEvento} max={hoyLima()}
                  onChange={e => setFechaEvento(e.target.value)} className="muro-tag-input" style={{ width: "auto" }} />
                <span style={{ fontSize: 11, color: "var(--dim)" }}>opcional — vacío si fue hoy</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              {hayDano && <span style={{ fontSize: 11.5, color: "var(--dano)", fontWeight: 700 }}>🔧 El equipo pasará a «en reparación»</span>}
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 12.5 }}
                disabled={enviando || (!texto.trim() && !imgs.length)} onClick={enviarComentario}>{enviarLabel}</button>
            </div>
          </div>
        )}
      </div>

      {/* Filtro por etiqueta */}
      {usadas.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <span className="muro-tagsel-lbl" style={{ opacity: .7 }}>Filtrar:</span>
          <button className={`muro-tag muro-tag-chip ${!filtro ? "on" : ""}`} onClick={() => setFiltro(null)}>Todo · {comentariosTodos.length}</button>
          {usadas.map(t => {
            const n = comentariosTodos.filter((c: any) => (c.etiquetas || []).includes(t)).length;
            const col = tagEsDano(t) ? "var(--dano)" : tagEsMant(t) ? MANT : null;
            return (
              <button key={t} className={`muro-tag muro-tag-chip ${filtro === t ? "on" : ""}`}
                style={col && filtro !== t ? { color: col, borderColor: col } : undefined}
                onClick={() => setFiltro(filtro === t ? null : t)}>
                {tagEsDano(t) ? "🔧" : tagEsMant(t) ? "🛠" : "🏷"} {t} · {n}
              </button>
            );
          })}
        </div>
      )}

      {/* La raya entre «escribir» y «lo escrito», igual que en el muro. */}
      {hay > 0 && (
        <div className="muro-hilo-h" style={{ marginTop: 14 }}>
          {comentariosTodos.length} comentario{comentariosTodos.length === 1 ? "" : "s"}
          {eventosUso.length > 0 && ` · ${eventosUso.length} movimiento${eventosUso.length === 1 ? "" : "s"}`}
        </div>
      )}

      {/* Línea de tiempo */}
      <div className="pe-hilo" style={{ marginTop: 10 }}>
        {hay === 0 && <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>Sin actividad todavía — deja la primera nota o pon el equipo en uso.</div>}
        {items.map((it: any) => it.t === "com" ? nodo(it.c, 0) : eventoUso(it))}
      </div>
    </div>
  );
}

/* Editor inline de un comentario ya publicado: mismos campos que el compositor
   (texto, fotos, etiquetas y fecha del incidente), para corregir sin borrar y
   reescribir. Solo lo ve el autor. */
function EditorComentario({ c, perfiles, sugTags, onDone, onCancel }: {
  c: any; perfiles: Perfil[]; sugTags: string[]; onDone: () => void; onCancel: () => void;
}) {
  const [texto, setTexto] = useState(c.cuerpo === "📷" ? "" : (c.cuerpo || ""));
  const [imgs, setImgs] = useState<string[]>(c.imagenes || []);
  const [tags, setTags] = useState<string[]>(c.etiquetas || []);
  const [tagInput, setTagInput] = useState("");
  const [fechaEvento, setFechaEvento] = useState<string>(c.fecha_evento || "");
  const [guardando, setGuardando] = useState(false);
  const { candidatos, aplicar } = menciones(texto, perfiles);
  const hayDano = tags.some(tagEsDano);
  const mostrarFecha = hayDano || tags.some(tagEsMant);

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };
  const agregarTag = (t: string) => {
    const v = t.trim();
    if (v && !tags.includes(v)) setTags(prev => [...prev, v]);
    setTagInput("");
  };
  const guardar = async () => {
    if (guardando || (!texto.trim() && !imgs.length)) return;
    setGuardando(true);
    const r: any = await editarComentarioEquipo(c.id, texto.trim(), imgs, tags, fechaEvento || null);
    setGuardando(false);
    if (r?.error) { alert(r.error); return; }
    onDone();
  };
  const sugueridas = sugTags.filter(t => !tags.includes(t)).slice(0, 8);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative" }}>
        <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
        <textarea value={texto} rows={3} autoFocus className="muro-textarea"
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (candidatos.length) { e.preventDefault(); setTexto(aplicar(candidatos[0].nombre)); return; }
              e.preventDefault(); guardar();
            }
            if (e.key === "Escape") onCancel();
          }}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }} />
      </div>
      <EditorImagenes imgs={imgs} setImgs={setImgs} />
      <div className="muro-tagsel">
        {tags.map(t => {
          const col = tagEsDano(t) ? "var(--dano)" : tagEsMant(t) ? MANT : null;
          return (
            <button key={t} type="button" className="muro-tag on" title="Quitar"
              style={col ? { background: col, borderColor: col } : undefined}
              onClick={() => setTags(tags.filter(x => x !== t))}>{t} ✕</button>
          );
        })}
        <input value={tagInput} placeholder="+ etiqueta" className="muro-tag-input"
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregarTag(tagInput); } }} />
        {sugueridas.map(t => (
          <button key={t} type="button" className="muro-tag" onClick={() => agregarTag(t)}>
            {tagEsDano(t) ? "🔧 " : tagEsMant(t) ? "🛠 " : ""}{t}
          </button>
        ))}
      </div>
      {mostrarFecha && (
        <div className="muro-tagsel" style={{ marginTop: 8 }}>
          <span className="muro-tagsel-lbl">📅 ¿Cuándo ocurrió?</span>
          <input type="date" value={fechaEvento} max={hoyLima()}
            onChange={e => setFechaEvento(e.target.value)} className="muro-tag-input" style={{ width: "auto" }} />
          <span style={{ fontSize: 11, color: "var(--dim)" }}>opcional — vacío si fue hoy</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={onCancel} disabled={guardando}>Cancelar</button>
        <button className="btn" style={{ padding: "6px 14px", fontSize: 12.5 }}
          onClick={guardar} disabled={guardando || (!texto.trim() && !imgs.length)}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

/* Caja para comentar SOBRE un uso concreto: el comentario cuelga del préstamo
   (prestamo_id), así queda atado a esa salida y no a la bitácora general. Se
   abre con un clic para no llenar de cajas cada evento. Texto + fotos + @. */
function CajaUso({ prestamoId, equipoId, perfiles, onSent }: {
  prestamoId: string; equipoId: string; perfiles: Perfil[]; onSent: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const { candidatos, aplicar } = menciones(texto, perfiles);

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };
  const enviar = async () => {
    if (enviando || (!texto.trim() && !imgs.length)) return;
    setEnviando(true);
    const r: any = await comentarPrestamo(prestamoId, equipoId, texto.trim(), imgs, []);
    setEnviando(false);
    if (r?.error) { alert(r.error); return; }
    setTexto(""); setImgs([]); setAbierto(false); onSent();
  };

  if (!abierto) return <button className="pe-abrir" onClick={() => setAbierto(true)}>💬 Comentar este uso</button>;
  return (
    <div>
      <div style={{ position: "relative" }}>
        <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
        <textarea value={texto} rows={2} autoFocus className="muro-textarea"
          placeholder="Comentar este uso… (@nombre para invocar · Ctrl+V pega fotos)"
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (candidatos.length) { e.preventDefault(); setTexto(aplicar(candidatos[0].nombre)); return; }
              e.preventDefault(); enviar();
            }
            if (e.key === "Escape") setAbierto(false);
          }}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }} />
      </div>
      <EditorImagenes imgs={imgs} setImgs={setImgs} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
        <button className="btn btn-ghost" style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setAbierto(false)}>Cancelar</button>
        <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          disabled={enviando || (!texto.trim() && !imgs.length)} onClick={enviar}>{enviando ? "…" : "Comentar"}</button>
      </div>
    </div>
  );
}
