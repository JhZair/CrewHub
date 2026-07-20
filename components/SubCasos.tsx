"use client";
import { crearSubCaso, asignarResponsable, cambiarFechaLimite, cambiarEstado } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { claseEstado, textoEstado, icoEstado, opcionesEstado } from "@/lib/estados";
import { celebrarResuelto } from "@/lib/celebra";
import { CERRADOS } from "@/lib/familia";
import { plazoDe } from "@/lib/plazo";
import MiniSelect from "@/components/MiniSelect";
import FechaMini from "@/components/FechaMini";
import { sinBot } from "@/lib/personas";

/* Los hijos de un caso largo: lista con progreso + alta rápida.
   (Tenía su propio mapa de estados —otra copia de lib/estados, sin íconos y
   sin saber de avisos—. Ahora se importa.)

   RESPONSABLE Y FECHA AL VUELO
   Un caso puede traer veinte sub-casos (los de «Observaciones Festival Ñawi»
   son veinte) y repartirlos obligaba a entrar en cada uno, asignar, volver.
   Veinte veces dos viajes. La referencia es Trello: un reloj y un avatar al
   final de la línea, del tamaño de la línea — no un formulario. */

export default function SubCasos({ padreId, hijos, perfiles = [] }: {
  padreId: string;
  hijos: any[];
  /** `corto` es «MichelM» — el alias que usa el equipo, cruzado desde
   *  `personas.alias` en la página del caso. `perfiles` (la cuenta) solo
   *  guarda el nombre largo. */
  perfiles?: { id: string; nombre: string; corto?: string }[];
}) {
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  /* Qué filas están guardando AHORA. Es una lista y no un `string | null`
     porque repartir veinte sub-casos es ir de fila en fila sin esperar: con
     un candado global, tocar la fila B mientras la A guardaba se comía el
     clic en silencio —ni acción, ni error, ni nada—. Cada fila se bloquea a
     sí misma; las demás siguen vivas. */
  const [guardando, setGuardando] = useState<string[]>([]);
  const router = useRouter();

  /* «Cerrado» = resuelta O archivada, y esa decisión vive en lib/familia:
     archivar es una forma de cerrar, no de olvidar. Estaba escrita a mano
     dos veces en este mismo archivo. */
  const resueltos = hijos.filter(h => CERRADOS.includes(h.estado)).length;

  /* El menú lleva nombres largos —ahí se elige, y hay que reconocer a quién—;
     el botón lleva el corto. Son dos trabajos distintos. */
  const equipo = sinBot(perfiles);
  const OPC_RESP: [string, string][] = [
    ["", "Sin asignar"],
    ...equipo.map(p => [p.id, p.nombre] as [string, string]),
  ];
  /* Ojo con el que NO está: `perfiles` viene filtrado por `activo`, así que un
     sub-caso asignado a alguien dado de baja no encuentra su nombre. Antes
     eso pintaba un guion en teal —indistinguible de un dato normal—. Ahora lo
     dice: hay dueño, pero ya no está. Es lo contrario de «sin asignar». */
  const cortoDe = (id: string) => equipo.find(p => p.id === id)?.corto || "";
  const inactivo = (id: string) => !!id && !equipo.some(p => p.id === id);

  const crear = async () => {
    if (!titulo.trim() || creando) return;
    setCreando(true); setError("");
    const res = await crearSubCaso(padreId, titulo.trim());
    setCreando(false);
    if (res?.error) { setError(res.error); return; }
    setTitulo("");
    router.refresh();
  };

  /* Un solo camino para los dos cambios al vuelo: bloquear SU fila, llamar,
     y si falla DECIRLO. El error va arriba, no en un alert. */
  const alVuelo = async (id: string, fn: () => Promise<any>) => {
    if (guardando.includes(id)) return;   // solo su propia fila, no todas
    setGuardando(g => [...g, id]); setError("");
    const res: any = await fn();
    setGuardando(g => g.filter(x => x !== id));
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="panel-h" style={{ margin: 0 }}>🧩 Sub-casos · {hijos.length}</div>
        {hijos.length > 0 && (
          <span className="badge" style={{
            color: resueltos === hijos.length ? "var(--green)" : "var(--muted)",
            background: "#1c1c2c",
          }}>✅ {resueltos}/{hijos.length}</span>
        )}
      </div>
      {error && <div className="err-inline">⚠ {error}</div>}

      {hijos.map((h: any) => (
        <div className="info-row sc-fila" key={h.id}>
          {/* EL ESTADO MANDA DESDE LA IZQUIERDA.
              Aquí había un ○/✅ decorativo y, al final de la fila, una pastilla
              «Sin Resolver» — el mismo dato dos veces, a dos resoluciones, y
              repetido veinte veces. Ahora es UNA cosa: el ícono real del
              estado (📥 🛠 🔭 ⏸ ✅ 🗄, los de lib/estados) y además el control
              para cambiarlo. Va a la izquierda porque es la columna por la que
              el ojo baja cuando repasas veinte líneas. */}
          <MiniSelect value={h.estado} options={opcionesEstado(h.tipo, h.estado)}
            etiqueta={icoEstado(h.estado, h.tipo)}
            onSelect={v => alVuelo(h.id, async () => {
              const r = await cambiarEstado(h.id, v);
              if (!r?.error && v === "resuelta" && h.estado !== "resuelta") celebrarResuelto();
              return r;
            })}
            buttonClass={`sc-est st-${claseEstado(h.estado, h.tipo)}`}
            /* gap 2: el ícono y el ▾ tienen que caber en 38 px */
            buttonStyle={{ gap: 2 }} />
          <Link href={`/caso/${h.id}`} style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
            title={textoEstado(h.estado, h.tipo)}>
            {h.titulo} →
          </Link>
          {/* Los dos controles al vuelo, en el orden de Trello: primero cuándo,
              después quién. Se ven siempre —no escondidos tras un hover—:
              repartir veinte sub-casos es ir de fila en fila, y algo que solo
              aparece al pasar el cursor no se puede recorrer. */}
          <FechaMini valor={h.fecha_limite || null} ocupado={guardando.includes(h.id)}
            tituloVacio="Poner fecha límite"
            /* El color de plazo se calcula AQUÍ y se pasa: con el estado, para
               que un sub-caso cerrado no pinte «vencido» en rojo. */
            color={plazoDe(h.fecha_limite || null, h.estado)?.color ?? null}
            onCambia={v => alVuelo(h.id, () => cambiarFechaLimite(h.id, v))} />
          {/* Vacío: un 🙋 fantasma, no un 👤. El 👤 ya está tomado — es
              `ICO_ENT.persona`, la persona VINCULADA al caso, y es el ícono
              del picker de la bandeja de arriba. Una persona vinculada no es
              quien lleva el caso. El sistema ya tenía su glifo para esto y
              yo no lo usé: «🙋 Mis asuntos» en el feed y el tablero, «🙋 N
              casos sin responsable — un caso huérfano es de todos» en la
              portada, «🙋 Sin responsable» en /pulso. 🙋 es quien levanta la
              mano.
              «Sin asignar» escrito veinte veces era la mitad del ruido de
              esta lista — un hueco no necesita frase. */}
          <MiniSelect value={h.responsable || ""} options={OPC_RESP}
            etiqueta={!h.responsable ? "🙋" : inactivo(h.responsable) ? "⚠ de baja" : cortoDe(h.responsable)}
            onSelect={v => alVuelo(h.id, () => asignarResponsable(h.id, v || null))}
            buttonClass={`sc-btn${h.responsable ? (inactivo(h.responsable) ? " puesto baja" : " puesto resp") : ""}`} />
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={titulo} placeholder="＋ Nuevo sub-caso (hereda los vínculos del padre)..."
          onChange={e => setTitulo(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") crear(); }}
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", outline: "none", fontSize: 13, color: "var(--text)" }} />
        <button className="btn" disabled={!titulo.trim() || creando} onClick={crear}>
          {creando ? "..." : "Crear"}
        </button>
      </div>
    </div>
  );
}
