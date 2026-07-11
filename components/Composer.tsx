"use client";
import { crearPublicacion, crearEtiqueta, crearLugar, type Vinculo } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TIPOS = [
  ["aviso", "📢 Aviso"], ["tarea", "✅ Tarea"], ["problema", "❗ Problema"],
  ["pago", "💰 Pago"], ["idea", "💡 Idea"], ["archivo", "📎 Archivo"],
];

export type CatalogoItem = { id: string; nombre: string; tipo?: string };

const GRUPOS_PERSONA: [string, string][] = [
  ["personal", "— Equipo Kawsay —"],
  ["colaborador", "— Colaboradores —"],
  ["independiente", "— Independientes —"],
  ["entidad_financiera", "— Entidades —"],
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
};

const ENT_META: Record<string, string> = {
  proyecto: "📁 Proyecto", empresa: "🏢 Empresa", persona: "👤 Persona",
  convocatoria: "📜 Convocatoria", postulacion: "🎯 Postulación",
  equipamiento: "🎥 Equipo", lugar: "📍 Lugar", etiqueta: "🏷️ Etiqueta",
};

type Sel = Vinculo & { nombre: string };

/* Buscador desplegable para entidades: filtra mientras escribes */
export function EntPicker({ etiqueta, items, onPick, onCrear }: {
  etiqueta: string; items: CatalogoItem[];
  onPick: (id: string) => void; onCrear?: (nombre: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = filtro ? items.filter(i => nrm(i.nombre).includes(nrm(filtro))) : items;
  const cerrar = () => { setAbierto(false); setFiltro(""); };

  return (
    <span className="cbx">
      <button type="button" className="ent-btn" onClick={() => setAbierto(!abierto)}>
        {etiqueta} ▾
      </button>
      {abierto && (
        <>
          <div className="cbx-fondo" onClick={cerrar} />
          <div className="cbx-menu">
            <input autoFocus className="cbx-inp" placeholder="Buscar..." value={filtro}
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
                  <span style={{ flex: 1, textAlign: "left" }}>{i.nombre}</span>
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

export default function Composer({ userId, catalogos, perfiles, inicial }:
  { userId: string; catalogos: Catalogos; perfiles: { id: string; nombre: string }[]; inicial?: Sel[] }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [tipo, setTipo] = useState("aviso");
  const [resp, setResp] = useState("");
  const [fecha, setFecha] = useState("");
  const [links, setLinks] = useState<Sel[]>(inicial || []);
  const [extraEtq, setExtraEtq] = useState<CatalogoItem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

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
      fecha || null
    );
    setEnviando(false);
    if (res?.error) { alert("Error al publicar: " + res.error); return; }
    setTitulo(""); setCuerpo(""); setLinks([]); setResp(""); setFecha("");
    router.refresh();
  };

  return (
    <div className="composer">
      <input
        placeholder="¿Qué quieres compartir con tu equipo?"
        value={titulo}
        onChange={e => setTitulo(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !cuerpo) publicar(); }}
      />
      {titulo && (
        <textarea
          placeholder="Descripción (opcional)"
          rows={3}
          value={cuerpo}
          onChange={e => setCuerpo(e.target.value)}
        />
      )}
      <div className="tipos">
        {TIPOS.map(([v, l]) => (
          <button key={v} className={`tipo-chip ${tipo === v ? "sel" : ""}`} onClick={() => setTipo(v)}>
            {l}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={!titulo.trim() || enviando} onClick={publicar}>
          {enviando ? "Publicando..." : "Publicar"}
        </button>
      </div>

      <div className="meta-bar">
        <div className="meta-linea">
          <span className="ent-lbl">👤 Responsable</span>
          <select className="ent-ctrl" style={resp ? { borderColor: "var(--teal)", color: "var(--teal)" } : undefined}
            value={resp} onChange={e => setResp(e.target.value)}>
            <option value="">Sin asignar</option>
            {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <span className="ent-lbl" style={{ marginLeft: 14 }}>⏱ Vence</span>
          <input type="date" className="ent-ctrl"
            style={fecha ? { borderColor: "var(--yellow)", color: "var(--yellow)" } : undefined}
            value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="meta-linea">
          <span className="ent-lbl">🔗 Vincular</span>
          {Object.keys(ENT_META).map(t => (
            <EntPicker key={t} etiqueta={ENT_META[t]} items={itemsDe(t)}
              onPick={id => agregar(t, id)}
              onCrear={t === "etiqueta" ? crearYAgregarEtiqueta
                : t === "lugar" ? crearYAgregarLugar : undefined} />
          ))}
        </div>
      </div>
      {links.length > 0 && (
        <div className="sel-chips">
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
