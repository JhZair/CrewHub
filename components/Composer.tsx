"use client";
import { crearPublicacion, type Vinculo } from "@/app/actions";
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
  equipamiento: CatalogoItem[];
  lugar: CatalogoItem[];
  etiqueta: CatalogoItem[];
};

const ENT_META: Record<string, string> = {
  proyecto: "📁 Proyecto", empresa: "🏢 Empresa", persona: "👤 Persona",
  convocatoria: "📜 Convocatoria", equipamiento: "🎥 Equipo",
  lugar: "📍 Lugar", etiqueta: "🏷️ Etiqueta",
};

type Sel = Vinculo & { nombre: string };

export default function Composer({ userId, catalogos, perfiles }:
  { userId: string; catalogos: Catalogos; perfiles: { id: string; nombre: string }[] }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [tipo, setTipo] = useState("aviso");
  const [resp, setResp] = useState("");
  const [fecha, setFecha] = useState("");
  const [links, setLinks] = useState<Sel[]>([]);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  const agregar = (t: string, id: string) => {
    if (!id) return;
    if (links.some(l => l.tipo === t && l.id === id)) return;
    const item = (catalogos as any)[t]?.find((x: CatalogoItem) => x.id === id);
    if (item) setLinks([...links, { tipo: t, id, nombre: item.nombre }]);
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

      <div className="ent-bar">
        <span className="ent-lbl">RESPONSABLE:</span>
        <select className="ent-select" style={{ borderStyle: "solid", borderColor: resp ? "var(--teal)" : "var(--border2)" }}
          value={resp} onChange={e => setResp(e.target.value)}>
          <option value="">→ Sin asignar</option>
          {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <span className="ent-lbl" style={{ marginLeft: 8 }}>VENCE:</span>
        <input type="date" className="ent-select"
          style={{ borderStyle: "solid", borderColor: fecha ? "var(--yellow)" : "var(--border2)" }}
          value={fecha} onChange={e => setFecha(e.target.value)} />
        <span className="ent-lbl" style={{ marginLeft: 8 }}>VINCULAR:</span>
        {Object.keys(ENT_META).map(t => (
          <select key={t} className="ent-select" value="" onChange={e => agregar(t, e.target.value)}>
            <option value="">{ENT_META[t]}</option>
            {t === "persona"
              ? GRUPOS_PERSONA.map(([g, label]) => {
                  const grupo = (catalogos.persona || []).filter(p => (p.tipo || "contacto") === g);
                  return grupo.length ? (
                    <optgroup key={g} label={label}>
                      {grupo.map(it => <option key={it.id} value={it.id}>{it.nombre}</option>)}
                    </optgroup>
                  ) : null;
                })
              : ((catalogos as any)[t] || []).map((it: CatalogoItem) => (
                  <option key={it.id} value={it.id}>{it.nombre}</option>
                ))}
          </select>
        ))}
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
