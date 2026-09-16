"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import Avatar from "@/components/Avatar";
import EditorImagenes from "@/components/EditorImagenes";
import HiloRendicion from "@/components/HiloRendicion";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import VistaRapida from "@/components/VistaRapida";
import { rotuloEstado, claseEstado } from "@/lib/estados";
import { fechaDia } from "@/lib/fechas";
import {
  portadaSecuencia, sumarFotosSecuencia, pieFotoSecuencia, quitarFotoSecuencia,
  marcarActorSecuencia, principalActorSecuencia,
  subirRenderSecuencia, borrarRenderSecuencia,
  casoDesdeSecuencia, atarCasoASecuencia, soltarCasoDeSecuencia, casosLibresDeSecuencia,
} from "@/app/guion/acciones";

/* ══════════════════════════════════════════════════════════════════════════
   🎞 TODO LO QUE CUELGA DE UNA SECUENCIA

   Una secuencia era un nombre, un texto y unos minutos: bastaba para
   ESCRIBIR el tratamiento y no para RODARLO. El día del rodaje lo que hace
   falta saber de «La Fe y el Santo Patrono» es quién sale —Lino Huamani—,
   cómo se ve, dónde está el render que se mandó al fondo y qué quedó
   pendiente. Todo eso vivía fuera: en la cabeza de alguien, en un WhatsApp y
   en una carpeta de Drive.

   ── UN COMPONENTE PARA LAS DOS VISTAS ──
   Lo montan Tarjetas (debajo de la secuencia) y la Línea de tiempo (en el
   cajón). Podían ser dos; son uno, porque son los mismos seis bloques y con
   dos archivos el día que cambie uno el otro se queda atrás — y nadie lo nota
   hasta que alguien usa la vista que no se tocó.

   ── LO QUE NO SE CONSTRUYE AQUÍ ──
   Los comentarios y las reacciones se ENCHUFAN: `HiloRendicion` es el motor de
   siempre y esta secuencia es su novena puerta (lib/rendicionHilo.ts). El
   selector de imágenes es `EditorImagenes`. La vista rápida de un caso es
   `VistaRapida`. Aquí no hay motor nuevo: hay cableado.
   ══════════════════════════════════════════════════════════════════════════ */

export type ActorReparto = {
  id: string;                 // proyecto_actores.id — NO el de la persona
  nombre: string;
  rol?: string | null;
  avatar?: string | null;
  color?: string | null;
  personaId?: string | null;
};
export type FotoSec = { id: string; url: string; pie?: string | null };
export type RenderSec = {
  id: string; url: string; version: number;
  nota?: string | null; duracion?: string | null; creado_en?: string | null;
};
export type CasoSec = {
  id: string; titulo?: string | null; estado?: string | null; tipo?: string | null;
};

export default function SecuenciaFicha({
  secuenciaId, tratamientoId, nombre,
  portada = null, fotos = [], reparto = [], actores = [],
  renders = [], casos = [], reacciones = [], userId = "",
  nComentarios = 0,
}: {
  secuenciaId: string; tratamientoId: string; nombre: string;
  portada?: string | null;
  fotos?: FotoSec[];
  /** El reparto ENTERO de la película: es de donde se elige. */
  reparto?: ActorReparto[];
  /** Los que ya están en esta secuencia: `{ id, principal }`. */
  actores?: { id: string; principal?: boolean }[];
  renders?: RenderSec[];
  casos?: CasoSec[];
  reacciones?: Reaccion[];
  userId?: string;
  nComentarios?: number;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "img" | "gente" | "render" | "caso">("");
  const [nuevas, setNuevas] = useState<string[]>([]);
  const [rUrl, setRUrl] = useState(""); const [rNota, setRNota] = useState("");
  const [rDur, setRDur] = useState("");
  const [libres, setLibres] = useState<CasoSec[] | null>(null);

  const dentro = new Map(actores.map(a => [a.id, !!a.principal]));
  /* Los principales primero: en un coral hay quien LLEVA la secuencia y quien
     aparece en ella, y sin ese orden la lista la decide el azar del insert. */
  const enEsta = reparto.filter(r => dentro.has(r.id))
    .sort((a, b) => Number(dentro.get(b.id)) - Number(dentro.get(a.id)));

  const corre = async (k: string, fn: () => Promise<any>) => {
    if (ocupado) return;
    setOcupado(k); setError("");
    const r: any = await fn();
    setOcupado("");
    if (r?.error) { setError(r.error); return false; }
    router.refresh();
    return true;
  };

  return (
    <div className="sqf" id={`guion_secuencia-${secuenciaId}`}>

      {/* ══ LA TIRA ══
          ⚠ LA IMAGEN Y QUIÉN SALE NO SE ESCONDEN.
          Al principio esta tira eran cuatro CONTADORES —«🖼 4», «🫂 2»— y había
          que abrir el panel para ver qué había dentro. Estaba mal: de las cinco
          cosas que cuelgan de una secuencia, esas dos son las que se MIRAN al
          pasar, no las que se editan. «¿Cuál era la del Tinkuy?» y «¿esta es la
          de Lino?» se contestan viendo la cara y el fotograma, y un número no
          contesta ninguna de las dos — obliga a abrir veinte paneles para
          recorrer un acto.
          Así que estos dos botones enseñan su CONTENIDO y siguen abriendo su
          panel al pulsarlos: mirar no cuesta un clic, editar sí. Los otros tres
          —render, casos, comentarios— sí son contadores, porque de ellos lo que
          se mira de pasada es CUÁNTOS hay. */}
      <div className="sqf-tira">
        <button type="button" className={`sqf-b sqf-b-img${panel === "img" ? " on" : ""}`}
          onClick={() => setPanel(panel === "img" ? "" : "img")}
          title={portada ? `La imagen de esta secuencia${fotos.length > 1 ? ` · ${fotos.length} en la galería` : ""}`
            : "Todavía sin imagen — pulsa para ponerle una"}>
          {portada
            ? <img src={portada} alt="" className="sqf-mini" loading="lazy" />
            : <span className="sqf-mini sqf-mini-no">🖼</span>}
          {fotos.length > 1 && <span className="sqf-mas">{fotos.length}</span>}
        </button>

        <button type="button" className={`sqf-b sqf-b-gente${panel === "gente" ? " on" : ""}`}
          onClick={() => setPanel(panel === "gente" ? "" : "gente")}
          title={enEsta.length
            ? `Sale${enEsta.length === 1 ? "" : "n"}: ${enEsta.map(p => p.nombre).join(", ")}`
            : "Todavía no se sabe quién sale — pulsa para decirlo"}>
          {enEsta.length === 0
            ? <span className="sqf-nadie">🫂 quién sale</span>
            : (
              <>
                {/* Las caras, apiladas. Tres como mucho: a partir de ahí la tira
                    se come la fila y lo que importa —que hay gente y quién la
                    lleva— ya se ve con tres. */}
                <span className="sqf-caras">
                  {enEsta.slice(0, 3).map(p => (
                    <span key={p.id} className={dentro.get(p.id) ? "sqf-cara es-pri" : "sqf-cara"}
                      title={`${p.nombre}${dentro.get(p.id) ? " · lleva la secuencia" : ""}`}>
                      <Avatar size={20} nombre={p.nombre} src={p.avatar} color={p.color} />
                    </span>
                  ))}
                </span>
                {/* El nombre del que la lleva, escrito: una cara de 20 px no se
                    reconoce en una lista de veinte filas, y el nombre es lo que
                    de verdad se busca. */}
                <span className="sqf-quien">{enEsta[0].nombre}</span>
                {enEsta.length > 1 && <span className="sqf-mas">+{enEsta.length - 1}</span>}
              </>
            )}
        </button>

        <button type="button" className={`sqf-b${panel === "render" ? " on" : ""}`}
          onClick={() => setPanel(panel === "render" ? "" : "render")}
          title="El render en Drive, con su historial de versiones">
          🎬 {renders.length ? `v${renders[0].version}` : "—"}
        </button>

        <button type="button" className={`sqf-b${panel === "caso" ? " on" : ""}`}
          onClick={() => setPanel(panel === "caso" ? "" : "caso")}
          title="El trabajo abierto de esta secuencia">
          ⚡ {casos.length || "—"}
        </button>

        <span className="sqf-sep" />

        {/* El hilo y las reacciones: el motor de siempre, enchufado a la
            novena puerta del registro. */}
        <HiloRendicion tabla="guion_secuencia" filaId={secuenciaId}>
          {(abrir) => (
            <button type="button" className="sqf-b" onClick={abrir}
              title="Comentar esta secuencia">💬 {nComentarios || ""}</button>
          )}
        </HiloRendicion>
        <Reacciones pubId={null} reacciones={reacciones} userId={userId} compacto
          rendicion={{ tabla: "guion_secuencia", id: secuenciaId }} />
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {/* ══ IMÁGENES ══ */}
      {panel === "img" && (
        <div className="sqf-panel">
          <div className="sqf-h">
            🖼 Imagen representativa
            <span>La que sale en la línea de tiempo. Un fotograma, no un póster.</span>
          </div>
          <div className="sqf-port">
            {portada
              ? <img src={portada} alt="" className="sqf-port-img" />
              : <span className="sqf-port-no">sin imagen</span>}
            <div className="sqf-port-acc">
              {/* Se elige de la galería en vez de subirla aparte: la
                  representativa casi siempre ES una de las que ya están, y
                  subirla dos veces deja dos copias que luego no coinciden. */}
              {fotos.length > 0 && (
                <select className="es-sel" value=""
                  onChange={e => e.target.value &&
                    corre("port", () => portadaSecuencia(secuenciaId, e.target.value))}>
                  <option value="">— elegir de la galería —</option>
                  {fotos.map((f, i) => (
                    <option key={f.id} value={f.url}>{f.pie?.trim() || `foto ${i + 1}`}</option>
                  ))}
                </select>
              )}
              {portada && (
                <button type="button" className="dato-btn" disabled={!!ocupado}
                  onClick={() => corre("port", () => portadaSecuencia(secuenciaId, null))}>
                  quitar
                </button>
              )}
            </div>
          </div>

          <div className="sqf-h">
            🖼 Galería
            <span>Con su pie: una foto de la que nadie sabe qué enseña es una foto que nadie mira.</span>
          </div>
          <div className="sqf-fotos">
            {fotos.map(f => (
              <div key={f.id} className="sqf-foto">
                <img src={f.url} alt={f.pie || ""} />
                <input defaultValue={f.pie || ""} placeholder="qué enseña"
                  onBlur={e => e.target.value !== (f.pie || "") &&
                    corre("pie", () => pieFotoSecuencia(f.id, tratamientoId, e.target.value))} />
                <button type="button" className="dato-btn" disabled={!!ocupado}
                  title="Quitar esta foto"
                  onClick={() => corre("foto", () => quitarFotoSecuencia(f.id, tratamientoId))}>✕</button>
              </div>
            ))}
            {!fotos.length && <span className="sqf-no">Todavía ninguna.</span>}
          </div>
          <EditorImagenes imgs={nuevas} setImgs={setNuevas} max={8} onError={setError} />
          {nuevas.length > 0 && (
            <button type="button" className="btn" style={{ padding: "5px 12px", fontSize: 12 }}
              disabled={!!ocupado}
              onClick={async () => {
                if (await corre("fotos", () => sumarFotosSecuencia(secuenciaId, nuevas))) setNuevas([]);
              }}>
              Guardar {nuevas.length} en la galería
            </button>
          )}
        </div>
      )}

      {/* ══ QUIÉN SALE ══ */}
      {panel === "gente" && (
        <div className="sqf-panel">
          <div className="sqf-h">
            🫂 Quién sale
            <span>Del reparto de la película. ★ marca a quien LLEVA la secuencia.</span>
          </div>
          {reparto.length === 0
            ? <span className="sqf-no">
                Esta película todavía no tiene reparto cargado. Se añade en la ficha del
                proyecto, y desde ahí aparece aquí.
              </span>
            : (
              <div className="sqf-gente">
                {reparto.map(p => {
                  const on = dentro.has(p.id);
                  const pri = !!dentro.get(p.id);
                  return (
                    <span key={p.id} className={`sqf-pers${on ? " on" : ""}`}>
                      <button type="button" className="sqf-pers-b" disabled={!!ocupado}
                        title={on ? "Quitar de esta secuencia" : "Poner en esta secuencia"}
                        onClick={() => corre("act", () => marcarActorSecuencia(secuenciaId, p.id, !on))}>
                        <Avatar size={20} nombre={p.nombre} src={p.avatar} color={p.color} />
                        {p.nombre}
                        {p.rol && <i>{p.rol}</i>}
                      </button>
                      {/* La estrella solo cuando ya está dentro: marcar como
                          principal a quien no sale es una acción sin sentido
                          que ocupa sitio en veinte filas. */}
                      {on && (
                        <button type="button" className={`sqf-pri${pri ? " on" : ""}`}
                          disabled={!!ocupado}
                          title={pri ? "Ya no lleva la secuencia" : "Lleva la secuencia"}
                          onClick={() => corre("pri",
                            () => principalActorSecuencia(secuenciaId, p.id, !pri))}>★</button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* ══ EL RENDER ══ */}
      {panel === "render" && (
        <div className="sqf-panel">
          <div className="sqf-h">
            🎬 El render en Drive
            <span>Cada subida es una versión nueva: la anterior no se pisa.</span>
          </div>
          <div className="sqf-rend-form">
            <input value={rUrl} onChange={e => setRUrl(e.target.value)}
              placeholder="https://drive.google.com/… (obligatorio)" style={{ flex: "2 1 260px" }} />
            <input value={rDur} onChange={e => setRDur(e.target.value)}
              placeholder="3:42" style={{ flex: "0 1 80px" }} title="Cuánto dura este corte" />
            <input value={rNota} onChange={e => setRNota(e.target.value)}
              placeholder="qué cambia respecto del anterior" style={{ flex: "2 1 220px" }} />
            <button type="button" className="btn" style={{ padding: "5px 12px", fontSize: 12 }}
              disabled={!!ocupado || !rUrl.trim()}
              onClick={async () => {
                if (await corre("rend", () => subirRenderSecuencia(secuenciaId,
                  { url: rUrl, nota: rNota, duracion: rDur }))) {
                  setRUrl(""); setRNota(""); setRDur("");
                }
              }}>
              {ocupado === "rend" ? "…" : `Guardar v${(renders[0]?.version || 0) + 1}`}
            </button>
          </div>
          <div className="sqf-rends">
            {renders.map((r, i) => (
              <div key={r.id} className={`sqf-rend${i === 0 ? " es-vigente" : ""}`}>
                <b>v{r.version}</b>
                {i === 0 && <span className="sqf-vig">el último</span>}
                <a href={r.url} target="_blank" rel="noreferrer">↗ abrir</a>
                {r.duracion && <span className="sqf-dur">{r.duracion}</span>}
                {r.nota && <i>{r.nota}</i>}
                <span style={{ flex: 1 }} />
                {r.creado_en && <span className="sqf-cuando">{fechaDia(r.creado_en)}</span>}
                {/* «Quitar del historial» y no «borrar»: el render sigue en
                    Drive, y la palabra borrar sobre un vídeo de tres horas de
                    exportación asusta más de lo que debe. */}
                <button type="button" className="dato-btn" disabled={!!ocupado}
                  title="Quitar del historial (el archivo sigue en Drive)"
                  onClick={() => corre("delr", () => borrarRenderSecuencia(r.id, tratamientoId))}>✕</button>
              </div>
            ))}
            {!renders.length && <span className="sqf-no">Todavía ninguno.</span>}
          </div>
        </div>
      )}

      {/* ══ LOS CASOS ══ */}
      {panel === "caso" && (
        <div className="sqf-panel">
          <div className="sqf-h">
            ⚡ El trabajo de esta secuencia
            <span>Los que haga falta: el permiso, la entrevista, el rodaje.</span>
          </div>
          <div className="sqf-casos">
            {casos.map(c => (
              <span key={c.id} className="cr-caso fila-cap">
                <Link href={`/caso/${c.id}`} className="fila-cubre" aria-label="Abrir el caso" />
                <span className="cr-caso-t">{c.titulo || "Caso"}</span>
                {c.estado && (
                  <span className={`pill st-${claseEstado(c.estado, c.tipo || "tarea")}`}
                    style={{ fontSize: 9 }}>{rotuloEstado(c.estado, c.tipo || "tarea")}</span>
                )}
                <button type="button" className="cr-caso-x" disabled={!!ocupado}
                  title="Soltar de la secuencia (el caso no se borra)"
                  onClick={() => corre("soltar", () => soltarCasoDeSecuencia(c.id, tratamientoId))}>✕</button>
              </span>
            ))}
            {!casos.length && <span className="sqf-no">Ninguno todavía.</span>}
          </div>
          <div className="sqf-caso-acc">
            <button type="button" className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
              disabled={!!ocupado}
              title="Abrir un caso con el texto de esta secuencia dentro"
              onClick={() => corre("nuevo", () => casoDesdeSecuencia(secuenciaId))}>
              {ocupado === "nuevo" ? "…" : "＋ Abrir un caso"}
            </button>
            {/* Atar uno que YA existe. Sin esto quedaban dos objetos hablando
                del mismo trabajo —el caso apuntado a mano y la secuencia— sin
                forma de juntarlos. */}
            {libres === null
              ? <button type="button" className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
                  disabled={!!ocupado}
                  onClick={async () => {
                    setOcupado("libres");
                    const r: any = await casosLibresDeSecuencia(secuenciaId);
                    setOcupado("");
                    if (r?.error) { setError(r.error); return; }
                    setLibres(r.casos || []);
                  }}>⛓ Atar uno que ya existe</button>
              : libres.length === 0
                ? <span className="sqf-no">No hay casos sueltos en esta película.</span>
                : <select className="es-sel" value="" style={{ maxWidth: 300 }}
                    onChange={e => e.target.value &&
                      corre("atar", () => atarCasoASecuencia(secuenciaId, e.target.value))}>
                    <option value="">— elegir un caso —</option>
                    {libres.map(c => <option key={c.id} value={c.id}>{c.titulo || "sin título"}</option>)}
                  </select>}
          </div>
        </div>
      )}
    </div>
  );
}
