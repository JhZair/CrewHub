"use client";
import { useEffect, useState, type ReactNode } from "react";
import Plegable from "@/components/Plegable";

/* LISTA DE CASOS CON FILTROS Y VISTAS.
 *
 * Un perfil activo acumula decenas de casos (53 en el de John): apilados a
 * secas no se navegan. Las tarjetas las sigue pintando el servidor (dependen de
 * datos que solo viven allí: hijos, reacciones), así que aquí no se re-renderiza
 * nada — llega cada tarjeta ya hecha (`node`) con sus metadatos al lado
 * (estado, responsable, título), y este componente solo FILTRA y AGRUPA.
 *
 *   · Búsqueda por título.
 *   · Chips por estado y por responsable, con su conteo. Se acumulan.
 *   · Vista: Lista · Por estado · Por responsable. Agrupadas, cada grupo es
 *     plegable con memoria (el mismo plegado del resto de la app).
 *
 * La vista elegida se recuerda por ámbito (localStorage). Los filtros son de
 * la sesión: son para buscar algo ahora, no un estado permanente del perfil.
 */

export type CasoMeta = {
  id: string;
  titulo: string;
  rotulo: string;         // «Vigente», «Sin resolver», …
  clase: string;          // clase de estado, para el tinte del chip (est-*)
  resp: string | null;    // primer nombre del responsable
  mio?: boolean;          // soy el responsable (viewer)
  marca?: "delegado" | "mencion" | null;   // por qué me incumbe si no soy responsable
  node: ReactNode;        // la tarjeta ya renderizada en el servidor
};

export default function CasosLista({ casos, cerrados = [], ambitoId, misInicial = false }: {
  casos: CasoMeta[];
  /** Casos cerrados/archivados: no se listan de entrada, pero la BÚSQUEDA sí
   *  los alcanza (un caso resuelto sigue existiendo). */
  cerrados?: CasoMeta[];
  ambitoId: string;
  /** «Mis asuntos» encendido de entrada (tu propio perfil). */
  misInicial?: boolean;
}) {
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState<string | null>(null);
  const [fResp, setFResp] = useState<string | null>(null);
  const [vista, setVista] = useState<"lista" | "estado" | "resp">("lista");
  /* «Mis asuntos»: como el feed y el Kanban. Encendido → prendido lo que es mi
     responsabilidad y APAGADO lo que me incumbe pero trabaja otro. Arranca
     según `misInicial` y luego manda la memoria. */
  const [mis, setMis] = useState(misInicial);
  const nMios = casos.filter(c => c.mio).length;
  const hayMios = nMios > 0 && nMios < casos.length;   // solo tiene sentido si hay mezcla

  const llaveV = `casosvista:${ambitoId}`;
  const llaveM = `casosmis:${ambitoId}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(llaveV);
      if (v === "lista" || v === "estado" || v === "resp") setVista(v);
      const m = localStorage.getItem(llaveM);
      if (m === "1" || m === "0") setMis(m === "1");
    } catch { /* da igual */ }
  }, [llaveV, llaveM]);
  const ponerVista = (v: "lista" | "estado" | "resp") => {
    setVista(v);
    try { localStorage.setItem(llaveV, v); } catch { /* da igual */ }
  };
  const ponerMis = (v: boolean) => {
    setMis(v);
    try { localStorage.setItem(llaveM, v ? "1" : "0"); } catch { /* da igual */ }
  };
  // Cada tarjeta: prendida, o apagada (atenuada, se ilumina al pasar el cursor).
  // Solo se apaga si HAY mezcla (algunos míos y otros no); si no, no hay a qué
  // apagar y quedaría todo atenuado sin toggle para revertirlo.
  const pintar = (c: CasoMeta) => (mis && hayMios && !c.mio) ? (
    <div key={c.id} className="caso-apagado"
      title={c.marca === "delegado" ? "Lo delegaste — responde otro" : "No eres el responsable"}>
      {c.node}
    </div>
  ) : c.node;

  // Opciones con conteo, de mayor a menor.
  const cuentaPor = (sel: (c: CasoMeta) => string | null) => {
    const m = new Map<string, number>();
    for (const c of casos) { const k = sel(c); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const estados = cuentaPor(c => c.rotulo);
  const claseDe = new Map(casos.map(c => [c.rotulo, c.clase]));
  const resps = cuentaPor(c => c.resp);

  const term = q.trim().toLowerCase();
  const filtrados = casos.filter(c =>
    (!fEstado || c.rotulo === fEstado) &&
    (!fResp || c.resp === fResp) &&
    (!term || c.titulo.toLowerCase().includes(term)));
  // La búsqueda también alcanza las cerradas (un caso resuelto sigue existiendo).
  // Sin término, no se listan de entrada —viven en su propio bloque plegable—.
  const cerrFiltrados = cerrados.filter(c =>
    (!fResp || c.resp === fResp) &&
    (!term || c.titulo.toLowerCase().includes(term)));
  const hayFiltro = !!(fEstado || fResp || term);
  const limpiar = () => { setFEstado(null); setFResp(null); setQ(""); };

  // Agrupación para las vistas por estado / responsable.
  const grupos = (() => {
    if (vista === "lista") return null;
    const sel = vista === "estado" ? (c: CasoMeta) => c.rotulo : (c: CasoMeta) => c.resp || "— sin responsable —";
    const m = new Map<string, CasoMeta[]>();
    for (const c of filtrados) { const k = sel(c); if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  })();

  return (
    <div>
      <div className="cf-bar">
        <input className="cf-search" placeholder="🔎 Buscar por título…"
          value={q} onChange={e => setQ(e.target.value)} />
        {hayMios && (
          <button className={`cf-mis ${mis ? "on" : ""}`} onClick={() => ponerMis(!mis)}
            title="Prende lo que es tu responsabilidad y apaga lo que trabaja otro">
            🙋 Mis asuntos{mis ? ` · ${nMios}` : ""}
          </button>
        )}
        <div className="rhe-vistas">
          <button className={vista === "lista" ? "on" : ""} onClick={() => ponerVista("lista")}>Lista</button>
          <button className={vista === "estado" ? "on" : ""} onClick={() => ponerVista("estado")}>Por estado</button>
          <button className={vista === "resp" ? "on" : ""} onClick={() => ponerVista("resp")}>Por responsable</button>
        </div>
      </div>

      {estados.length > 1 && (
        <div className="cf-chips">
          {estados.map(([r, n]) => (
            <button key={r} className={`cf-chip st-${claseDe.get(r) || ""} ${fEstado === r ? "on" : ""}`}
              onClick={() => setFEstado(fEstado === r ? null : r)}>{r} · {n}</button>
          ))}
        </div>
      )}
      {resps.length > 1 && (
        <div className="cf-chips">
          <span className="cf-lbl">👤 responsable</span>
          {resps.map(([r, n]) => (
            <button key={r} className={`cf-chip ${fResp === r ? "on" : ""}`}
              onClick={() => setFResp(fResp === r ? null : r)}>{r} · {n}</button>
          ))}
        </div>
      )}

      <div className="cf-count">
        Mostrando <b style={{ color: "var(--text)" }}>{filtrados.length}</b> de {casos.length}
        {hayFiltro && <button className="cf-clear" onClick={limpiar}>✕ limpiar filtros</button>}
      </div>

      {filtrados.length === 0 ? (
        <div className="empty" style={{ padding: "18px 0" }}>
          {term && cerrFiltrados.length > 0
            ? <>Ningún caso <b>activo</b> con «{q.trim()}». Pero hay {cerrFiltrados.length} entre las cerradas ↓</>
            : "Nada coincide con esos filtros."}
        </div>
      ) : vista === "lista" ? (
        filtrados.map(pintar)
      ) : (
        (grupos || []).map(([k, items]) => (
          <Plegable key={k} nivel={2} abiertoPorDefecto id={`casosgrp:${ambitoId}:${vista}:${k}`}
            titulo={k}
            resumen={<span style={{ fontWeight: 700, color: "var(--muted)" }}>{items.length}</span>}>
            {items.map(pintar)}
          </Plegable>
        ))
      )}

      {/* Cerradas y archivadas. Buscando, salen las coincidencias directo (para
          eso está la búsqueda); sin buscar, quedan tras un plegable. */}
      {cerrados.length > 0 && (
        term ? (
          cerrFiltrados.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="cf-cerr-h">🗄 En cerradas y archivadas · {cerrFiltrados.length}</div>
              {cerrFiltrados.map(c => c.node)}
            </div>
          )
        ) : (
          <details style={{ marginTop: 16 }}>
            <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
              ✅ Cerradas y archivadas · {cerrados.length}
            </summary>
            <div style={{ marginTop: 10 }}>{cerrados.map(c => c.node)}</div>
          </details>
        )
      )}
    </div>
  );
}
