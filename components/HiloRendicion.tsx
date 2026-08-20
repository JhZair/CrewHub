"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rotuloEstado, claseEstado } from "@/lib/estados";
import { cargarRendicionRapido, comentarRendicion, toggleReaccion, editarComentario,
  casoDeRendicion } from "@/app/actions";
import { anclaRendicion, type TablaRendicion } from "@/lib/rendicionHilo";
import VistaHilo from "@/components/VistaHilo";
import Reacciones, { type Reaccion } from "@/components/Reacciones";

/* ── HABLAR DE LA PLATA — el mismo hilo de la caja, en las cinco tablas ──
 *
 * Facturas, estados de cuenta, RHE, declaraciones juradas y movimientos del
 * banco. La pregunta que esto existe para capturar es siempre la misma —«¿esto
 * qué fue?», «¿este retiro a qué corresponde?»— y hoy se hace por WhatsApp: la
 * respuesta llega, se lee, y no vuelve nunca a la fila, que es exactamente
 * donde hará falta el día de la observación.
 *
 * Sobre VistaHilo, como la vista del apunte de caja y del objeto: el motor de
 * comentarios, menciones, respuestas y reacciones ya existe y es UNO. Aquí no
 * se construye nada, se enchufa.
 *
 * ── UN COMPONENTE, NO CINCO ──
 * Podían ser cinco archivos gemelos. Son uno, con `tabla` como parámetro,
 * porque lo único que cambia entre las cinco ya está descrito en
 * lib/rendicionHilo.ts y la cabecera la pone quien lo usa —que es quien sabe
 * cómo se lee una factura y cómo se lee un estado de cuenta—.
 */
export default function HiloRendicion({ tabla, filaId, cabecera, children }: {
  tabla: TablaRendicion;
  filaId: string;
  /** Cómo se presenta la fila arriba del hilo. Si falta, se usa el rótulo que
   *  arma lib/rendicionHilo (monto · documento · concepto). */
  cabecera?: (d: any) => ReactNode;
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la fila. */
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      ariaLabel="Fila de la rendición"
      tituloCab="🧾 Rendición"
      cargar={() => cargarRendicionRapido(tabla, filaId)}
      /* `fila` y no `!error`: si la migración no está corrida, la acción
         devuelve el nombre del SQL que falta y VistaHilo lo enseña. Un pop-up
         vacío sin explicación haría pensar que nadie ha comentado. */
      listo={(d) => !!d?.fila}
      selComentarios={(d) => d?.comentarios || []}
      selReaccionesPorComentario={(d) => d?.reaccionesPorComentario || {}}
      selPerfiles={(d) => d?.perfiles || []}
      selUserId={(d) => d?.userId || ""}
      /* Igual que en caja: la conversación es de ida y vuelta —«¿y el
         comprobante?» «lo subo mañana»— y sin responder cada mensaje queda
         suelto en la lista. */
      permitirResponder
      onComentar={(texto, respondeA) => comentarRendicion(tabla, filaId, texto, [], respondeA)}
      /* Corregir lo escrito, sin tener que enmendar con un segundo comentario
         que deja el error arriba y la aclaración abajo. La acción comprueba
         que sea el autor; aquí el ✎ solo se le enseña a él. */
      onEditar={(comentarioId, txt) => editarComentario(comentarioId, "", txt)}
      onReaccionarComentario={(comentarioId, emoji) =>
        toggleReaccion(null, comentarioId, emoji, null, null, null, { tabla, id: filaId })}
      reaccionesHilo={(d) => d?.reaccionesHilo || []}
      onReaccionarHilo={(emoji) =>
        toggleReaccion(null, null, emoji, null, null, null, { tabla, id: filaId })}
      textoVacio="Nadie ha preguntado nada de esta fila."
      placeholder="¿Qué fue esto?  (@ para mencionar)"
      cabecera={cabecera || ((d) => (
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--teal)" }}>{d?.titulo}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{d?.etiqueta}</span>
        </div>
      ))}
    >
      {children}
    </VistaHilo>
  );
}

/* ── LA ZONA DE ACCIÓN DE UNA FILA ──
 *
 * Las cinco listas necesitan lo mismo: el chip de reacciones y el botón del
 * hilo, en ese orden y sin descolocar la fila. Escribirlo cinco veces sería
 * garantizar que las cinco acaben con anchos distintos.
 *
 * ── POR QUÉ UNA REJILLA Y NO UN FLEX ──
 * Lección de CajaPanel, y no barata: con `flex`, el ancho de esta zona depende
 * de cuántas reacciones haya, así que las filas comentadas empujan y las demás
 * no — la columna de la derecha deja de estar alineada. Con `grid` de anchos
 * fijos, cada celda ocupa lo suyo tenga contenido o no.
 * `minmax(0,…)` y no un ancho a secas: sin el mínimo en cero, un chip largo
 * desborda la celda en vez de encogerse.
 * Y NUNCA `overflow: hidden` aquí — recorta la paleta de emojis, que es
 * absoluta y sale fuera. Eso ya rompió las reacciones una vez.
 */
export function AccionesFila({ tabla, filaId, reacciones, userId, nComentarios, extra, caso }: {
  tabla: TablaRendicion;
  filaId: string;
  reacciones?: Reaccion[];
  userId: string;
  /** Cuántos comentarios tiene. Se pinta siempre que haya: sin el número, una
   *  conversación de cuatro mensajes es invisible desde la lista. */
  nComentarios?: number;
  /** Lo que la lista quiera añadir a la derecha (editar, borrar…). */
  extra?: ReactNode;
  /** El caso abierto desde esta fila, si lo hay, con su estado para el pill. */
  caso?: { id: string; estado?: string | null; tipo?: string | null } | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");

  /* No navega al crearlo: se queda en la lista y la fila pasa a enseñar
     «📋 caso». Saltar al caso recién creado saca de la revisión a quien va por
     la sexta de veintiséis filas, y volver es empezar otra vez. El enlace
     queda ahí para cuando quiera ir. */
  const abrirCaso = async () => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    const r: any = await casoDeRendicion(tabla, filaId);
    setOcupado(false);
    /* «Ya existía» no es un error: es la respuesta correcta al segundo clic.
       Se dice, y el enlace aparece igual. */
    if (r?.error) { setErr(r.error); if (!r?.id) return; }
    router.refresh();
  };

  return (
    <span style={{
      display: "grid", flex: "none", alignItems: "center", justifyItems: "center",
      /* ── LAS TRES PRIMERAS SE ALINEAN; LA ÚLTIMA SE MIDE ──
         Las columnas fijas están para que reacciones, 💬 y caso queden a la
         misma altura en veintiocho filas seguidas: es lo que deja recorrer una
         lista con la vista sin saltos.
         Pero eran fijas TAMBIÉN para `extra`, y ahí no vale: cada lista mete lo
         suyo —dos botones en las facturas, tres en las obligaciones— y en
         52 px se montaban unos encima de otros. `auto` la hace del tamaño de lo
         que lleva dentro.
         Y la del caso subió de 58 a 74: «＋ caso» con `nowrap` mide más de 58 y
         se desbordaba sobre la celda de al lado. Una celda de ancho fijo con
         contenido que no cabe no recorta ni avisa: pinta encima. */
      gridTemplateColumns: `minmax(0,104px) minmax(0,46px) minmax(0,74px)${extra ? " auto" : ""}`,
      gap: 6,
    }}
      title={err || undefined}>
      {/* Reaccionar SIN abrir nada. Un 👀 es «lo vi, está bien», y es lo que
          más se hace al revisar una rendición: si cuesta tres clics no se
          hace, y el acuse de revisión —que es el dato— se pierde. */}
      <Reacciones pubId={null} compacto rendicion={{ tabla, id: filaId }}
        reacciones={reacciones || []} userId={userId} />

      {/* El botón está para TODO el equipo, no solo para finanzas: quien
          pregunta «¿esta factura de qué es?» es justamente quien no lleva las
          finanzas. Escribir en estas tablas sí está restringido; preguntar
          por ellas no. */}
      <HiloRendicion tabla={tabla} filaId={filaId}>
        {(abrir) => (
          <button className="dato-btn" onClick={abrir}
            title={nComentarios ? `${nComentarios} comentario(s)` : "Preguntar sobre esta fila"}
            style={{ color: nComentarios ? "var(--accent)" : undefined,
              opacity: nComentarios ? 1 : .5, whiteSpace: "nowrap" }}>
            💬{nComentarios ? ` ${nComentarios}` : ""}
          </button>
        )}
      </HiloRendicion>

      {/* ── DE LA FILA AL TRABAJO ──
          Comentar deja constancia; el caso reparte el trabajo. Son dos cosas y
          por eso son dos botones: una observación escrita en el hilo no tiene
          responsable ni plazo ni sale en ningún tablero, y a los tres meses
          nadie recuerda que estaba pendiente.
          Con caso abierto es un ENLACE; sin él, el botón que lo abre — nunca
          los dos, para que no haya que adivinar cuál hace qué. */}
      {caso?.id ? (
        /* ── EL ESTADO ES UN PUNTO, NO UNA PALABRA ──
           Llevaba el rótulo completo dentro de un pill, y «Sin Resolver» no
           cabe en la celda: se desbordaba encima del 💬 de al lado. Es el mismo
           fallo de siempre —contenido `nowrap` en una rejilla de ancho fijo—
           y ensanchar la columna lo habría trasladado a las cinco listas.
           El punto lleva EL MISMO color que el pill del tablero, así que se
           aprende una vez y sirve en las dos pantallas; el rótulo exacto está
           en el título, a un segundo de distancia. Un punto de color dice
           «¿avanza esto?» igual de rápido que la palabra, en una décima del
           ancho. */
        <Link href={`/caso/${caso.id}`} className="dato-btn"
          style={{ color: "var(--accent)", whiteSpace: "nowrap", textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}
          title={caso.estado
            ? `Caso ${rotuloEstado(caso.estado, caso.tipo || "tarea").toLowerCase()} sobre esta fila. El estado dice si alguien está trabajando en ello.`
            : "Hay un caso abierto sobre esta fila."}>
          📋
          {caso.estado && (
            <span className={`st-${claseEstado(caso.estado, caso.tipo || "tarea")}`}
              style={{ width: 7, height: 7, borderRadius: "50%", flex: "none",
                /* El `st-*` trae el color del texto; el punto se pinta con él
                   para no depender de un segundo mapa de colores que se pueda
                   desincronizar del tablero. */
                background: "currentColor" }} />
          )}
        </Link>
      ) : (
        <button className="dato-btn" disabled={ocupado} onClick={abrirCaso}
          title="Abrir un caso para atender esta fila, con responsable y plazo"
          /* Decía `ocupado ? .5 : .5` — un ternario que daba lo mismo por las
             dos ramas, así que el botón no cambiaba de aspecto al pulsarlo y
             parecía que no había pasado nada mientras el caso se creaba. */
          style={{ opacity: ocupado ? .3 : .55, whiteSpace: "nowrap" }}>＋ caso</button>
      )}

      {extra}
    </span>
  );
}

/* ── EL MODO DEGRADADO SE ANUNCIA ──
 * Sin db/rendicion-interaccion.sql, el 💬 abre un hilo que no puede guardar
 * nada y el 👀 no se registra. Callarlo deja botones que no hacen nada sin
 * decir por qué, y eso no enseña a correr el SQL: enseña a desconfiar de toda
 * la pantalla. Un modo degradado que no se anuncia es una avería disfrazada de
 * funcionamiento normal. */
export function AvisoHilo({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div style={{
      color: "var(--yellow)", fontSize: 11.5, margin: "0 0 8px",
      padding: "5px 9px", borderRadius: 7,
      background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)",
    }}>
      ⚠ {error} Mientras tanto se puede leer todo, pero no comentar ni reaccionar.
    </div>
  );
}

/* El `id` del DOM de una fila, para que el aviso aterrice en ella. Sale del
   mismo sitio que la URL del aviso (lib/rendicionHilo) — si cada uno se
   inventara el suyo, el aviso llegaría a la pantalla correcta y no saltaría a
   ninguna fila, sin error y sin efecto. */
export const idFila = (tabla: TablaRendicion, filaId: string) => anclaRendicion(tabla, filaId);
