"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Miniatura from "@/components/Miniatura";
import { icoObjeto, lblObjeto } from "@/lib/objetos";
import { previewCandidates } from "@/lib/drive";
import { ordenarDestacados, destacarBitacora, destacarObjeto } from "@/app/actions";

/* 📌 DESTACADOS DEL MURO — lo importante del proyecto, a la mano en el carné.
   Mezcla notas del muro y material del repositorio; se reordena arrastrando y
   se quita con la chincheta. El orden se guarda (destacado_orden).
   Cuando hay destacados de OTROS muros (los que el usuario dejó por el sistema),
   se agrupan por su muro de origen; cada grupo se pliega y recuerda su estado. */
type Fuente = { tipo: string; id: string; nombre: string } | null;
export type Destacado =
  | { kind: "post"; id: string; cuerpo?: string | null; imagen?: string | null; nImgs?: number; fecha?: string | null; tag?: string | null; fuente?: Fuente }
  | { kind: "obj"; id: string; titulo: string; tipo: string; url?: string | null; fecha?: string | null; fuente?: Fuente };

const ICO_ENT: Record<string, string> = { proyecto: "📁", empresa: "🏢", persona: "👤" };
const idDe = (d: Destacado) => `${d.kind}:${d.id}`;
const AQUI = "__aqui__";

export default function DestacadosMuro({ entidadTipo, entidadId, entidadNombre, items }: {
  entidadTipo: string; entidadId: string; entidadNombre?: string; items: Destacado[];
}) {
  const router = useRouter();
  const [lista, setLista] = useState<Destacado[]>(items);
  /* Re-sincroniza con el server cuando el destacado cambia DESDE FUERA (el 📌 de
     una nota o material en el muro hace router.refresh, pero no remonta esto). */
  useEffect(() => { setLista(items); }, [items]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [sobreId, setSobreId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Memoria de grupos plegados (por entidad). Guarda las claves CERRADAS.
  const memKey = `dest-fold:${entidadTipo}:${entidadId}`;
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const raw = localStorage.getItem(memKey); if (raw) setPlegados(new Set(JSON.parse(raw))); } catch {}
  }, [memKey]);
  const togglePleg = (key: string) => setPlegados(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key);
    try { localStorage.setItem(memKey, JSON.stringify([...n])); } catch {}
    return n;
  });

  // Agrupa por muro de origen, conservando el orden de aparición. El grupo
  // «aquí» (notas nativas + material propio) va siempre primero.
  const grupos = useMemo(() => {
    const orden: string[] = [];
    const map = new Map<string, { key: string; fuente: Fuente; items: Destacado[] }>();
    for (const d of lista) {
      const f = d.fuente || null;
      const key = f ? `${f.tipo}:${f.id}` : AQUI;
      if (!map.has(key)) { map.set(key, { key, fuente: f, items: [] }); orden.push(key); }
      map.get(key)!.items.push(d);
    }
    orden.sort((a, b) => (a === AQUI ? -1 : b === AQUI ? 1 : 0));
    return orden.map(k => map.get(k)!);
  }, [lista]);

  const soltar = async (targetId: string) => {
    const from = dragId;
    setDragId(null); setSobreId(null);
    if (!from || from === targetId) return;
    // Solo reordena DENTRO del mismo grupo (la fuente es propiedad del ítem).
    const gi = grupos.findIndex(g => g.items.some(x => idDe(x) === from));
    const gj = grupos.findIndex(g => g.items.some(x => idDe(x) === targetId));
    if (gi < 0 || gi !== gj) return;
    const items = [...grupos[gi].items];
    const fromIdx = items.findIndex(x => idDe(x) === from);
    const toIdx = items.findIndex(x => idDe(x) === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [mov] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, mov);
    const nueva = grupos.flatMap((g, k) => (k === gi ? items : g.items));
    setLista(nueva);                       // optimista
    setGuardando(true);
    await ordenarDestacados(entidadTipo, entidadId, nueva.map(d => ({ kind: d.kind, id: d.id })));
    setGuardando(false);
    router.refresh();
  };

  const quitar = async (d: Destacado) => {
    setLista(l => l.filter(x => !(x.kind === d.kind && x.id === d.id)));   // optimista
    if (d.kind === "post") await destacarBitacora(d.id, entidadId, false, entidadTipo);
    else await destacarObjeto(d.id, entidadTipo, entidadId, false);
    router.refresh();
  };

  if (lista.length === 0) return null;
  // Agrupa cuando hay más de una fuente, o cuando el único grupo es de OTRO muro
  // (así no se pierde de dónde viene). Todo propio → lista plana, sin cabeceras.
  const agrupar = grupos.length > 1 || (grupos.length === 1 && grupos[0].key !== AQUI);

  const filaItem = (d: Destacado) => (
    <div key={idDe(d)} className={`dest-item ${sobreId === idDe(d) ? "sobre" : ""} ${dragId === idDe(d) ? "arrastrando" : ""}`}
      onDragOver={e => { e.preventDefault(); if (sobreId !== idDe(d)) setSobreId(idDe(d)); }}
      onDrop={e => { e.preventDefault(); soltar(idDe(d)); }}>
      <span className="dest-agarre" title="Arrastra para reordenar"
        draggable onDragStart={() => setDragId(idDe(d))}
        onDragEnd={() => { setDragId(null); setSobreId(null); }}>⋮⋮</span>
      {d.kind === "post" ? <PostMini d={d} /> : <ObjMini d={d} />}
      <button className="dest-quitar" title="Quitar de destacados" onClick={() => quitar(d)}>📌</button>
    </div>
  );

  return (
    <div className="card" style={{ marginTop: 14, padding: "12px 14px" }}>
      <div className="panel-h" style={{ color: "var(--violet)", display: "flex", alignItems: "center", gap: 6 }}>
        📌 Destacados del muro
        {guardando && <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 400 }}>· guardando…</span>}
      </div>

      {!agrupar ? (
        <div className="dest-lista">{lista.map(filaItem)}</div>
      ) : (
        <div className="dest-grupos">
          {grupos.map(g => {
            const propio = g.key === AQUI;
            const ico = propio ? (ICO_ENT[entidadTipo] || "📌") : (ICO_ENT[g.fuente!.tipo] || "📌");
            const nombre = propio ? (entidadNombre ? `En ${entidadNombre}` : "En este carné") : g.fuente!.nombre;
            const cerrado = plegados.has(g.key);
            return (
              <div key={g.key} className={`dest-grupo ${propio ? "propio" : ""}`}>
                <button type="button" className="dest-grupo-h" onClick={() => togglePleg(g.key)} aria-expanded={!cerrado}>
                  <span className={`plg-caret ${cerrado ? "" : "abierto"}`}>▸</span>
                  <span className="dest-grupo-ico">{ico}</span>
                  <span className="dest-grupo-nom" title={nombre}>{nombre}</span>
                  <span className="dest-grupo-n">{g.items.length}</span>
                </button>
                {!cerrado && <div className="dest-lista">{g.items.map(filaItem)}</div>}
              </div>
            );
          })}
        </div>
      )}
      <div className="dest-ayuda">Arrastra para ordenar · 📌 para quitar</div>
    </div>
  );
}

function PostMini({ d }: { d: Extract<Destacado, { kind: "post" }> }) {
  const soloImg = !!d.imagen && !(d.cuerpo || "").trim();
  return (
    <div className={`muro-dest dest-cuerpo ${soloImg ? "solo-img" : ""}`} style={{ margin: 0, flex: 1, minWidth: 0 }}>
      {d.imagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagen} alt="" referrerPolicy="no-referrer" className="muro-dest-img" />
      )}
      {(d.cuerpo || "").trim() && <div className="muro-dest-txt">{d.cuerpo}</div>}
      <div className="muro-dest-fecha">
        {d.fecha || ""}
        {d.tag ? ` · 🏷 ${d.tag}` : ""}
        {d.nImgs && d.nImgs > 1 ? ` · 🖼 ${d.nImgs}` : ""}
      </div>
    </div>
  );
}

function ObjMini({ d }: { d: Extract<Destacado, { kind: "obj" }> }) {
  const thumb = d.url && previewCandidates(d.url, 200).length
    ? <Miniatura url={d.url} size={40} alt={d.titulo} />
    : <span className="dest-obj-tile">{icoObjeto(d.tipo)}</span>;
  return (
    <Link href={`/objeto/${d.id}`} className="dest-obj" draggable={false} style={{ flex: 1, minWidth: 0 }}>
      <span style={{ flex: "none", lineHeight: 0 }}>{thumb}</span>
      <span style={{ minWidth: 0 }}>
        <span className="dest-obj-tit">{d.titulo}</span>
        <span className="dest-obj-tipo">📚 {lblObjeto(d.tipo)}{d.fecha ? ` · ${d.fecha}` : ""}</span>
      </span>
    </Link>
  );
}
