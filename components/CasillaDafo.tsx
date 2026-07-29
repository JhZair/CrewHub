"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { hace } from "@/lib/notificaciones";
import { linkGmail, soloNombre, diasDesde, ORIGEN_VINCULO } from "@/lib/casilla";
import { marcarComunicacion, vincularComunicacion, casoDeComunicacion } from "@/app/casilla/acciones";

/* La lista de la casilla. Cliente porque cada fila hace tres cosas —marcar,
   vincular, abrir caso— y ninguna merece recargar la página entera.

   Dos secciones y no cinco: SIN LEER (lo que pide tu atención hoy) y el
   HISTORIAL agrupado por postulación (lo que se viene a buscar meses después,
   cuando hay que probar qué dijo DAFO y cuándo). */

type Com = {
  id: string;
  gmail_thread_id: string | null;
  buzon: string | null;
  cuenta: string | null;
  remitente: string | null;
  asunto: string | null;
  extracto: string | null;
  recibido_en: string;
  vinculo_por: string | null;
  pide_accion: boolean | null;
  leido_en: string | null;
  caso_id: string | null;
  postulacion_id: string | null;
  post?: { id: string; codigo: string | null; proy?: { nombre?: string | null } | null } | null;
  emp?: { id: string; nombre: string | null } | null;
};
type Opcion = { id: string; etiqueta: string; enJuego: boolean };
type Fila = { id: string; codigo: string; nombre: string; ultimo: string | null; sinLeer: number };

export default function CasillaDafo({ items, opciones, resumen, tope }: {
  items: Com[]; opciones: Opcion[]; resumen: Fila[]; tope: number;
}) {
  const router = useRouter();
  const [pend, arrancar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  /* Sin leer arriba y, dentro, lo que parece pedir algo primero: entre dos
     correos del mismo día, uno que dice «subsanación» no vale lo mismo que un
     acuse de recibo. */
  const sinLeer = useMemo(() => items.filter(c => !c.leido_en)
    .sort((a, b) => Number(!!b.pide_accion) - Number(!!a.pide_accion)), [items]);
  const leidos = useMemo(() => items.filter(c => !!c.leido_en), [items]);

  /* El historial, por postulación. Las que no tienen vínculo van juntas al
     final: son una pregunta pendiente, no un grupo más. */
  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; coms: Com[] }>();
    leidos.forEach(c => {
      const k = c.postulacion_id || "_";
      const titulo = c.post
        ? `🎯 ${c.post.codigo || "sin código"}${c.post.proy?.nombre ? ` · ${c.post.proy.nombre}` : ""}`
        : "❓ Sin vincular";
      const g = m.get(k) || { titulo, coms: [] };
      g.coms.push(c); m.set(k, g);
    });
    return [...m.entries()].sort((a, b) => (a[0] === "_" ? 1 : b[0] === "_" ? -1 : 0));
  }, [leidos]);

  const correr = (fn: () => Promise<any>) => arrancar(async () => {
    setAviso(null);
    const r = await fn();
    if (r?.error) setAviso(r.error);
    router.refresh();
  });

  const chipVinculo = (c: Com) => {
    const o = c.vinculo_por ? ORIGEN_VINCULO[c.vinculo_por] : null;
    if (!c.post) {
      return (
        <span style={{ color: "var(--dim)", fontSize: 11 }}>
          {c.emp?.nombre ? `🏢 ${c.emp.nombre} · sin postulación` : "sin vincular"}
        </span>
      );
    }
    return (
      <span style={{ fontSize: 11, display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/entidad/postulacion/${c.post.id}`} style={{ color: "var(--violet)", fontWeight: 600 }}>
          🎯 {c.post.codigo || "postulación"}
        </Link>
        {o && <span style={{ color: o.col }} title={o.txt}>{o.ico}</span>}
      </span>
    );
  };

  const fila = (c: Com) => {
    const url = linkGmail(c.gmail_thread_id, c.buzon);
    return (
      <div key={c.id} id={`c-${c.id}`} className="card"
        style={{ display: "flex", flexDirection: "column", gap: 4,
          borderLeft: c.pide_accion && !c.leido_en ? "3px solid var(--red)" : undefined }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 220 }}>
            {c.pide_accion ? "🚨 " : ""}{c.asunto || "(sin asunto)"}
          </span>
          {chipVinculo(c)}
          <span style={{ color: "var(--dim)", fontSize: 11 }}>{hace(c.recibido_en)}</span>
        </div>

        <div style={{ color: "var(--dim)", fontSize: 11.5 }}>
          {soloNombre(c.remitente)}{c.cuenta ? ` → ${c.cuenta}` : ""}
        </div>

        {c.extracto && (
          <div style={{ fontSize: 12, color: "var(--dim)", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {c.extracto}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          {url && (
            <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11.5 }}>✉ ver en Gmail ↗</a>
          )}
          <button type="button" className="btn btn-ghost" disabled={pend} style={{ fontSize: 11.5 }}
            onClick={() => correr(() => marcarComunicacion(c.id, !c.leido_en))}>
            {c.leido_en ? "↩ marcar sin leer" : "✓ leído"}
          </button>
          {c.caso_id ? (
            <Link className="btn btn-ghost" href={`/caso/${c.caso_id}`} style={{ fontSize: 11.5, color: "var(--teal)" }}>
              📌 ver su caso
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={pend} style={{ fontSize: 11.5 }}
              onClick={() => correr(() => casoDeComunicacion(c.id))}>
              📌 abrir caso
            </button>
          )}
          {/* Vincular a mano. Es la salida cuando el asunto no trae código y la
              empresa tiene varias postulaciones en juego: el sistema no
              adivina, pregunta. */}
          <select className="btn btn-ghost" disabled={pend} defaultValue={c.postulacion_id || ""}
            style={{ fontSize: 11.5, maxWidth: 260 }}
            onChange={e => correr(() => vincularComunicacion(c.id, e.target.value || null))}>
            <option value="">— sin vincular —</option>
            {opciones.map(o => (
              <option key={o.id} value={o.id}>{o.enJuego ? "● " : "○ "}{o.etiqueta}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <>
      {aviso && (
        <div className="empty" style={{ color: "var(--red)", marginBottom: 10 }}>{aviso}</div>
      )}

      {/* ── El silencio, medido ──
          Un correo que no llegó no aparece en ninguna bandeja. Esta tira es lo
          único del panel que habla de lo que NO pasó. */}
      {resumen.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "4px 0 8px", letterSpacing: .5 }}>
            ⏱ Última señal por postulación en juego
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {resumen.map(r => {
              const d = diasDesde(r.ultimo);
              const col = d === null ? "var(--dim)" : d > 30 ? "var(--yellow)" : "var(--teal)";
              return (
                <Link key={r.id} href={`/entidad/postulacion/${r.id}`} className="card"
                  style={{ flex: "1 1 220px", minWidth: 200, textDecoration: "none" }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>🎯 {r.codigo}</div>
                  {r.nombre && <div style={{ color: "var(--dim)", fontSize: 11 }}>{r.nombre}</div>}
                  <div style={{ color: col, fontSize: 11.5, marginTop: 3 }}>
                    {d === null ? "nunca llegó nada" : d === 0 ? "hoy" : `hace ${d} d`}
                    {r.sinLeer > 0 && <span style={{ color: "var(--red)" }}> · {r.sinLeer} sin leer</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "0 0 8px", letterSpacing: .5 }}>
        📬 Sin leer · {sinLeer.length}
      </h2>
      {sinLeer.length === 0 ? (
        <div className="empty">Nada pendiente. Si no vibró el celular, no ha llegado nada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{sinLeer.map(fila)}</div>
      )}

      {grupos.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "24px 0 8px", letterSpacing: .5 }}>
            ✅ Ya leídos · {leidos.length}
            {!verTodo && leidos.length > 12 && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 8 }}
                onClick={() => setVerTodo(true)}>ver todos</button>
            )}
          </h2>
          {grupos.map(([k, g]) => {
            const visibles = verTodo ? g.coms : g.coms.slice(0, 3);
            return (
              <div key={k} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: "var(--dim)" }}>
                  {g.titulo} · {g.coms.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{visibles.map(fila)}</div>
                {!verTodo && g.coms.length > 3 && (
                  <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>
                    y {g.coms.length - 3} más
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {items.length >= tope && (
        /* Sin esto, «solo hay 300» se leería como «solo llegaron 300». Un tope
           callado es una mentira con buena presentación. */
        <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 12 }}>
          Mostrando los {tope} correos más recientes. Los anteriores siguen guardados.
        </div>
      )}
    </>
  );
}
