"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Foto from "@/components/Foto";
import EditorImagenes from "@/components/EditorImagenes";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import ComentarioTexto from "@/components/ComentarioTexto";
import { menciones, MencionesMenu, type Perfil } from "@/components/Menciones";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS } from "@/lib/prepararImagen";
import { publicarBitacora, borrarBitacora, destacarBitacora, editarBitacora, comentar } from "@/app/actions";

/* MURO DEL PROYECTO — una bitácora simple: notas con texto e imágenes, ordenadas
   por etiquetas PROPIAS del muro (texto libre, acotadas al proyecto — NO las
   etiquetas del sistema de casos), con reacciones y comentarios. El motor social
   (reacciones, comentarios, menciones) se reusa del sistema de publicaciones. */

export type MuroComentario = {
  id: string; cuerpo: string; imagenes?: string[] | null; creado_en: string;
  autor_id: string; editado_en?: string | null;
  autor?: { nombre?: string | null; color?: string | null; avatar_url?: string | null } | null;
};
export type MuroPost = {
  id: string; cuerpo: string | null; imagenes?: string[] | null; creado_en: string;
  editado_en?: string | null;
  autor_id: string;
  autor?: { nombre?: string | null; color?: string | null; avatar_url?: string | null } | null;
  tags: string[];
  destacado?: boolean;
  reacciones: Reaccion[];
  comentarios: MuroComentario[];
};

const fecha = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function MuroProyecto({ proyectoId, userId, perfiles, sugerencias, posts, entidadTipo = "proyecto" }: {
  proyectoId: string; userId: string;
  perfiles: Perfil[];
  /** Etiquetas ya usadas en el muro de esta entidad, para sugerir al escribir. */
  sugerencias: string[];
  posts: MuroPost[];
  /** De qué entidad es el muro: "proyecto" (por defecto) o "empresa". El id
   *  sigue viajando en `proyectoId` (nombre histórico). */
  entidadTipo?: string;
}) {
  const router = useRouter();
  // Composer
  const [texto, setTexto] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Filtro por etiqueta
  const [filtro, setFiltro] = useState<string | null>(null);
  // Nota en edición (id) — solo el autor.
  const [editando, setEditando] = useState<string | null>(null);

  const { candidatos, aplicar } = menciones(texto, perfiles);

  const pegar = async (files: File[]) => {
    setError("");
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      // El preparador aligera la foto ANTES del tope de 3MB: las fotos de
      // celular pasan siempre, sin que nadie las achique a mano.
      const lista = await prepararImagen(f, MEDIDAS.adjunto);
      const r = await subirImagen(lista);
      if (r.error) { setError(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };

  const agregarTag = (t: string) => {
    const v = t.trim();
    if (v && !tags.includes(v)) setTags(prev => [...prev, v]);
    setTagInput("");
  };

  const publicar = async () => {
    if (enviando) return;
    if (!texto.trim() && !imgs.length) { setError("Escribe algo o agrega una imagen."); return; }
    setEnviando(true); setError("");
    const r: any = await publicarBitacora(proyectoId, texto, imgs, tags, entidadTipo);
    setEnviando(false);
    if (r?.error) { setError(r.error); return; }
    setTexto(""); setImgs([]); setTags([]); setTagInput("");
    router.refresh();
  };

  const borrar = async (pubId: string) => {
    if (!confirm("¿Borrar esta nota del muro?")) return;
    const r: any = await borrarBitacora(pubId, proyectoId, entidadTipo);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  };

  const destacar = async (pubId: string, valor: boolean) => {
    const r: any = await destacarBitacora(pubId, proyectoId, valor, entidadTipo);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  };

  // Etiquetas que aparecen en el muro, para el filtro (de las notas visibles).
  const usadas = [...new Set(posts.flatMap(p => p.tags))].sort();
  const filtradas = filtro ? posts.filter(p => p.tags.includes(filtro)) : posts;
  // Sugerencias que aún no están puestas ni escritas.
  const sugToggle = [...new Set([...sugerencias, ...usadas])].filter(t => !tags.includes(t)).sort();

  return (
    <div className="muro">
      {/* Composer */}
      <div className="muro-composer">
        <div style={{ position: "relative" }}>
          <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
          <textarea value={texto} rows={3}
            placeholder="Comparte una nota, un avance, una foto… (@nombre para invocar)"
            onChange={e => setTexto(e.target.value)}
            onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }}
            className="muro-textarea" />
        </div>
        <EditorImagenes imgs={imgs} setImgs={setImgs} onError={setError} />

        {/* Etiquetas propias del muro: chips seleccionadas + entrada libre + sugerencias */}
        <div className="muro-tagsel">
          <span className="muro-tagsel-lbl">🏷 Etiquetas:</span>
          {tags.map(t => (
            <button key={t} type="button" className="muro-tag on" onClick={() => setTags(tags.filter(x => x !== t))}
              title="Quitar">{t} ✕</button>
          ))}
          <input value={tagInput} placeholder="+ etiqueta"
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregarTag(tagInput); } }}
            className="muro-tag-input" />
        </div>
        {sugToggle.length > 0 && (
          <div className="muro-tagsel" style={{ marginTop: 4 }}>
            <span className="muro-tagsel-lbl" style={{ opacity: .7 }}>Sugeridas:</span>
            {sugToggle.slice(0, 12).map(t => (
              <button key={t} type="button" className="muro-tag" onClick={() => agregarTag(t)}>{t}</button>
            ))}
          </div>
        )}

        {error && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn" disabled={enviando || (!texto.trim() && !imgs.length)} onClick={publicar}>
            {enviando ? "Publicando…" : "📝 Publicar en el muro"}
          </button>
        </div>
      </div>

      {/* Filtro por etiqueta */}
      {usadas.length > 0 && (
        <div className="muro-filtro">
          <button className={`muro-tag ${!filtro ? "on" : ""}`} onClick={() => setFiltro(null)}>Todas · {posts.length}</button>
          {usadas.map(t => (
            <button key={t} className={`muro-tag ${filtro === t ? "on" : ""}`}
              onClick={() => setFiltro(filtro === t ? null : t)}>
              {t} · {posts.filter(p => p.tags.includes(t)).length}
            </button>
          ))}
        </div>
      )}

      {/* Posts */}
      {filtradas.length === 0 && (
        <div className="empty" style={{ padding: "22px 0" }}>
          {posts.length === 0 ? "El muro está vacío — publica la primera nota." : "Ninguna nota con esa etiqueta."}
        </div>
      )}
      {filtradas.map(p => (
        <div key={p.id} className="muro-post">
          <div className="muro-post-cab">
            <Avatar nombre={p.autor?.nombre} color={p.autor?.color} size={34} src={p.autor?.avatar_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{p.autor?.nombre || "Alguien"}</b>
              <div style={{ color: "var(--dim)", fontSize: 11.5 }}>{fecha(p.creado_en)}</div>
            </div>
            <button className={`muro-destacar ${p.destacado ? "on" : ""}`}
              title={p.destacado ? "Quitar de destacados del carné" : "Destacar en el carné del proyecto"}
              onClick={() => destacar(p.id, !p.destacado)}>📌</button>
            {p.autor_id === userId && editando !== p.id && (
              <button className="muro-borrar" title="Editar nota" onClick={() => setEditando(p.id)}>✏</button>
            )}
            {p.autor_id === userId && (
              <button className="muro-borrar" title="Borrar nota" onClick={() => borrar(p.id)}>🗑</button>
            )}
          </div>

          {editando === p.id ? (
            <EditorNota post={p} proyectoId={proyectoId} entidadTipo={entidadTipo} perfiles={perfiles} sugerencias={sugerencias}
              onDone={() => { setEditando(null); router.refresh(); }}
              onCancel={() => setEditando(null)} />
          ) : (
            <>
              {p.cuerpo && <div className="muro-cuerpo">{p.cuerpo}</div>}
              {(p.imagenes || []).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {p.imagenes!.map((u, i) => <Foto key={i} src={u} maxHeight={260} />)}
                </div>
              )}
              {p.editado_en && <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>· editado</div>}
            </>
          )}

          {p.tags.length > 0 && (
            <div className="muro-post-tags">
              {p.tags.map(t => (
                <button key={t} className="muro-tag muro-tag-chip" onClick={() => setFiltro(t)} title="Filtrar por esta etiqueta">
                  🏷 {t}
                </button>
              ))}
            </div>
          )}

          <div className="muro-post-pie">
            <Reacciones pubId={p.id} reacciones={p.reacciones} userId={userId} />
          </div>

          {/* Comentarios */}
          <div className="muro-coments">
            {p.comentarios.map(c => (
              <div key={c.id} className="muro-coment">
                <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={26} src={c.autor?.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 12.5 }}>{c.autor?.nombre || "Alguien"}</b>
                    <span style={{ color: "var(--dim)", fontSize: 11 }}>{fecha(c.creado_en)}</span>
                  </div>
                  <ComentarioTexto comentarioId={c.id} pubId={p.id} cuerpo={c.cuerpo}
                    imagenes={c.imagenes || []} esMio={c.autor_id === userId} editadoEn={c.editado_en} />
                </div>
              </div>
            ))}
            <CajaComentario pubId={p.id} perfiles={perfiles} onSent={() => router.refresh()} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Editor inline de una nota del muro (texto + imágenes + etiquetas propias). */
function EditorNota({ post, proyectoId, entidadTipo = "proyecto", perfiles, sugerencias, onDone, onCancel }: {
  post: MuroPost; proyectoId: string; entidadTipo?: string; perfiles: Perfil[]; sugerencias: string[];
  onDone: () => void; onCancel: () => void;
}) {
  const [texto, setTexto] = useState(post.cuerpo || "");
  const [imgs, setImgs] = useState<string[]>(post.imagenes || []);
  const [tags, setTags] = useState<string[]>(post.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const { candidatos, aplicar } = menciones(texto, perfiles);

  const agregarTag = (t: string) => {
    const v = t.trim();
    if (v && !tags.includes(v)) setTags(prev => [...prev, v]);
    setTagInput("");
  };
  const sug = [...new Set([...sugerencias])].filter(t => !tags.includes(t)).sort();

  const guardar = async () => {
    if (guardando) return;
    if (!texto.trim() && !imgs.length) { setError("La nota no puede quedar vacía."); return; }
    setGuardando(true); setError("");
    const r: any = await editarBitacora(post.id, proyectoId, texto, imgs, tags, entidadTipo);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    onDone();
  };

  return (
    <div className="muro-editor" style={{ marginTop: 8 }}>
      <div style={{ position: "relative" }}>
        <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
        <textarea value={texto} rows={3} className="muro-textarea"
          onChange={e => setTexto(e.target.value)}
          onPaste={async e => {
            const files = imagenesDePaste(e); if (!files.length) return; e.preventDefault();
            pegar(files);
          }} />
      </div>
      <EditorImagenes imgs={imgs} setImgs={setImgs} onError={setError} />
      <div className="muro-tagsel">
        <span className="muro-tagsel-lbl">🏷 Etiquetas:</span>
        {tags.map(t => (
          <button key={t} type="button" className="muro-tag on" onClick={() => setTags(tags.filter(x => x !== t))} title="Quitar">{t} ✕</button>
        ))}
        <input value={tagInput} placeholder="+ etiqueta" className="muro-tag-input"
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregarTag(tagInput); } }} />
      </div>
      {sug.length > 0 && (
        <div className="muro-tagsel" style={{ marginTop: 4 }}>
          <span className="muro-tagsel-lbl" style={{ opacity: .7 }}>Sugeridas:</span>
          {sug.slice(0, 12).map(t => <button key={t} type="button" className="muro-tag" onClick={() => agregarTag(t)}>{t}</button>)}
        </div>
      )}
      {error && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel} disabled={guardando}>Cancelar</button>
        <button className="btn" onClick={guardar} disabled={guardando || (!texto.trim() && !imgs.length)}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

/* Caja para comentar una nota del muro. Mismo motor (`comentar`) y mismas
   menciones que en un caso — solo más compacta. */
function CajaComentario({ pubId, perfiles, onSent }: { pubId: string; perfiles: Perfil[]; onSent: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { candidatos, aplicar } = menciones(texto, perfiles);
  const enviar = async () => {
    if (enviando || !texto.trim()) return;
    setEnviando(true);
    const r: any = await comentar(pubId, texto.trim());
    setEnviando(false);
    if (r?.error) { alert(r.error); return; }
    setTexto(""); onSent();
  };
  return (
    <div className="muro-caja" style={{ position: "relative" }}>
      <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
      <input value={texto} placeholder="Comentar… (@nombre para invocar)"
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            if (candidatos.length) { e.preventDefault(); setTexto(aplicar(candidatos[0].nombre)); return; }
            e.preventDefault(); enviar();
          }
        }}
        className="muro-caja-input" />
      <button className="btn btn-ghost" disabled={enviando || !texto.trim()} onClick={enviar}
        style={{ padding: "6px 12px", fontSize: 12.5 }}>
        {enviando ? "…" : "Comentar"}
      </button>
    </div>
  );
}
