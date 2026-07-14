"use client";
import Avatar from "@/components/Avatar";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import NuevoBadge from "@/components/NuevoBadge";
import MiniSelect from "@/components/MiniSelect";
import TextoRico from "@/components/TextoRico";
import { cambiarTipo, cambiarEstado, ocultarDelFeed, toggleEnterado } from "@/app/actions";
import { celebrarResuelto } from "@/lib/celebra";
import Foto from "@/components/Foto";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TIPOS_SEL = [
  ["tarea", "✅ Tarea"], ["problema", "❗ Problema"], ["consulta", "❓ Consulta"],
  ["pago", "💰 Pago"], ["idea", "💡 Idea"], ["archivo", "📎 Archivo"],
  ["aviso", "📢 Aviso"],
];

const ESTADOS_SEL = [
  ["abierta", "Sin Resolver"], ["en_progreso", "En Progreso"],
  ["seguimiento", "🔭 Seguimiento"], ["en_pausa", "En Pausa"],
  ["resuelta", "Resuelta"], ["archivada", "Archivada"],
];

/* Tarjeta del feed: la tarjeta navega al caso; los chips, a su entidad. */
export default function PostCard({
  href, titulo, tipo, tipoLabel, tipoColor, estado, estadoTxt,
  autorNombre, autorColor, autorSrc, fechaStr, respNombre, avisaSinResp,
  nc, venc, cuerpo, chips, pubId, userId, reacciones, imagenes,
  padreId, padreTitulo, hijos, creadoEn, equipoTotal, fechaLimite,
}: {
  href: string; titulo: string; tipo?: string; tipoLabel: string; tipoColor: string;
  estado: string; estadoTxt: string;
  autorNombre?: string | null; autorColor?: string | null; autorSrc?: string | null;
  fechaStr: string; respNombre?: string | null; avisaSinResp: boolean;
  nc: number; venc: [string, string] | null; cuerpo?: string | null;
  chips: { tipo: string; id: string; nombre: string; ico: string }[];
  pubId?: string; userId?: string; reacciones?: Reaccion[];
  imagenes?: string[];
  padreId?: string | null; padreTitulo?: string | null;
  hijos?: { total: number; ok: number } | null;
  creadoEn?: string; equipoTotal?: number; fechaLimite?: string | null;
}) {
  const router = useRouter();
  const enterN = (reacciones || []).filter(r => r.emoji === "👀").length;
  // Progreso de tiempo: de la creación al vencimiento (solo casos activos con fecha límite)
  const prog = (fechaLimite && estado !== "resuelta" && estado !== "archivada") ? (() => {
    const ini = new Date(creadoEn || fechaLimite).getTime();
    const fin = new Date(fechaLimite + "T23:59:59").getTime();
    const pct = Math.max(0, Math.min(1, (Date.now() - ini) / Math.max(1, fin - ini)));
    const vencido = Date.now() > fin;
    const color = vencido ? "var(--red)" : pct >= 0.85 ? "var(--yellow)" : pct >= 0.5 ? "var(--teal)" : "var(--green)";
    return { pct: Math.round(pct * 100), color, vencido };
  })() : null;
  const enterMio = (reacciones || []).some(r => r.emoji === "👀" && r.usuario_id === userId);
  return (
    <div className={`card link est-${estado} ${estado === "resuelta" ? "card-apagada" : ""}`} style={{ cursor: "pointer" }} onClick={() => router.push(href)}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar nombre={autorNombre} color={autorColor} size={38} src={autorSrc} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {padreId && (
            <Link href={`/caso/${padreId}`} onClick={e => e.stopPropagation()}
              style={{ color: "var(--muted)", fontSize: 11.5, display: "inline-block", marginBottom: 3 }}>
              🧩 ↑ parte de: <b style={{ color: "var(--violet)" }}>{padreTitulo || "caso padre"}</b>
            </Link>
          )}
          <div>
            <b style={{ fontSize: 15, lineHeight: 1.35 }}>{titulo}</b>
            {creadoEn && <span style={{ marginLeft: 8, display: "inline-block", verticalAlign: "middle" }}><NuevoBadge creadoEn={creadoEn} /></span>}
            {hijos && hijos.total > 0 && (
              <span className="badge" style={{
                color: hijos.ok === hijos.total ? "var(--green)" : "var(--teal)",
                background: "rgba(45,212,191,.1)", marginLeft: 8, verticalAlign: "middle",
              }}>🧩 {hijos.ok}/{hijos.total}</span>
            )}
          </div>
          <div className="meta">
            <span>Por <b>{autorNombre}</b></span>
            {respNombre
              ? <span>→ Responsable <b style={{ color: "var(--teal)" }}>{respNombre}</b></span>
              : avisaSinResp && <span style={{ color: "var(--yellow)" }}>⚠ sin responsable</span>}
            {venc && <><span>•</span><b style={{ color: venc[1] }}>{venc[0]}</b></>}
            <span style={{ marginLeft: "auto" }}>{fechaStr}</span>
          </div>
          <div className="post-divisor" />
          {cuerpo && (
            <p style={{ color: "#c6c6da", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              <TextoRico texto={cuerpo.slice(0, 180)} />{cuerpo.length > 180 ? "…" : ""}
            </p>
          )}
          {(imagenes || []).length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
              {imagenes!.slice(0, 4).map((u, i) => (
                <span key={i} onClick={e => e.stopPropagation()}>
                  <Foto src={u} maxHeight={220} />
                </span>
              ))}
              {imagenes!.length > 4 && <span style={{ color: "var(--dim)", fontSize: 12, alignSelf: "center" }}>+{imagenes!.length - 4}</span>}
            </div>
          )}
          {chips.length > 0 && (
            <div className="sel-chips" style={{ marginTop: 9 }}>
              {chips.map((c, i) => (
                <Link key={i} href={`/entidad/${c.tipo}/${c.id}`}
                  onClick={e => e.stopPropagation()}>
                  <span className="echip echip-link">{c.ico} {c.nombre}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="post-pie" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)", fontSize: 12.5, flexShrink: 0 }}>💬 {nc}</span>
            {tipo === "aviso" && pubId && userId && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ color: "var(--violet)", fontSize: 12 }}>👀 Enterados {enterN}/{equipoTotal ?? "—"}</span>
                <button className="ae-mini" title={enterMio ? "Ya te enteraste" : "Marcar que me enteré"}
                  onClick={async e => { e.stopPropagation(); await toggleEnterado(pubId); router.refresh(); }}>
                  {enterMio ? "✓ enterado" : "me enteré"}
                </button>
              </span>
            )}
            {pubId && userId && (
              <span style={{ flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                <Reacciones pubId={pubId} reacciones={reacciones || []} userId={userId} />
              </span>
            )}
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
              {pubId && tipo ? (
                <MiniSelect value={tipo} options={TIPOS_SEL}
                  onSelect={async v => { await cambiarTipo(pubId, v); router.refresh(); }}
                  buttonClass="badge"
                  buttonStyle={{ color: tipoColor, background: `${tipoColor}22`, border: "none", fontSize: 11, fontWeight: 700 }} />
              ) : (
                <span className="badge" style={{ color: tipoColor, background: `${tipoColor}22` }}>{tipoLabel}</span>
              )}
              {pubId ? (
                <MiniSelect value={estado} options={ESTADOS_SEL}
                  onSelect={async v => { await cambiarEstado(pubId, v); if (v === "resuelta" && estado !== "resuelta") celebrarResuelto(); router.refresh(); }}
                  buttonClass={`pill st-${estado}`}
                  buttonStyle={{ border: "none" }} />
              ) : (
                <span className={`pill st-${estado}`}>{estadoTxt}</span>
              )}
              {pubId && estado === "resuelta" && (
                <button title="Ocultar de mi feed (sigue en el tablero)"
                  onClick={async e => {
                    e.stopPropagation();
                    await ocultarDelFeed(pubId);
                    router.refresh();
                  }}
                  className="btn-ocultar"
                  style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", padding: "0 2px", display: "inline-flex", alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
      {prog && (
        <div className="post-progreso" title={prog.vencido ? "Plazo vencido" : `${prog.pct}% del plazo transcurrido`}>
          <span style={{ width: `${prog.pct}%`, background: prog.color }} />
        </div>
      )}
    </div>
  );
}
