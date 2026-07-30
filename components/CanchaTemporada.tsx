"use client";
import Link from "next/link";
import { useState } from "react";
import { TXT } from "@/lib/texto";
import RielHitos from "@/components/RielHitos";

/* LA CANCHA DE LA TEMPORADA.
   Una convocatoria es una cancha: varios compiten (las postulaciones) y pocos
   ganan. Esta vista lo muestra como lo que es —una carrera con fechas—: un
   riel de tiempo real con los hitos ubicados por su fecha, la marca de HOY, lo
   que dejamos atrás en penumbra y lo que sigue por delante; y debajo, los
   jugadores corriendo hacia la meta 🏁, cada uno según en qué punto de su
   carrera está. La vista «Lista» conserva el resumen compacto de siempre. */

type Post = { id: string; codigo: string | null; nombre: string; estado: string };
type Hito = { id: string; nombre: string; fecha: string };
export type Frente = {
  id: string; codigo: string; nombre: string;
  categoria: string | null; monto: number | null; estado: string; anio: number | null;
  posts: Post[]; hitos: Hito[];
};

const V = {
  green: "var(--green)", yellow: "var(--yellow)", red: "var(--red)",
  teal: "var(--teal)", violet: "var(--violet)", blue: "var(--blue)",
  dim: "var(--dim)", muted: "var(--muted)",
};

/* Cada etapa de una postulación es un punto de avance en la carrera: cuánto
   ha corrido (0→1), su color y su etiqueta. Las SALIDAS se ubican donde a cada
   una la eliminaron —no en cero—: una «no apta» ya se envió y pasó por revisión
   administrativa antes de caer, así que llegó más lejos que una que apenas se
   prepara; y una «no seleccionada» pasó el filtro y llegó hasta el jurado. */
const STAGE: Record<string, { f: number; c: string; ic: string; lbl: string }> = {
  ganadora: { f: 1, c: V.green, ic: "🏆", lbl: "ganó" },
  finalista: { f: 0.84, c: V.yellow, ic: "🎯", lbl: "finalista" },
  finalista_no_ganadora: { f: 0.84, c: V.yellow, ic: "🥈", lbl: "rozó la meta" },
  no_seleccionada: { f: 0.72, c: V.red, ic: "✖", lbl: "no seleccionada" },  // llegó al jurado
  apta: { f: 0.6, c: V.teal, ic: "🎯", lbl: "apta" },
  no_apta: { f: 0.5, c: V.red, ic: "✖", lbl: "quedó fuera" },               // cayó en revisión (ya enviada)
  enviada: { f: 0.4, c: V.violet, ic: "🎯", lbl: "enviada" },
  en_preparacion: { f: 0.15, c: V.blue, ic: "✏️", lbl: "preparando" },
};
const stageOf = (e: string) => STAGE[e] || { f: 0.3, c: V.violet, ic: "🎯", lbl: (e || "").replace(/_/g, " ") };

const CAT_IC: Record<string, string> = {
  videojuego: "🎮", videojuegos: "🎮", documental: "🎬", cortometraje: "🎞",
  largometraje: "🎥", animacion: "✨", festival: "🎪", festivales: "🎪",
};

const d = (f: string) => new Date(f + "T12:00:00").getTime();
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const dias = (f: string) => Math.ceil((d(f) - Date.now()) / 86400000);
const colorD = (n: number) => (n <= 2 ? V.red : n <= 7 ? V.yellow : V.muted);

export default function CanchaTemporada({ frentes, hoy }: { frentes: Frente[]; hoy: string }) {
  const [vista, setVista] = useState<"cancha" | "lista">("cancha");

  // Agrupar por temporada (año), más nueva primero.
  const porAnio = new Map<number, Frente[]>();
  frentes.forEach(f => {
    const a = Number(f.anio) || 0;
    (porAnio.get(a) || porAnio.set(a, []).get(a)!).push(f);
  });
  const anios = [...porAnio.keys()].sort((a, b) => b - a);
  // Dentro de cada temporada: categoría con el concurso más grande primero.
  const ordenar = (g: Frente[]) => {
    const maxCat = new Map<string, number>();
    g.forEach(f => maxCat.set(f.categoria || "", Math.max(maxCat.get(f.categoria || "") || 0, f.monto || 0)));
    return [...g].sort((a, b) => {
      const ma = maxCat.get(a.categoria || "") || 0, mb = maxCat.get(b.categoria || "") || 0;
      if (ma !== mb) return mb - ma;
      const c = (a.categoria || "").localeCompare(b.categoria || "");
      return c !== 0 ? c : (b.monto || 0) - (a.monto || 0);
    });
  };

  return (
    <div className="card" style={{ borderColor: "rgba(244,180,0,.3)" }}>
      <div className="cn-panel-h">
        <span className="panel-h" style={{ color: "var(--yellow)", margin: 0, padding: 0, border: 0 }}>
          🎪 Frentes de la temporada — la cancha donde jugamos
        </span>
        <span className="cn-toggle">
          <button type="button" className={vista === "cancha" ? "on" : ""} onClick={() => setVista("cancha")}>🏁 Cancha</button>
          <button type="button" className={vista === "lista" ? "on" : ""} onClick={() => setVista("lista")}>📋 Lista</button>
        </span>
      </div>

      {anios.map(anio => (
        <div key={anio}>
          <div className="frente-anio">📅 Temporada {anio || "sin año"} · {porAnio.get(anio)!.length}</div>
          {ordenar(porAnio.get(anio)!).map(f => vista === "cancha"
            ? <Cancha key={f.id} f={f} hoy={hoy} />
            : <Lista key={f.id} f={f} hoy={hoy} />)}
        </div>
      ))}
    </div>
  );
}

/* Cabecera común: código · nombre, categoría, lo que está en juego, estado. */
function Cabecera({ f }: { f: Frente }) {
  return (
    <div className="cn-head">
      <Link href={`/entidad/convocatoria/${f.id}`} className="cn-title" style={{ fontSize: TXT.meta }}>
        📜 {f.codigo} · {f.nombre} →
      </Link>
      {f.categoria ? (
        <span className="cn-cat" style={{ fontSize: TXT.chip }}>
          {CAT_IC[f.categoria.toLowerCase()] || "🏷"} {f.categoria.replace(/_/g, " ")}
        </span>
      ) : (
        <span className="cn-cat cn-cat-falta" style={{ fontSize: TXT.chip }}
          title="Esta convocatoria no tiene categoría cargada — complétala en su ficha">
          ⚠ sin categoría
        </span>
      )}
      {f.monto != null && (
        <span style={{ color: V.teal, fontSize: TXT.micro, fontWeight: 700, whiteSpace: "nowrap" }}>
          S/ {f.monto.toLocaleString("es-PE")} en juego
        </span>
      )}
    </div>
  );
}

/* LA VISTA CANCHA: riel de tiempo real + carrera de jugadores. */
function Cancha({ f, hoy }: { f: Frente; hoy: string }) {
  // Jugadores ordenados por quién va más adelante en la carrera; a igual etapa,
  // alfabético por nombre (desempate estable: antes quedaban en el orden crudo
  // de la base y parecía azaroso).
  const players = [...f.posts].sort((a, b) => {
    const d = stageOf(b.estado).f - stageOf(a.estado).f;
    return d !== 0 ? d : (a.nombre || "").localeCompare(b.nombre || "");
  });

  return (
    <div className="cn-frente">
      <Cabecera f={f} />

      {/* El riel de hitos: la MISMA línea de tiempo que se reusa en el listado
          de postulaciones (componente RielHitos). */}
      <RielHitos hitos={f.hitos} hoy={hoy} />

      {/* La carrera: cada jugador corre hacia la meta 🏁 según su etapa. */}
      <div className="cn-players">
        {players.length === 0 && <span style={{ color: V.dim, fontSize: TXT.micro }}>Aún sin jugadores en esta cancha.</span>}
        {players.map(p => {
          const s = stageOf(p.estado);
          return (
            <div key={p.id} className="cn-lane">
              <Link href={`/entidad/postulacion/${p.id}`} className="cn-pname" style={{ color: s.c, fontSize: TXT.chip }}
                title={`${p.codigo || ""} · ${(p.estado || "").replace(/_/g, " ")}`}>
                {s.ic} {p.nombre} ↗
              </Link>
              <div className="cn-race">
                <div className="cn-fill" style={{ width: `${Math.max(4, s.f * 100)}%`, background: s.c }} />
                <span className="cn-flag" title="meta">🏁</span>
              </div>
              <span className="cn-stage" style={{ color: s.c, fontSize: TXT.chip }}>{s.lbl}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* LA VISTA LISTA: el resumen compacto de siempre (chips + hitos en puntos). */
function Lista({ f, hoy }: { f: Frente; hoy: string }) {
  const hs = [...f.hitos].sort((a, b) => d(a.fecha) - d(b.fecha));
  const iProx = hs.findIndex(h => h.fecha >= hoy);
  const px = iProx >= 0 ? hs[iProx] : null;
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 2px" }}>
      <Cabecera f={f} />
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", paddingLeft: 2, marginTop: 6 }}>
        {f.posts.map(p => {
          const s = stageOf(p.estado);
          return (
            <Link key={p.id} href={`/entidad/postulacion/${p.id}`} className="badge"
              title={`${p.codigo || ""} · ${(p.estado || "").replace(/_/g, " ")}`}
              style={{ color: s.c, background: "#1c1c2c", textTransform: "none", letterSpacing: 0, textDecoration: "none", fontSize: TXT.chip }}>
              🎯 {p.nombre} ↗
            </Link>
          );
        })}
      </div>
      {hs.length ? (
        <div className="mini-tl">
          <div className="mtl-line">
            {hs.map((h, i) => (
              <div key={h.id} className="mtl-item">
                {i > 0 && <span className={`mtl-con${(iProx < 0 || i <= iProx) ? " on" : ""}`} />}
                <span className={`mtl-dot${iProx < 0 || i < iProx ? " hecho" : i === iProx ? " prox" : ""}`}
                  title={`${h.nombre || "hito"} · ${fmt(h.fecha)}`} />
              </div>
            ))}
          </div>
          {px ? (
            <span className="mtl-txt" style={{ color: colorD(dias(px.fecha)) }}>
              ⏱ {px.nombre || "próx. hito"}: {fmt(px.fecha)} · en {dias(px.fecha)} días
            </span>
          ) : (
            <span className="mtl-txt" style={{ color: V.green }}>✅ hitos cumplidos</span>
          )}
        </div>
      ) : (
        <div style={{ paddingLeft: 2, marginTop: 6 }}>
          <span style={{ color: V.dim, fontSize: TXT.micro }}>⏱ sin hitos cargados</span>
        </div>
      )}
    </div>
  );
}
