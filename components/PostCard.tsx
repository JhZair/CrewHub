"use client";
import Avatar from "@/components/Avatar";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import NuevoBadge from "@/components/NuevoBadge";
import MiniSelect from "@/components/MiniSelect";
import TextoCorto from "@/components/TextoCorto";
import AvisoMini from "@/components/AvisoMini";
import { cambiarTipo, cambiarEstado, ocultarDelFeed } from "@/app/actions";
import { celebrarResuelto } from "@/lib/celebra";
import Foto from "@/components/Foto";
import { opcionesEstado, claseEstado, rotuloEstado, esAviso } from "@/lib/estados";
import { type Plazo } from "@/lib/plazo";
import BarrasProgreso from "@/components/BarrasProgreso";
import { type Progreso } from "@/lib/progreso";
// Ruta central: un objeto del repositorio no vive en /entidad/…
import { rutaEntidad } from "@/lib/secciones";
import { TIPOS_SEL } from "@/lib/tipos";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* (TIPOS_SEL salió a lib/tipos, con el mismo orden y la misma decisión: no
   se ofrece «conversación» — es el cajón donde cae lo que nadie clasificó,
   no algo que uno elija.) */

/* Tarjeta del feed: la tarjeta navega al caso; los chips, a su entidad. */
export default function PostCard({
  href, titulo, tipo, tipoLabel, tipoColor, estado,
  autorNombre, autorColor, autorSrc, fechaStr, respNombre, avisaSinResp,
  nc, plazo, cuerpo, chips, pubId, userId, reacciones, imagenes,
  padreId, padreTitulo, hijos, creadoEn, equipoTotal, marca, prog,
}: {
  href: string; titulo: string; tipo?: string; tipoLabel: string; tipoColor: string;
  /* El rótulo NO se recibe: se deduce de estado+tipo. Venía por prop y el feed
     lo calculaba con un mapa que no sabía de avisos — así un aviso llegaba
     aquí ya rotulado "Sin Resolver" y la tarjeta no tenía cómo saber que era
     mentira, aunque tuviera el `tipo` en la mano. */
  estado: string;
  autorNombre?: string | null; autorColor?: string | null; autorSrc?: string | null;
  fechaStr: string; respNombre?: string | null; avisaSinResp: boolean;
  /* El plazo entero, no [texto, color]: el texto de arriba y la barra de
     abajo son la MISMA cuenta y llegan juntos. `fechaLimite` ya no se recibe
     —era solo para que la barra hiciera su propio cálculo, que es de donde
     salía la contradicción—. */
  nc: number; plazo?: Plazo | null; cuerpo?: string | null;
  chips: { tipo: string; id: string; nombre: string; ico: string }[];
  pubId?: string; userId?: string; reacciones?: Reaccion[];
  imagenes?: string[];
  padreId?: string | null; padreTitulo?: string | null;
  hijos?: { total: number; ok: number } | null;
  creadoEn?: string; equipoTotal?: number;
  /* En "Mis asuntos": por qué está aquí si no lo trabajo yo. `null` = es mi
     responsabilidad (prendido); si viene, la tarjeta se atenúa (apagado). */
  marca?: "delegado" | "mencion" | null;
  /* ⏳ Tiempo vs ⚡ Trabajo, ya calculado en el servidor (lib/progreso). */
  prog?: Progreso | null;
}) {
  const router = useRouter();
  const enterN = (reacciones || []).filter(r => r.emoji === "👀").length;
  const enterMio = (reacciones || []).some(r => r.emoji === "👀" && r.usuario_id === userId);
  return (
    <div className={`card link est-${claseEstado(estado, tipo)} ${estado === "resuelta" ? "card-apagada" : ""} ${marca ? "card-ajena" : ""}`}
      title={marca === "delegado" ? "Lo pediste tú — lo trabaja otra persona"
        : marca === "mencion" ? "Te menciona, pero no es tu responsabilidad" : undefined}
      style={{ cursor: "pointer" }} onClick={() => router.push(href)}>
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
            {marca === "delegado" && (
              <span className="mini-ind" title="Lo pediste tú — lo trabaja otra persona"
                style={{ marginRight: 6, color: "var(--blue)", verticalAlign: "middle" }}>📤</span>
            )}
            {marca === "mencion" && (
              <span className="mini-ind" title="Te menciona, pero no es tu responsabilidad"
                style={{ marginRight: 6, color: "var(--dim)", verticalAlign: "middle" }}>👁</span>
            )}
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
            {plazo && <><span>•</span><b style={{ color: plazo.color }}>{plazo.texto}</b></>}
            <span style={{ marginLeft: "auto" }}>{fechaStr}</span>
          </div>
          <div className="post-divisor" />
          {/* Un aviso se muestra igual en TODO el sistema: el cuerpo a la
              vista con su filete violeta y «ver más» aquí mismo. Lo que
              importa de un aviso es lo que DICE — el título es el asunto.
              El resto de tipos conserva el corte corto del feed: esto es una
              lista para barrer con el ojo, y el cuerpo de una tarea es
              contexto, no el mensaje. Pero «ver más» lo tienen todos: cortar
              con «…» y obligar a abrir otra página era el viaje de más. */}
          {/* Sin <p> envolviendo: TextoCorto ES un <div> y un <div> dentro de
              un <p> es HTML inválido — el navegador cierra el <p> solo, el DOM
              deja de ser el que mandó el servidor y React revienta al
              hidratar. El <p> estaba bien cuando dentro iba TextoRico, que
              devuelve <span>; al cambiar el componente, el envoltorio quedó
              ilegal. El estilo va al propio componente, que para eso recibe
              className. */}
          {cuerpo && (
            <TextoCorto texto={cuerpo}
              className={esAviso(tipo) ? "aviso-cuerpo" : "post-cuerpo"}
              corte={esAviso(tipo) ? undefined : 180} />
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
                <Link key={i} href={rutaEntidad(c.tipo, c.id) || `/entidad/${c.tipo}/${c.id}`}
                  onClick={e => e.stopPropagation()}>
                  <span className="echip echip-link">{c.ico} {c.nombre}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="post-pie" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)", fontSize: 12.5, flexShrink: 0 }}>💬 {nc}</span>
            {tipo === "aviso" && pubId && userId && (
              <AvisoMini pubId={pubId} enterados={enterN} total={equipoTotal} mio={enterMio} />
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
                /* Las opciones dependen del tipo: a un aviso no se le ofrece
                   "Resuelta" — no hay nada que resolver. Antes se le ofrecía. */
                <MiniSelect value={estado} options={opcionesEstado(tipo, estado)}
                  onSelect={async v => { await cambiarEstado(pubId, v); if (v === "resuelta" && estado !== "resuelta") celebrarResuelto(); router.refresh(); }}
                  buttonClass={`pill st-${claseEstado(estado, tipo)}`}
                  buttonStyle={{ border: "none" }} />
              ) : (
                <span className={`pill st-${claseEstado(estado, tipo)}`}>{rotuloEstado(estado, tipo)}</span>
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
      {/* La barra y el texto de arriba salen del MISMO plazo: misma anchura,
          mismo color, imposible que se contradigan. Antes el texto decía
          «vence en 1 día» en rojo y la barra estaba verde. */}
      {plazo && plazo.pct > 0 && (
        <div className="post-progreso"
          title={plazo.vencido ? "Plazo vencido" : `Vence en ${plazo.d} día${plazo.d === 1 ? "" : "s"}`}>
          <span style={{ width: `${plazo.pct}%`, background: plazo.color }} />
        </div>
      )}
      {/* ⏳ Tiempo / ⚡ Trabajo: el detalle va en el tooltip para no cargar
          la tarjeta. La barra de plazo de arriba sigue siendo la de urgencia. */}
      <BarrasProgreso p={prog} mini />
    </div>
  );
}
