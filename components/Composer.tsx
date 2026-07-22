"use client";
import { crearPublicacion, crearEtiqueta, crearLugar, type Vinculo } from "@/app/actions";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { coincideQ } from "@/lib/quechua";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MiniSelect from "@/components/MiniSelect";

const TIPOS = [
  ["tarea", "✅ Tarea"], ["problema", "❗ Problema"], ["consulta", "❓ Consulta"],
  ["pago", "💰 Pago"], ["idea", "💡 Idea"], ["archivo", "📎 Archivo"],
  ["aviso", "📢 Aviso"],
];

/* `sub`: la coletilla que ayuda a distinguir pero no es el nombre — el alias de
   una persona, el año de una postulación. Va apagada al lado del nombre y se
   busca igual que él: apagar algo no es esconderlo. */
export type CatalogoItem = { id: string; nombre: string; tipo?: string; sub?: string };

const GRUPOS_PERSONA: [string, string][] = [
  ["personal", "— Equipo Kawsay —"],
  ["colaborador", "— Colaboradores —"],
  ["independiente", "— Independientes —"],
  ["contacto", "— Contactos —"],
];
export type Catalogos = {
  proyecto: CatalogoItem[];
  empresa: CatalogoItem[];
  persona: CatalogoItem[];
  convocatoria: CatalogoItem[];
  postulacion?: CatalogoItem[];
  equipamiento: CatalogoItem[];
  lugar: CatalogoItem[];
  etiqueta: CatalogoItem[];
  objeto?: CatalogoItem[];
};

const ENT_META: Record<string, string> = {
  proyecto: "📁 Proyecto", empresa: "🏢 Empresa", persona: "👤 Persona",
  postulacion: "🎯 Postulación", equipamiento: "🎥 Equipo", convocatoria: "📜 Convocatoria",
  lugar: "📍 Lugar", etiqueta: "🏷️ Etiqueta",
  /* Solo el ícono: la franja ya va llena y «Repositorio» no cabe sin partirla
     en dos líneas. Es también el vínculo menos frecuente —se enlaza material
     cuando un caso trata sobre él—, así que puede pedir un clic de curiosidad
     en vez de ocupar sitio permanente. El tooltip dice qué es. */
  objeto: "📚",
};
/* El nombre largo para cuando hay sitio: tooltip del botón y chips ya puestos. */
const ENT_TITULO: Record<string, string> = { objeto: "📚 Repositorio" };

type Sel = Vinculo & { nombre: string };

/* Buscador desplegable para entidades: filtra mientras escribes */
/* Como EntPicker pero de selección MÚLTIPLE: checkboxes + un botón que confirma
   todos los elegidos de una vez (para vincular una tanda al caso). */
export function MultiPicker({ etiqueta, items, onConfirm, ocupado }: {
  etiqueta: string; items: CatalogoItem[]; onConfirm: (ids: string[]) => void; ocupado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = nrm(filtro).split(/\s+/).filter(Boolean);
  // Igual que el picker individual: se busca por nombre Y por coletilla, o en
  // la misma bandeja uno encuentra a una persona por su alias y el otro no.
  const lista = palabras.length
    ? items.filter(i => coincideQ(`${i.nombre} ${i.sub || ""}`, palabras))
    : items;
  const cerrar = () => { setAbierto(false); setFiltro(""); setSel(new Set()); };
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const confirmar = () => { if (sel.size) onConfirm([...sel]); cerrar(); };

  return (
    <span className="cbx">
      <button type="button" className="ent-btn" onClick={() => setAbierto(!abierto)}>
        {etiqueta} ▾
      </button>
      {abierto && (
        <>
          <div className="cbx-fondo" onClick={cerrar} />
          <div className="cbx-menu">
            <input autoFocus className="cbx-inp" placeholder="Buscar y marcar varias..." value={filtro}
              onChange={e => setFiltro(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") cerrar(); }} />
            <div className="cbx-lista">
              {lista.slice(0, 80).map(i => (
                <button key={i.id} type="button" className={`cbx-item ${sel.has(i.id) ? "on" : ""}`} onClick={() => toggle(i.id)}>
                  <span className="cbx-check">{sel.has(i.id) ? "☑" : "☐"}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {i.nombre}{i.sub && <i className="cbx-sub">{i.sub}</i>}
                  </span>
                  {i.tipo && <span className="cbx-tag">{i.tipo.replace(/_/g, " ")}</span>}
                </button>
              ))}
              {!lista.length && !filtro && <div className="cbx-vacio">Escribe para buscar</div>}
              {!lista.length && filtro && <div className="cbx-vacio">Sin resultados</div>}
              {lista.length > 80 && <div className="cbx-vacio">+{lista.length - 80} más — afina la búsqueda</div>}
            </div>
            <div className="cbx-pie">
              <span style={{ color: "var(--dim)", fontSize: 12 }}>{sel.size} elegida{sel.size === 1 ? "" : "s"}</span>
              <button type="button" className="btn" style={{ padding: "5px 12px", fontSize: 12 }}
                disabled={!sel.size || ocupado} onClick={confirmar}>
                {ocupado ? "..." : `Vincular ${sel.size || ""}`.trim()}
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

export function EntPicker({ etiqueta, items, onPick, onCrear, titulo }: {
  etiqueta: string; items: CatalogoItem[];
  onPick: (id: string) => void; onCrear?: (nombre: string) => void;
  /** Nombre completo para el tooltip, cuando el botón va solo con ícono. */
  titulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Búsqueda por palabras + fonética quechua: "mujunacuy" encuentra "Mujunakuy"
  const palabras = nrm(filtro).split(/\s+/).filter(Boolean);
  // Se busca por nombre Y por coletilla: «faure» y «FaureDueñas» encuentran.
  const lista = palabras.length
    ? items.filter(i => coincideQ(`${i.nombre} ${i.sub || ""}`, palabras))
    : items;
  const cerrar = () => { setAbierto(false); setFiltro(""); };

  return (
    <span className="cbx">
      {/* `ent-solo`: el que va con ícono nada más se aprieta un poco. */}
      <button type="button" className={`ent-btn ${titulo ? "ent-solo" : ""}`}
        onClick={() => setAbierto(!abierto)} title={titulo || etiqueta}>
        {etiqueta} ▾
      </button>
      {abierto && (
        <>
          <div className="cbx-fondo" onClick={cerrar} />
          <div className="cbx-menu">
            {/* Solo se personaliza cuando el botón trae `titulo` —es decir,
                cuando va con ícono solo y el placeholder es la única pista—.
                Derivarlo de `etiqueta` salía mal: en media docena de pickers
                esa etiqueta lleva el valor ya elegido («👤 María Quispe») o
                una pregunta («¿A quién?»), y el placeholder los repetía. */}
            <input autoFocus className="cbx-inp"
              placeholder={titulo ? `Buscar en ${titulo.replace(/^\S+\s*/, "")}` : "Buscar..."}
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") cerrar();
                if (e.key === "Enter" && lista.length >= 1) { onPick(lista[0].id); cerrar(); }
              }} />
            <div className="cbx-lista">
              {onCrear && filtro.trim() && !lista.some(i => nrm(i.nombre) === nrm(filtro)) && (
                <button className="cbx-item cbx-crear" onClick={() => { onCrear(filtro.trim()); cerrar(); }}>
                  ＋ Crear «{filtro.trim()}»
                </button>
              )}
              {lista.slice(0, 40).map(i => (
                <button key={i.id} className="cbx-item" onClick={() => { onPick(i.id); cerrar(); }}>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {i.nombre}{i.sub && <i className="cbx-sub">{i.sub}</i>}
                  </span>
                  {i.tipo && <span className="cbx-tag">{i.tipo.replace(/_/g, " ")}</span>}
                </button>
              ))}
              {!lista.length && !filtro && <div className="cbx-vacio">Escribe para buscar</div>}
              {!lista.length && filtro && !onCrear && <div className="cbx-vacio">Sin resultados</div>}
              {lista.length > 40 && <div className="cbx-vacio">+{lista.length - 40} más — afina la búsqueda</div>}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

export default function Composer({ userId, catalogos, perfiles, inicial, onListo }:
  { userId: string; catalogos: Catalogos; perfiles: { id: string; nombre: string }[]; inicial?: Sel[]; onListo?: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);

  // Auto-crecer la descripción con el texto (hasta 220px; luego scroll)
  useEffect(() => {
    const el = cuerpoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [cuerpo, titulo]);
  const [tipo, setTipo] = useState("tarea");
  const [resp, setResp] = useState("");
  const [fecha, setFecha] = useState("");
  const [links, setLinks] = useState<Sel[]>(inicial || []);
  const [extraEtq, setExtraEtq] = useState<CatalogoItem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [imgs, setImgs] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const router = useRouter();

  const subir = async (files: File[]) => {
    if (!files.length || subiendo) return;
    setSubiendo(true);
    for (const f of files.slice(0, 6 - imgs.length)) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
    setSubiendo(false);
  };

  const itemsDe = (t: string): CatalogoItem[] =>
    t === "etiqueta" ? [...catalogos.etiqueta, ...extraEtq]
    : t === "lugar" ? [...catalogos.lugar, ...extraLug]
    : (catalogos as any)[t] || [];

  const agregar = (t: string, id: string) => {
    if (!id || links.some(l => l.tipo === t && l.id === id)) return;
    const item = itemsDe(t).find(x => x.id === id);
    if (item) setLinks([...links, { tipo: t, id, nombre: item.nombre }]);
  };

  const crearYAgregarEtiqueta = async (nombre: string) => {
    const res: any = await crearEtiqueta(nombre);
    if (res?.error) { alert(res.error); return; }
    if (!extraEtq.some(x => x.id === res.id) && !catalogos.etiqueta.some(x => x.id === res.id))
      setExtraEtq(prev => [...prev, { id: res.id, nombre: res.nombre }]);
    setLinks(prev => prev.some(l => l.tipo === "etiqueta" && l.id === res.id)
      ? prev : [...prev, { tipo: "etiqueta", id: res.id, nombre: res.nombre }]);
  };

  const [extraLug, setExtraLug] = useState<CatalogoItem[]>([]);
  const crearYAgregarLugar = async (nombre: string) => {
    const res: any = await crearLugar(nombre);
    if (res?.error) { alert(res.error); return; }
    if (!extraLug.some(x => x.id === res.id) && !catalogos.lugar.some(x => x.id === res.id))
      setExtraLug(prev => [...prev, { id: res.id, nombre: res.nombre }]);
    setLinks(prev => prev.some(l => l.tipo === "lugar" && l.id === res.id)
      ? prev : [...prev, { tipo: "lugar", id: res.id, nombre: res.nombre }]);
  };
  const quitar = (t: string, id: string) =>
    setLinks(links.filter(l => !(l.tipo === t && l.id === id)));

  const publicar = async () => {
    if (!titulo.trim() || enviando) return;
    setEnviando(true);
    const res = await crearPublicacion(
      tipo, titulo.trim(), cuerpo.trim(),
      links.map(({ tipo: t, id }) => ({ tipo: t, id })),
      resp || null,
      fecha || null,
      imgs
    );
    setEnviando(false);
    if (res?.error) { alert("Error al publicar: " + res.error); return; }
    setTitulo(""); setCuerpo(""); setLinks([]); setResp(""); setFecha(""); setImgs([]);
    router.refresh();
    onListo?.();
  };

  return (
    <div className="composer">
      <input
        placeholder="¿Qué quieres compartir con tu equipo?"
        value={titulo}
        onChange={e => setTitulo(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !cuerpo) publicar(); }}
        onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
      />
      {titulo && (
        <textarea
          ref={cuerpoRef}
          placeholder="Descripción (opcional) — también puedes pegar un pantallazo con Ctrl+V"
          rows={2}
          value={cuerpo}
          onChange={e => setCuerpo(e.target.value)}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
          style={{ resize: "none", overflowY: "auto", maxHeight: 220, lineHeight: 1.4 }}
        />
      )}
      {(imgs.length > 0 || subiendo) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          {imgs.map((u, i) => (
            <span key={i} style={{ position: "relative" }}>
              <img src={u} alt="" style={{ height: 74, borderRadius: 9, border: "1px solid var(--border)" }} />
              <button onClick={() => setImgs(imgs.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: -6, right: -6, background: "var(--panel)", border: "1px solid var(--border2)", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "var(--red)", cursor: "pointer", lineHeight: 1 }}>×</button>
            </span>
          ))}
          {subiendo && <span style={{ color: "var(--dim)", fontSize: 12, alignSelf: "center" }}>subiendo…</span>}
        </div>
      )}
      <div className="tipos">
        {TIPOS.map(([v, l]) => (
          <button key={v} className={`tipo-chip ${tipo === v ? "sel" : ""}`} onClick={() => setTipo(v)}>
            {l}
          </button>
        ))}
        <span className="tipos-acc">
          <label className="tipo-chip" title="Adjuntar imagen o pantallazo" style={{ cursor: "pointer" }}>
            📷
            <input type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </label>
          <button className="btn" disabled={!titulo.trim() || enviando || subiendo} onClick={publicar}>
            {enviando ? "Publicando..." : "Publicar"}
          </button>
        </span>
      </div>

      <div className="meta-bar">
        <div className="meta-linea">
          {/* 🙋, no 👤: el 👤 es la persona VINCULADA (ICO_ENT.persona, el
              picker de la bandeja de abajo) y aquí se elige a quien LLEVA el
              caso. Son dos cosas y tenían el mismo ícono, en la misma
              pantalla, a veinte líneas de distancia. 🙋 es el glifo que el
              sistema ya usaba para esto en el feed, el tablero y /pulso. */}
          <span className="ent-lbl" title="Responsable" style={{ minWidth: "auto" }}>🙋</span>
          <MiniSelect
            value={resp}
            options={[["", "Sin asignar"], ...perfiles.map(p => [p.id, p.nombre])]}
            onSelect={setResp}
            buttonClass="ent-ctrl"
            buttonStyle={{ height: 34, padding: "0 11px", boxSizing: "border-box", fontSize: 12.5, borderRadius: 9, minWidth: 132, ...(resp ? { borderColor: "var(--teal)", color: "var(--teal)" } : {}) }}
          />
          <span className="ent-lbl" title="Fecha límite" style={{ marginLeft: 14, minWidth: "auto" }}>📅</span>
          <input type="date" className="ent-ctrl"
            style={{ height: 34, minHeight: 34, maxHeight: 34, width: 150, minWidth: 150, padding: "0 10px", margin: 0, boxSizing: "border-box", fontSize: 12.5, fontFamily: "inherit", lineHeight: "32px", borderRadius: 9, ...(fecha ? { borderColor: "var(--yellow)", color: "var(--yellow)" } : {}) }}
            value={fecha} onChange={e => setFecha(e.target.value)} />
          {/* la etiqueta no es entidad: vive aquí como chip */}
          <span className="etq-pick" style={{ marginLeft: 14 }}>
            <EntPicker etiqueta="🏷️ Etiqueta" items={itemsDe("etiqueta")}
              onPick={id => agregar("etiqueta", id)} onCrear={crearYAgregarEtiqueta} />
          </span>
        </div>
        {/* La MISMA bandeja que la ficha del caso, y por tanto la misma que
            el FAB «+» —que monta este Composer—. Vincular se ve igual en los
            tres sitios donde se vincula: `.bandeja-vinc` en globals. */}
        <div className="meta-linea bandeja-vinc">
          {/* Sin el «+»: la fila cabe justa y el signo no aportaba —los botones
              de al lado ya son la acción—. */}
          <span className="vinc-add-lbl">vincular</span>
          {Object.keys(ENT_META)
            .filter(t => t !== "etiqueta")
            // Sin objetos cargados no se pinta un botón que abre una lista vacía
            .filter(t => t !== "objeto" || itemsDe("objeto").length > 0)
            .map(t => (
              <EntPicker key={t} etiqueta={ENT_META[t]} titulo={ENT_TITULO[t]} items={itemsDe(t)}
                onPick={id => agregar(t, id)}
                onCrear={t === "lugar" ? crearYAgregarLugar : undefined} />
            ))}
        </div>
      </div>
      {/* `vinc-puestos`: los vínculos ya puestos pesan un punto más que la
          bandeja de la que salieron. Misma clase que la ficha del caso — el
          motivo es el mismo, así que la regla es la misma. */}
      {links.length > 0 && (
        <div className="sel-chips vinc-puestos">
          {links.map(l => (
            <span key={l.tipo + l.id} className="echip">
              {ENT_META[l.tipo].split(" ")[0]} {l.nombre}
              <button className="x" onClick={() => quitar(l.tipo, l.id)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
