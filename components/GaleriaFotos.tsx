"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VisorFotos from "@/components/VisorFotos";
import { agregarFotos, ponerPieFoto, quitarFoto, moverFoto, guardarImagenEntidad } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS } from "@/lib/prepararImagen";
import { ATRIBUTO, meToca } from "@/lib/destinoPaste";

/* ══════════════════════════════════════════════════════════════════════════
   📷 LA GALERÍA DE UNA COSA

   El cartel de 84×84 sirve para reconocer un equipo en una lista de
   trescientos, y para nada más. Lo que hace falta saber de un «Soporte De
   Pecho Para Cámara» no cabe ahí: cómo se monta, qué trae en la caja, dónde
   está el número de serie, cuál de los dos cables es el bueno.

   ── UNA TIRA, NO UNA PESTAÑA ──
   Va debajo de la cabecera y se ve sin buscarla. Una pestaña más que hay que
   saber que existe es una pestaña que nadie abre — y estas fotos las mira
   quien está delante del equipo con una duda, no quien viene a explorar.

   ── EL PIE DE FOTO ES LA MITAD DEL ASUNTO ──
   Doce fotos parecidas de un arnés negro no informan de nada. «Así va montado»
   sí. Por eso el pie se edita EN el visor, mirando la foto: escribirlo desde
   una miniatura de 56 px es escribir a ciegas.

   ── LAS TRES PUERTAS PARA SUBIR ──
   Botón, arrastrar y Ctrl+V, como la portada de una entidad. El Ctrl+V solo
   cuando el ratón está encima de la tira: pegar es un gesto global y sin ese
   guardia una foto copiada para otra cosa acaba en el equipo que había abierto
   en otra pestaña.

   ⚠ Se COMPRIME antes de subir. `subirImagen` rebota a los 3 MB y una foto de
   móvil pesa ocho: sin esto, el aviso es «Máximo 3MB por imagen» delante de
   alguien que no puede hacer nada al respecto. `prepararImagen` la deja en
   1600 px WebP, que para mirar un número de serie sobra.
   ══════════════════════════════════════════════════════════════════════════ */

export type FotoFila = { id: string; url: string; pie?: string | null };

export default function GaleriaFotos({ tipo, entidadId, fotos, abrirEn }: {
  tipo: string;
  entidadId: string;
  fotos: FotoFila[];
  /** Índice por el que abrir el visor NADA MÁS MONTAR. Sale de `?foto=N`, y su
   *  razón de ser es que un enlace se pueda mandar por chat: «mira la foto 3
   *  del A-540». Solo funciona en carga fresca, que es como llega un enlace
   *  compartido — dentro de la aplicación, una navegación suave a la misma
   *  ruta con otro query no remonta esto y el valor no se vuelve a leer. Por
   *  eso el cartel de la cabecera usa un ancla `#fotos` y no el query. */
  abrirEn?: number | null;
}) {
  const router = useRouter();
  /* Solo el valor INICIAL: `router.refresh()` repinta este componente sin
     desmontarlo, así que un `abrirEn` que siguiera mandando reabriría el visor
     cada vez que se guarda un pie de foto. */
  const [viendo, setViendo] = useState<number | null>(abrirEn ?? null);

  /* Al cerrar, fuera el `?foto=` de la barra de direcciones. Si se queda, el
     visor vuelve a abrirse solo al recargar o al volver con Atrás, y eso se
     lee como que la pantalla no obedece. `history.replaceState` y no
     `router.replace`: no hace falta que el servidor repinte nada — la URL es
     lo único que sobra, y una navegación suave por esto costaría un viaje. */
  const cerrar = () => {
    /* ⚠ El pie se guarda al SALIR del campo, y cerrar desmonta el input sin
       que React dispare `blur`: lo escrito se perdía sin avisar. Quitarle el
       foco a mano antes de cerrar hace que el `onBlur` corra y se guarde. */
    if (typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
    setViendo(null);
    if (typeof window !== "undefined" && window.location.search.includes("foto=")) {
      const u = new URL(window.location.href);
      u.searchParams.delete("foto");
      window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    }
  };
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** Qué foto está preguntando si de verdad se quita. `null` = ninguna. */
  const [borrando, setBorrando] = useState<string | null>(null);
  const zona = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  async function sumar(files: FileList | File[] | null) {
    const todos = [...(files || [])];
    const lista = todos.filter(f => f.type.startsWith("image/"));
    /* Lo que ni siquiera era una imagen se DICE. Arrastrar un PDF a la tira no
       hacía nada y no avisaba de nada: se salía en silencio y quien lo soltó
       se queda mirando una lista que no cambió. */
    const noImagen = todos.filter(f => !f.type.startsWith("image/")).map(f => f.name);
    if (!lista.length) {
      setMsg(noImagen.length ? `⚠ Aquí solo entran imágenes — ${noImagen.join(", ")}` : null);
      return;
    }
    setOcupado(true); setMsg(null);
    const urls: string[] = [];
    const fallos: string[] = [];
    for (const f of lista) {
      /* Una a una y no en paralelo: `prepararImagen` dibuja en un canvas, y
         diez canvas a la vez con fotos de doce megapíxeles ahogan un teléfono.
         Además así el que falla se puede nombrar. */
      const lista1 = await prepararImagen(f, MEDIDAS.galeria);
      const r = await subirImagen(lista1);
      if (r.url) urls.push(r.url); else fallos.push(`${f.name}: ${r.error || "no subió"}`);
    }
    if (urls.length) {
      const g: any = await agregarFotos(tipo, entidadId, urls);
      if (g?.error) {
        setOcupado(false);
        /* Los nombres de las que no subieron se van CON el error, no se
           pierden: es el único sitio donde estaban. */
        setMsg(`⚠ ${g.error}${fallos.length ? ` · además no subieron: ${fallos.join(" · ")}` : ""}`);
        return;
      }
    }
    setOcupado(false);
    /* Lo que NO entró se dice con nombre. Subir ocho y que aparezcan siete es
       el fallo que se descubre semanas después, buscando la que falta. */
    const sobras = [...fallos, ...noImagen.map(n => `${n}: no es una imagen`)];
    setMsg(sobras.length
      ? `⚠ ${urls.length} de ${todos.length} · no entraron: ${sobras.join(" · ")}`
      : null);
    if (urls.length) router.refresh();
  }

  /* ⚠ EL PEGADO SE REPARTE, y hay que decir que este es un destino. Sin la
     marca `data-paste-destino`, la cabecera de la ficha se llevaba el Ctrl+V
     ADEMÁS de la galería: la misma foto entraba aquí y encima se ponía de
     banner o de cartel. Dos escrituras que nadie pidió, y una cambiaba la cara
     de la ficha. Quién se lo lleva se decide MIRANDO quién está bajo el ratón
     en ese instante (lib/destinoPaste), no con una bandera que alguien tenga
     que acordarse de bajar.
     Y no se mira `sobre`: ese estado puede quedarse pegado si el `mouseleave`
     nunca llega —el diálogo de archivos del sistema, el visor abriéndose
     encima— y entonces la galería se quedaría con pegados de otros sitios. */
  useEffect(() => {
    const pegar = (e: ClipboardEvent) => {
      if (ocupado || !meToca("galeria")) return;
      /* Si el foco está en una caja de texto, ese pegado es del texto. Lo
         hacen los otros tres destinos y faltaba aquí. */
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
      if (!fs.length) return;
      e.preventDefault();
      sumar(fs);
    };
    window.addEventListener("paste", pegar);
    return () => window.removeEventListener("paste", pegar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, tipo, entidadId]);

  async function conRefresco(fn: () => Promise<any>) {
    setOcupado(true); setMsg(null);
    const r: any = await fn();
    setOcupado(false);
    if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
    router.refresh();
  }

  const hay = fotos.length > 0;

  return (
    <div className="gal" id="fotos" ref={zona}
      {...{ [ATRIBUTO]: "galeria" }}
      /* Al salir se cierra la pregunta de borrar: era la única de las dos que
         no se reiniciaba nunca —se quedaba tapando la miniatura hasta que
         alguien la pulsara, sobreviviendo a un refresco—. */
      onMouseLeave={() => setBorrando(null)}
      onDragOver={e => { e.preventDefault(); }}
      /* `ocupado` también aquí. El botón ya estaba protegido, pero arrastrar y
         pegar no: soltar un segundo lote mientras sube el primero lanzaba dos
         `sumar` en paralelo, y los dos leían el mismo `orden` de partida. */
      onDrop={e => { e.preventDefault(); if (!ocupado) sumar(e.dataTransfer?.files || null); }}>

      <div className="gal-h">
        <span className="gal-t">📷 Fotos{hay ? ` · ${fotos.length}` : ""}</span>
        <button type="button" className="dato-btn" disabled={ocupado}
          onClick={() => input.current?.click()}>
          {ocupado ? "Subiendo…" : "＋ Añadir"}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden
          onChange={e => { sumar(e.target.files); e.currentTarget.value = ""; }} />
        {/* El vacío DICE para qué sirve. «Sin fotos» a secas es un hueco;
            esto es una invitación con un ejemplo concreto. */}
        {!hay && !ocupado && (
          <span className="gal-vacio">
            Cómo se monta, qué trae la caja, dónde está el número de serie.
            Arrastra aquí o pega con Ctrl+V.
          </span>
        )}
        {msg && <span className="gal-msg">{msg}</span>}
      </div>

      {hay && (
        <div className="gal-tira">
          {fotos.map((f, i) => (
            /* Un `div` y no un `button`: la ✕ es un botón y un botón dentro de
               otro es HTML inválido que el navegador reordena al parsear. */
            <div key={f.id} className="gal-mini">
              <button type="button" className="gal-abrir"
                title={f.pie || "Ver"} onClick={() => setViendo(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.pie || ""} loading="lazy" decoding="async" />
                {/* El pie, encima y recortado. Con doce fotos parecidas es lo
                    único que las distingue sin abrirlas una por una. */}
                {f.pie && <span className="gal-pie">{f.pie}</span>}
              </button>
              {/* ── QUITAR, DESDE LA MINIATURA ──
                  Estaba solo dentro del visor, y ahí hay que saber que existe:
                  abrir la foto, mirar abajo, encontrar la barra. Quien quiere
                  borrar una foto la busca en la tira y espera una ✕ ahí.
                  Con confirmación, porque no hay deshacer: la foto se va y
                  volver a ponerla es volver a subirla. */}
              {borrando === f.id ? (
                /* El MISMO vocabulario que la barra del visor: «¿quitar?» y
                   sí/no. La misma acción se llamaba «quitar» aquí y «sí» a
                   cuatro centímetros, en la otra puerta de lo mismo. */
                <span className="gal-conf" role="alertdialog" aria-label="¿Quitar esta foto?">
                  <b>¿quitar?</b>
                  <span>
                    <button type="button" disabled={ocupado}
                      onClick={() => conRefresco(async () => {
                        const r = await quitarFoto(f.id);
                        if (!(r as any)?.error) setBorrando(null);
                        return r;
                      })}>sí</button>
                    {" / "}
                    <button type="button" onClick={() => setBorrando(null)}>no</button>
                  </span>
                </span>
              ) : (
                <button type="button" className="gal-x" title="Quitar esta foto"
                  aria-label="Quitar esta foto" onClick={() => setBorrando(f.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {viendo !== null && fotos[Math.min(viendo, fotos.length - 1)] && (() => {
        const act = fotos[Math.min(viendo, fotos.length - 1)];
        return (
          <VisorFotos fotos={fotos.map(f => ({ url: f.url, pie: f.pie }))}
            desde={viendo} alCerrar={cerrar} alCambiar={setViendo}
            /* ── LO QUE SE HACE CON LA FOTO QUE SE ESTÁ MIRANDO ──
               DENTRO del visor. Estuvo fuera un rato, con el argumento de que
               «el visor es de ver»: quedaba debajo del velo del 86 %, sin
               clics, y pulsarla cerraba el visor. Un razonamiento bonito no
               vale si el resultado no se puede tocar. */
            barra={
              <BarraFoto f={act} i={Math.min(viendo, fotos.length - 1)} total={fotos.length}
                ocupado={ocupado}
                onPie={pie => conRefresco(() => ponerPieFoto(act.id, pie))}
                onMover={h => conRefresco(async () => {
                  const r = await moverFoto(act.id, h);
                  if (!(r as any)?.error) {
                    setViendo(v => (v === null ? v : h === "antes" ? Math.max(0, v - 1) : Math.min(fotos.length - 1, v + 1)));
                  }
                  return r;
                })}
                onCartel={() => conRefresco(() => guardarImagenEntidad(tipo, entidadId, "cartel", act.url))}
                onQuitar={() => conRefresco(async () => {
                  const r = await quitarFoto(act.id);
                  /* Se cierra: la foto que se miraba ya no existe, y dejarlo
                     abierto enseñaría la siguiente como si nada. */
                  if (!(r as any)?.error) cerrar();
                  return r;
                })} />
            } />
        );
      })()}

    </div>
  );
}

function BarraFoto({ f, i, total, ocupado, onPie, onMover, onCartel, onQuitar }: {
  f: FotoFila; i: number; total: number; ocupado: boolean;
  onPie: (pie: string) => void;
  onMover: (hacia: "antes" | "despues") => void;
  onCartel: () => void;
  onQuitar: () => void;
}) {
  const [pie, setPie] = useState(f.pie || "");
  const [confirmando, setConfirmando] = useState(false);
  /* El texto se resincroniza al CAMBIAR DE FOTO, no en cada render: si se
     copiara del servidor siempre, escribir un pie se borraría solo en cuanto
     `router.refresh()` trajera la fila vieja. */
  useEffect(() => { setPie(f.pie || ""); setConfirmando(false); }, [f.id, f.pie]);

  return (
    <div className="gal-barra">
      <input className="ent-lote-inp" value={pie} disabled={ocupado}
        placeholder="¿Qué enseña esta foto? «así va montado el arnés»"
        onChange={e => setPie(e.target.value)}
        onBlur={() => { if ((pie || "") !== (f.pie || "")) onPie(pie); }}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <button type="button" className="dato-btn" disabled={ocupado || i === 0}
        title="Moverla un puesto hacia el principio" onClick={() => onMover("antes")}>◀</button>
      <button type="button" className="dato-btn" disabled={ocupado || i === total - 1}
        title="Moverla un puesto hacia el final" onClick={() => onMover("despues")}>▶</button>
      <button type="button" className="dato-btn" disabled={ocupado}
        title="Ponerla como cartel: la miniatura con la que este equipo se reconoce en las listas"
        onClick={onCartel}>🖼 Hacer cartel</button>
      {/* Con confirmación, porque no hay deshacer. La foto se va de la galería
          y volver a ponerla es volver a subirla. */}
      {confirmando ? (
        <span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
          ¿quitar? <button type="button" style={{ color: "var(--red)", fontWeight: 700 }}
            disabled={ocupado} onClick={onQuitar}>sí</button>
          {" / "}<button type="button" style={{ color: "var(--dim)" }}
            onClick={() => setConfirmando(false)}>no</button>
        </span>
      ) : (
        <button type="button" className="dato-btn" style={{ color: "var(--red)" }}
          disabled={ocupado} title="Quitarla de la galería" onClick={() => setConfirmando(true)}>✕</button>
      )}
    </div>
  );
}
