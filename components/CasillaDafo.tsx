"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { hace } from "@/lib/notificaciones";
import { linkGmail, soloNombre, diasDesde, ORIGEN_VINCULO, esAcuse } from "@/lib/casilla";
import { marcarComunicacion, vincularComunicacion, casoDeComunicacion } from "@/app/casilla/acciones";
/* El alta vive en app/actions.ts y no aquí al lado: no es la mecánica de esta
   pantalla, es escribir una credencial de empresa —lo mismo que hace la ficha
   de la empresa—. Solo que se puede disparar desde donde se nota que falta. */
import { registrarCuentaDafo } from "@/app/actions";

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
type Fila = {
  id: string; codigo: string; nombre: string; ultimo: string | null; sinLeer: number;
  empresa: string | null; cuentas: string[]; rindiendo: boolean;
};
type Cuenta = {
  correo: string; empresa: string | null; empresaId: string;
  vivas: number; ultimo: string | null; total: number; esBuzon: boolean;
};
type Empresa = { id: string; nombre: string; vivas: number };

/* Cuántos correos ya leídos se muestran por postulación antes de recortar. */
const POR_GRUPO = 3;

export default function CasillaDafo({
  items, opciones, resumen, inventario, empresas, cuentasError, tope,
}: {
  items: Com[]; opciones: Opcion[]; resumen: Fila[]; inventario: Cuenta[];
  empresas: Empresa[]; cuentasError: string | null; tope: number;
}) {
  const router = useRouter();
  const [pend, arrancar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);
  const [verCuentas, setVerCuentas] = useState(false);
  const [nueva, setNueva] = useState({ correo: "", empresaId: "" });

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

  /* Si llegamos desde una notificación (/casilla#c-<id>), abrir TODO antes de
     que el navegador busque el ancla: si ese correo ya estaba leído y su grupo
     venía recortado, el ancla no existe en el DOM y el clic no lleva a ninguna
     parte — el fallo silencioso de siempre, un aviso que suena y no entrega. */
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.startsWith("#c-")) {
      setVerTodo(true);
      const id = window.location.hash;
      // Tras pintar todo, ir al correo. El navegador ya no lo hace solo: el
      // ancla no estaba cuando cargó la página.
      requestAnimationFrame(() => document.querySelector(id)?.scrollIntoView({ block: "center" }));
    }
  }, []);

  /* ¿Algún grupo está recortado? Decide si el «ver todos» tiene sentido. */
  const hayRecorte = useMemo(() => grupos.some(([, g]) => g.coms.length > POR_GRUPO), [grupos]);

  const correr = (fn: () => Promise<any>) => arrancar(async () => {
    setAviso(null);
    const r = await fn();
    if (r?.error) setAviso(r.error);
    router.refresh();
  });

  /* Dar de alta una cuenta suelta. No reusa `correr` por una razón: cuando el
     alta falla —el correo ya estaba en otra empresa, o está mal escrito— los
     campos NO se limpian. Vaciar el formulario junto con el mensaje de error
     obliga a teclear otra vez lo que acabas de teclear, justo en el momento en
     que ya te equivocaste una vez. */
  const darDeAlta = () => arrancar(async () => {
    setAviso(null);
    const r: any = await registrarCuentaDafo(nueva.correo, nueva.empresaId);
    if (r?.error) { setAviso(r.error); return; }
    setNueva({ correo: "", empresaId: "" });
    router.refresh();
  });

  /* Compitiendo y ganadoras van en dos tiras, no en una de treinta tarjetas. */
  const compitiendo = useMemo(() => resumen.filter(r => !r.rindiendo), [resumen]);
  const rindiendo = useMemo(() => resumen.filter(r => r.rindiendo), [resumen]);
  /* Las cuentas por las que nunca entró un correo. El maestro no cuenta: por
     él no entra nada por definición, y verlo aquí como problema mandaría a
     revisar un reenvío que no existe. */
  const mudas = useMemo(() => inventario.filter(c => c.total === 0 && !c.esBuzon), [inventario]);

  /* Una tarjeta del resumen. Tres datos y en este orden: quién es, por dónde
     le hablan, y cuánto hace que no le hablan. El del medio es el que faltaba. */
  const tarjeta = (r: Fila) => {
    const d = diasDesde(r.ultimo);
    const col = d === null ? "var(--dim)" : d > 30 ? "var(--yellow)" : "var(--teal)";
    return (
      <Link key={r.id} href={`/entidad/postulacion/${r.id}`} className="card"
        style={{ flex: "1 1 220px", minWidth: 200, textDecoration: "none",
          /* El borde solo para el problema accionable: sin cuenta registrada,
             esta postulación no puede vincular nada por la vía de la cuenta y
             ninguna espera lo va a arreglar. */
          borderLeft: r.cuentas.length === 0 ? "3px solid var(--red)" : undefined }}>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>🎯 {r.codigo}</div>
        {r.nombre && <div style={{ color: "var(--dim)", fontSize: 11 }}>{r.nombre}</div>}

        {r.cuentas.length === 0 ? (
          /* Si la lista de cuentas no se pudo leer, TODAS saldrían sin cuenta:
             treinta alarmas rojas por un fallo de lectura. Una alarma que se
             enciende cuando el sistema no sabe la respuesta enseña a ignorarla,
             así que aquí se calla y el motivo se dice una sola vez arriba. */
          cuentasError ? null : (
            <div style={{ color: "var(--red)", fontSize: 11, marginTop: 3 }}
              title={r.empresa
                ? `Ninguna cuenta de correo está registrada en ${r.empresa}. Regístrala en su ficha (Credenciales → Gmail).`
                : "Esta postulación no tiene empresa, así que no hay dónde colgar su cuenta de correo."}>
              ✖ sin cuenta registrada
            </div>
          )
        ) : (
          <div style={{ color: "var(--dim)", fontSize: 10.5, marginTop: 3, wordBreak: "break-all" }}
            title={r.cuentas.join("\n")}>
            📧 {r.cuentas[0]}
            {r.cuentas.length > 1 && ` +${r.cuentas.length - 1}`}
          </div>
        )}

        <div style={{ color: col, fontSize: 11.5, marginTop: 3 }}>
          {d === null ? "nunca llegó nada" : d === 0 ? "hoy" : `hace ${d} d`}
          {r.sinLeer > 0 && <span style={{ color: "var(--red)" }}> · {r.sinLeer} sin leer</span>}
        </div>
      </Link>
    );
  };

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
        <Link href={`/entidad/postulacion/${c.post.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>
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
            {c.pide_accion ? "🚨 " : esAcuse(c.asunto) ? "🧾 " : ""}{c.asunto || "(sin asunto)"}
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

      {/* Sin la lista de cuentas, media pantalla dice menos de lo que parece.
          Decirlo aquí es lo que evita leer «nunca llegó nada» como un hecho
          sobre DAFO cuando en realidad es un hueco nuestro. */}
      {cuentasError && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          No se pudieron leer las cuentas de correo, así que esta pantalla no puede decir
          por dónde le llega a cada postulación: {cuentasError}
        </div>
      )}

      {/* ── El silencio, medido ──
          Un correo que no llegó no aparece en ninguna bandeja. Esta tira es lo
          único del panel que habla de lo que NO pasó.

          Cada tarjeta dice ADEMÁS por qué cuenta tendría que llegarle. Sin eso,
          «nunca llegó nada» se leía como una noticia sobre DAFO cuando muchas
          veces era una noticia sobre nosotros: nadie registró la cuenta. */}
      {compitiendo.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "4px 0 8px", letterSpacing: .5 }}>
            ⏱ Última señal · compitiendo · {compitiendo.length}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {compitiendo.map(tarjeta)}
          </div>
        </>
      )}

      {/* Las ganadoras aparte: reciben MÁS correo que ninguna —todo el hilo de
          la rendición— y con otro significado. Mezcladas en una sola tira de
          treinta, las dos listas dejaban de leerse. */}
      {rindiendo.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "4px 0 8px", letterSpacing: .5 }}>
            🏆 Última señal · ganadoras rindiendo · {rindiendo.length}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {rindiendo.map(tarjeta)}
          </div>
        </>
      )}

      {/* ── EL INVENTARIO DE CUENTAS ──
          La única vista que puede detectar el fallo más caro de todo esto: una
          cuenta a la que se le olvidó activar el reenvío. Ese fallo no produce
          ningún error en ninguna parte — la cuenta simplemente nunca aparece, y
          sus postulaciones se ven exactamente igual que si DAFO no hubiera
          escrito. Se abre plegada porque no es trabajo diario; el titular con
          las mudas está siempre a la vista, que es lo que hay que mirar. */}
      {/* La condición mira las EMPRESAS y no las cuentas: si no hay ninguna
          cuenta registrada todavía, es justo cuando más falta hace el
          formulario, y esconderlo por «no hay nada que mostrar» dejaba la
          pantalla sin salida el único día que importa. */}
      {empresas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => setVerCuentas(v => !v)}>
            📧 {inventario.length} cuentas registradas
            {mudas.length > 0 && (
              <span style={{ color: "var(--yellow)" }}> · {mudas.length} nunca trajeron nada</span>
            )}
            <span style={{ color: "var(--dim)" }}> {verCuentas ? "▾" : "▸"}</span>
          </button>

          {verCuentas && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {/* El alta, aquí y no en la ficha de la empresa: este es el sitio
                  donde se NOTA que una cuenta falta —la lista de al lado dice
                  cuáles hay y las tarjetas de arriba cuáles se echan de menos—,
                  y mandar a buscar la ficha desde aquí perdía el hallazgo por
                  el camino. Lo que escribe es exactamente una credencial de
                  Gmail de esa empresa: lo mismo que la ficha, sin el viaje. */}
              <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap",
                alignItems: "center", background: "var(--bg)" }}>
                <input type="email" placeholder="cuenta@gmail.com" value={nueva.correo}
                  onChange={e => setNueva({ ...nueva, correo: e.target.value })}
                  style={{ background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", minWidth: 220 }} />
                <select value={nueva.empresaId}
                  onChange={e => setNueva({ ...nueva, empresaId: e.target.value })}
                  className="btn btn-ghost" style={{ fontSize: 12, maxWidth: 260 }}>
                  <option value="">— ¿de qué empresa es? —</option>
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.vivas > 0 ? "● " : "○ "}{e.nombre}</option>
                  ))}
                </select>
                <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
                  disabled={pend || !nueva.correo.trim() || !nueva.empresaId}
                  onClick={darDeAlta}>
                  ＋ dar de alta
                </button>
                <span style={{ color: "var(--dim)", fontSize: 11 }}>
                  Queda como credencial de Gmail de esa empresa — la misma que se ve en su ficha.
                </span>
              </div>

              {inventario.map(c => {
                const d = diasDesde(c.ultimo);
                return (
                  <div key={c.correo} className="card"
                    style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ fontWeight: 600, minWidth: 230 }}>{c.correo}</span>
                    <Link href={`/entidad/empresa/${c.empresaId}`} style={{ color: "var(--dim)", fontSize: 11.5 }}>
                      🏢 {c.empresa || "empresa sin nombre"}
                    </Link>
                    <span style={{ color: "var(--dim)", fontSize: 11 }}>
                      {c.vivas === 0 ? "sin postulaciones vivas"
                        : `${c.vivas} postulación${c.vivas === 1 ? "" : "es"} viva${c.vivas === 1 ? "" : "s"}`}
                    </span>
                    <span className="spacer" style={{ flex: 1 }} />
                    {c.esBuzon ? (
                      /* «Registrada» no es «funcionando»: el maestro se descarta
                         al deducir de quién era un correo. Sin este aviso, verlo
                         en la lista invita a la conclusión contraria. */
                      <span style={{ color: "var(--dim)", fontSize: 11 }}
                        title="Es el buzón maestro. La ingesta lo descarta al deducir de quién era el correo, porque el reenvío lo agrega a todos los destinatarios.">
                        📮 buzón maestro · no deduce empresa
                      </span>
                    ) : c.total === 0 ? (
                      <span style={{ color: "var(--yellow)", fontSize: 11.5 }}
                        title="Ningún correo ha entrado por esta cuenta. Si ya postuló, lo más probable es que le falte activar el reenvío al buzón maestro.">
                        ⚠ nunca trajo nada — ¿reenvío sin activar?
                      </span>
                    ) : (
                      <span style={{ color: "var(--teal)", fontSize: 11.5 }}>
                        {c.total} correo{c.total === 1 ? "" : "s"} · último {d === 0 ? "hoy" : `hace ${d} d`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
            {/* El botón aparece si HAY algo recortado, no según el total: con
                8 leídos repartidos en tres grupos, el corte de 3 por grupo ya
                escondía filas y el botón no salía — «y 2 más» sin forma de
                verlas. */}
            {!verTodo && hayRecorte && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 8 }}
                onClick={() => setVerTodo(true)}>ver todos</button>
            )}
          </h2>
          {grupos.map(([k, g]) => {
            const visibles = verTodo ? g.coms : g.coms.slice(0, POR_GRUPO);
            return (
              <div key={k} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: "var(--dim)" }}>
                  {g.titulo} · {g.coms.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{visibles.map(fila)}</div>
                {!verTodo && g.coms.length > POR_GRUPO && (
                  <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>
                    y {g.coms.length - POR_GRUPO} más
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
